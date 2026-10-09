import { afterEach, describe, expect, it, vi } from 'vitest';
import { EngineError, STARTING_FEN, UciEngine, type UciTransport } from '../src';

/**
 * Scripted transport used to exercise protocol edge cases (timeouts, crashes,
 * cancellation) that are impractical to trigger with the real engine.
 */
class ScriptedTransport implements UciTransport {
  sent: string[] = [];
  terminated = false;
  private lines = new Set<(line: string) => void>();
  private errors = new Set<(error: Error) => void>();
  constructor(private readonly respond: (command: string, t: ScriptedTransport) => void = defaultResponder) {}
  send(command: string) {
    this.sent.push(command);
    queueMicrotask(() => this.respond(command, this));
  }
  onLine(listener: (line: string) => void) {
    this.lines.add(listener);
    return () => this.lines.delete(listener);
  }
  onError(listener: (error: Error) => void) {
    this.errors.add(listener);
    return () => this.errors.delete(listener);
  }
  terminate() {
    this.terminated = true;
  }
  emit(line: string) {
    for (const l of [...this.lines]) l(line);
  }
  crash(message: string) {
    for (const l of [...this.errors]) l(new Error(message));
  }
}

function defaultResponder(command: string, t: ScriptedTransport) {
  if (command === 'uci') {
    t.emit('id name FakeFish 1');
    t.emit('id author Tests');
    t.emit('uciok');
  } else if (command === 'isready') {
    t.emit('readyok');
  } else if (command.startsWith('go')) {
    t.emit('info depth 5 multipv 1 score cp 20 pv e2e4 e7e5');
    t.emit('bestmove e2e4 ponder e7e5');
  }
}

const request = { startFen: STARTING_FEN, moves: [], limits: { movetimeMs: 100 } };

afterEach(() => {
  vi.useRealTimers();
});

describe('UciEngine', () => {
  it('performs the handshake and reports identity', async () => {
    const engine = new UciEngine(new ScriptedTransport());
    await expect(engine.init()).resolves.toEqual({ name: 'FakeFish 1', author: 'Tests' });
  });

  it('sends skill level, position and go, and returns the best move with info', async () => {
    const t = new ScriptedTransport();
    const engine = new UciEngine(t);
    const result = await engine.bestMove({ ...request, moves: ['d2d4'], skillLevel: 5 });
    expect(result).toEqual({ bestMove: 'e2e4', ponder: 'e7e5', info: { depth: 5, multipv: 1, score: { type: 'cp', value: 20 }, pv: ['e2e4', 'e7e5'] } });
    expect(t.sent).toContain('setoption name Skill Level value 5');
    expect(t.sent).toContain(`position fen ${STARTING_FEN} moves d2d4`);
    expect(t.sent).toContain('go movetime 100');
  });

  it('only resends the skill level when it changes', async () => {
    const t = new ScriptedTransport();
    const engine = new UciEngine(t);
    await engine.bestMove({ ...request, skillLevel: 3 });
    await engine.bestMove({ ...request, skillLevel: 3 });
    expect(t.sent.filter((c) => c.startsWith('setoption')).length).toBe(1);
  });

  it('serialises concurrent requests', async () => {
    const t = new ScriptedTransport();
    const engine = new UciEngine(t);
    const results = await Promise.all([engine.bestMove(request), engine.bestMove(request), engine.bestMove(request)]);
    expect(results.map((r) => r.bestMove)).toEqual(['e2e4', 'e2e4', 'e2e4']);
    expect(t.sent.filter((c) => c.startsWith('go')).length).toBe(3);
  });

  it('returns null when there is no legal move', async () => {
    const t = new ScriptedTransport((command, tr) => {
      if (command.startsWith('go')) tr.emit('bestmove (none)');
      else defaultResponder(command, tr);
    });
    await expect(new UciEngine(t).bestMove(request)).resolves.toEqual({ bestMove: null });
  });

  it('rejects invalid requests without breaking the engine', async () => {
    const engine = new UciEngine(new ScriptedTransport());
    await expect(engine.bestMove({ ...request, limits: {} })).rejects.toMatchObject({ code: 'invalid-request' });
    await expect(engine.bestMove({ ...request, skillLevel: 42 })).rejects.toMatchObject({ code: 'invalid-request' });
    await expect(engine.bestMove(request)).resolves.toMatchObject({ bestMove: 'e2e4' });
  });

  it('fails with init-timeout when the engine never answers', async () => {
    vi.useFakeTimers();
    const t = new ScriptedTransport(() => undefined);
    const engine = new UciEngine(t, { initTimeoutMs: 1000 });
    const pending = engine.init();
    vi.advanceTimersByTime(1001);
    await expect(pending).rejects.toMatchObject({ code: 'init-timeout' });
    expect(t.terminated).toBe(true);
    await expect(engine.bestMove(request)).rejects.toBeInstanceOf(EngineError);
  });

  it('fails with search-timeout when a search hangs', async () => {
    vi.useFakeTimers();
    const t = new ScriptedTransport((command, tr) => {
      if (!command.startsWith('go')) defaultResponder(command, tr);
    });
    const engine = new UciEngine(t, { searchGraceMs: 500 });
    const pending = engine.bestMove(request);
    const assertion = expect(pending).rejects.toMatchObject({ code: 'search-timeout' });
    await vi.advanceTimersByTimeAsync(700);
    await assertion;
  });

  it('rejects pending work when the transport crashes', async () => {
    const t = new ScriptedTransport((command, tr) => {
      if (command.startsWith('go')) tr.crash('worker died');
      else defaultResponder(command, tr);
    });
    const engine = new UciEngine(t);
    await expect(engine.bestMove(request)).rejects.toMatchObject({ code: 'crashed' });
    await expect(engine.bestMove(request)).rejects.toMatchObject({ code: 'crashed' });
  });

  it('supports cancellation via AbortSignal', async () => {
    const controller = new AbortController();
    const t = new ScriptedTransport((command, tr) => {
      if (command === 'stop') tr.emit('bestmove a2a3');
      else if (!command.startsWith('go')) defaultResponder(command, tr);
    });
    const engine = new UciEngine(t);
    const pending = engine.bestMove({ ...request, signal: controller.signal });
    await vi.waitFor(() => expect(t.sent.some((c) => c.startsWith('go'))).toBe(true));
    controller.abort();
    await expect(pending).rejects.toMatchObject({ code: 'aborted' });
    // The engine stays usable after a cancelled search.
    const goCount = t.sent.filter((c) => c.startsWith('go')).length;
    const t2Result = engine.bestMove(request);
    await vi.waitFor(() => expect(t.sent.filter((c) => c.startsWith('go')).length).toBe(goCount + 1));
    t.emit('bestmove h2h3');
    await expect(t2Result).resolves.toMatchObject({ bestMove: 'h2h3' });
  });

  it('rejects everything after dispose', async () => {
    const t = new ScriptedTransport();
    const engine = new UciEngine(t);
    await engine.init();
    engine.dispose();
    expect(t.terminated).toBe(true);
    await expect(engine.bestMove(request)).rejects.toMatchObject({ code: 'disposed' });
  });
});
