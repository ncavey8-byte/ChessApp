import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  ChessPosition,
  DIFFICULTY_PRESETS,
  UciEngine,
  applyEngineMove,
  applyPlayerMove,
  createSession,
  isEnginesTurn,
  sessionPgn,
  type GameSession,
} from '../../src';
import { createNodeStockfishTransport } from '../helpers/node-stockfish';

let engine: UciEngine;

beforeAll(async () => {
  engine = new UciEngine(await createNodeStockfishTransport());
  await engine.init();
}, 60_000);

afterAll(() => engine?.dispose());

function unwrap<T>(result: { ok: true; value: T } | { ok: false; error: string }): T {
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

/** Deterministic pseudo-random generator so failures are reproducible. */
function rng(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2 ** 31;
    return state / 2 ** 31;
  };
}

async function engineTurn(session: GameSession): Promise<GameSession> {
  const preset = DIFFICULTY_PRESETS[session.difficulty - 1]!;
  const { bestMove } = await engine.bestMove({
    startFen: session.position.record.startFen,
    moves: session.position.record.moves,
    skillLevel: preset.skillLevel,
    limits: preset.limits,
  });
  expect(bestMove).not.toBeNull();
  return unwrap(applyEngineMove(session, bestMove!));
}

describe('real Stockfish engine', () => {
  it('identifies itself as Stockfish', async () => {
    await expect(engine.init()).resolves.toMatchObject({ name: expect.stringContaining('Stockfish') });
  });

  it('finds mate in one', async () => {
    const result = await engine.bestMove({ startFen: '6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1', moves: [], limits: { depth: 6 } });
    expect(result.bestMove).toBe('a1a8');
    expect(result.info?.score).toEqual({ type: 'mate', value: 1 });
  });

  it('returns no move in a checkmated position', async () => {
    const result = await engine.bestMove({ startFen: 'R5k1/5ppp/8/8/8/8/8/6K1 b - - 1 1', moves: [], limits: { depth: 2 } });
    expect(result.bestMove).toBeNull();
  });

  it('returns legal moves at every difficulty level', async () => {
    const position = unwrap(ChessPosition.initial());
    for (const preset of DIFFICULTY_PRESETS) {
      const { bestMove } = await engine.bestMove({
        startFen: position.record.startFen,
        moves: ['e2e4'],
        skillLevel: preset.skillLevel,
        limits: { ...preset.limits, movetimeMs: Math.min(preset.limits.movetimeMs ?? 200, 200) },
      });
      const after = unwrap(position.play({ from: 'e2', to: 'e4' }));
      expect(after.legalMoves().map((m) => m.uci)).toContain(bestMove);
    }
  });

  it('plays complete games against a random-move player until the game ends', async () => {
    for (const [seed, playerColor] of [[1, 'w'], [2, 'b']] as const) {
      const random = rng(seed);
      let session = unwrap(createSession({ playerColor, difficulty: 3 }));
      let plies = 0;
      while (!session.result && plies < 400) {
        if (isEnginesTurn(session)) {
          session = await engineTurn(session);
        } else {
          const moves = session.position.legalMoves();
          const pick = moves[Math.floor(random() * moves.length)]!;
          session = unwrap(applyPlayerMove(session, pick.promotion ? { from: pick.from, to: pick.to, promotion: pick.promotion } : pick));
        }
        plies++;
      }
      expect(session.result).not.toBeNull();
      const pgn = sessionPgn(session);
      expect(pgn).toContain(`[Result "${session.result!.outcome}"]`);
      // The saved move list replays to the same final position.
      const replayed = unwrap(ChessPosition.fromRecord(session.position.record));
      expect(replayed.fen).toBe(session.position.fen);
    }
  }, 120_000);

  it('continues a game from a saved move list (resume)', async () => {
    const saved = { startFen: unwrap(ChessPosition.initial()).fen, moves: ['e2e4', 'e7e5', 'g1f3'] };
    const position = unwrap(ChessPosition.fromRecord(saved));
    const { bestMove } = await engine.bestMove({ startFen: saved.startFen, moves: saved.moves, limits: { depth: 6 } });
    expect(position.legalMoves().map((m) => m.uci)).toContain(bestMove);
  });
});
