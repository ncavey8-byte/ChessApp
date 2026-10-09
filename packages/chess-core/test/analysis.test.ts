import { describe, expect, it } from 'vitest';
import {
  CLASSIFICATION_THRESHOLDS,
  EngineError,
  STARTING_FEN,
  analyzeGame,
  classifyMove,
  evaluationFromScore,
  formatEvaluation,
  summarizeAnalysis,
  uciLineToSan,
  winProbability,
  type BestMoveRequest,
  type BestMoveResult,
  type ChessEngine,
  type Evaluation,
} from '../src';

const cp = (value: number): Evaluation => ({ kind: 'cp', cp: value });

describe('evaluation', () => {
  it('converts side-to-move scores to White-relative evaluations', () => {
    expect(evaluationFromScore({ type: 'cp', value: 50 }, 'w')).toEqual(cp(50));
    expect(evaluationFromScore({ type: 'cp', value: 50 }, 'b')).toEqual(cp(-50));
    expect(evaluationFromScore({ type: 'mate', value: 2 }, 'b')).toEqual({ kind: 'mate', moves: 2, winner: 'b' });
    expect(evaluationFromScore({ type: 'mate', value: -3 }, 'b')).toEqual({ kind: 'mate', moves: 3, winner: 'w' });
  });

  it('maps evaluations to symmetric win probabilities', () => {
    expect(winProbability(cp(0), 'w')).toBeCloseTo(50);
    expect(winProbability(cp(300), 'w') + winProbability(cp(300), 'b')).toBeCloseTo(100);
    expect(winProbability(cp(300), 'w')).toBeGreaterThan(70);
    expect(winProbability({ kind: 'mate', moves: 4, winner: 'b' }, 'b')).toBe(100);
    expect(winProbability({ kind: 'mate', moves: 0, winner: 'b' }, 'w')).toBe(0);
  });

  it('formats evaluations for display', () => {
    expect(formatEvaluation(cp(143))).toBe('+1.4');
    expect(formatEvaluation(cp(-30))).toBe('−0.3');
    expect(formatEvaluation(cp(2))).toBe('0.0');
    expect(formatEvaluation({ kind: 'mate', moves: 3, winner: 'w' })).toBe('#3');
    expect(formatEvaluation({ kind: 'mate', moves: 2, winner: 'b' })).toBe('#-2');
    expect(formatEvaluation({ kind: 'mate', moves: 0, winner: 'b' })).toBe('0-1');
  });
});

describe('classifyMove', () => {
  const base = { mover: 'w' as const, playedUci: 'e2e4', bestUci: 'd2d4' };

  it('marks the engine move as best', () => {
    expect(classifyMove({ ...base, before: cp(20), after: cp(-200), bestUci: 'e2e4' }).classification).toBe('best');
  });

  it('applies inaccuracy/mistake/blunder thresholds to win-probability loss', () => {
    expect(classifyMove({ ...base, before: cp(20), after: cp(10) }).classification).toBe('good');
    expect(classifyMove({ ...base, before: cp(0), after: cp(-70) }).classification).toBe('inaccuracy');
    expect(classifyMove({ ...base, before: cp(0), after: cp(-130) }).classification).toBe('mistake');
    expect(classifyMove({ ...base, before: cp(0), after: cp(-300) }).classification).toBe('blunder');
    expect(classifyMove({ ...base, before: cp(0), after: { kind: 'mate', moves: 2, winner: 'b' } }).classification).toBe('blunder');
  });

  it('ignores large centipawn swings in already-decided positions', () => {
    const decided = classifyMove({ ...base, before: cp(1000), after: cp(700) });
    expect(decided.winProbLoss).toBeLessThan(CLASSIFICATION_THRESHOLDS.inaccuracy);
    expect(decided.classification).toBe('good');
    expect(classifyMove({ ...base, mover: 'b', before: cp(-1200), after: cp(-800) }).classification).toBe('good');
  });

  it('flags throwing away a winning position as a missed win', () => {
    expect(classifyMove({ ...base, before: cp(450), after: cp(0) }).classification).toBe('missed-win');
    expect(classifyMove({ ...base, before: { kind: 'mate', moves: 3, winner: 'w' }, after: cp(20) }).classification).toBe('missed-win');
    // Going from winning to clearly losing is a blunder, not merely a missed win.
    expect(classifyMove({ ...base, before: cp(450), after: cp(-400) }).classification).toBe('blunder');
  });

  it('never reports negative loss when the move improves the position', () => {
    const result = classifyMove({ ...base, mover: 'b', before: cp(100), after: cp(-100) });
    expect(result.winProbLoss).toBe(0);
    expect(result.classification).toBe('good');
  });
});

describe('uciLineToSan', () => {
  it('converts legal moves and stops at the first illegal one', () => {
    expect(uciLineToSan(STARTING_FEN, ['e2e4', 'e7e5', 'g1f3'])).toEqual(['e4', 'e5', 'Nf3']);
    expect(uciLineToSan(STARTING_FEN, ['e2e4', 'e2e4', 'g1f3'])).toEqual(['e4']);
    expect(uciLineToSan(STARTING_FEN, ['zz'])).toEqual([]);
  });
});

/** Scholar's mate: 1.e4 e5 2.Qh5 Nc6 3.Bc4 Nf6?? 4.Qxf7#. */
const SCHOLARS_MATE = ['e2e4', 'e7e5', 'd1h5', 'b8c6', 'f1c4', 'g8f6', 'h5f7'];

type Scripted = BestMoveResult | ((request: BestMoveRequest) => BestMoveResult | Promise<BestMoveResult>);

class ScriptedEngine implements ChessEngine {
  requests: BestMoveRequest[] = [];
  constructor(private readonly script: Scripted[]) {}
  init() {
    return Promise.resolve({ name: 'Scripted' });
  }
  async bestMove(request: BestMoveRequest) {
    this.requests.push(request);
    const step = this.script[request.moves.length];
    if (!step) throw new Error(`No scripted reply for ply ${request.moves.length}`);
    return typeof step === 'function' ? step(request) : step;
  }
  dispose() {}
}

const reply = (bestMove: string, type: 'cp' | 'mate', value: number): BestMoveResult => ({
  bestMove,
  info: { depth: 12, score: { type, value }, pv: [bestMove] },
});

const SCHOLAR_SCRIPT: Scripted[] = [
  reply('e2e4', 'cp', 30),
  reply('e7e5', 'cp', -30),
  reply('g1f3', 'cp', 30),
  reply('b8c6', 'cp', -20),
  reply('f1c4', 'cp', 0),
  reply('g7g6', 'cp', -40),
  reply('h5f7', 'mate', 1),
];

describe('analyzeGame', () => {
  it('evaluates every position and classifies each move', async () => {
    const engine = new ScriptedEngine(SCHOLAR_SCRIPT);
    const progress: Array<[number, number]> = [];
    const analysis = await analyzeGame(engine, { startFen: STARTING_FEN, moves: SCHOLARS_MATE }, {
      limits: { depth: 12 },
      engineName: 'Scripted',
      onProgress: (done, total) => progress.push([done, total]),
      now: () => new Date('2026-01-01T00:00:00Z'),
    });

    expect(engine.requests).toHaveLength(7); // the final checkmate position needs no engine call
    expect(engine.requests.every((r) => r.skillLevel === 20)).toBe(true);
    expect(progress.at(-1)).toEqual([8, 8]);
    expect(analysis.positions).toHaveLength(8);
    expect(analysis.positions[7]!.evaluation).toEqual({ kind: 'mate', moves: 0, winner: 'w' });
    expect(analysis.positions[1]!.evaluation).toEqual(cp(30)); // Black to move, -30 for Black = +30 White

    const byPly = (ply: number) => analysis.moves[ply - 1]!;
    expect(byPly(1).classification).toBe('best');
    expect(byPly(3).classification).toBe('good'); // Qh5 instead of Nf3: loses ~1%
    expect(byPly(6)).toMatchObject({ san: 'Nf6', classification: 'blunder', bestSan: 'g6' });
    expect(byPly(6).winProbAfter).toBe(0);
    expect(byPly(7)).toMatchObject({ san: 'Qxf7#', classification: 'best' });
    expect(analysis.createdAt).toBe('2026-01-01T00:00:00.000Z');

    const summary = summarizeAnalysis(analysis);
    expect(summary.b.blunder).toBe(1);
    expect(summary.w.blunder).toBe(0);
  });

  it('rejects an illegal best move from the engine', async () => {
    const script = [...SCHOLAR_SCRIPT];
    script[2] = reply('e2e4', 'cp', 30); // e2e4 is not legal after 1.e4 e5
    await expect(analyzeGame(new ScriptedEngine(script), { startFen: STARTING_FEN, moves: SCHOLARS_MATE }, { limits: { depth: 5 } })).rejects.toThrow(
      /invalid best move/,
    );
  });

  it('rejects a result with no evaluation', async () => {
    const script = [...SCHOLAR_SCRIPT];
    script[0] = { bestMove: 'e2e4' };
    await expect(analyzeGame(new ScriptedEngine(script), { startFen: STARTING_FEN, moves: SCHOLARS_MATE }, { limits: { depth: 5 } })).rejects.toThrow(
      /no evaluation/,
    );
  });

  it('rejects invalid game records before calling the engine', async () => {
    const engine = new ScriptedEngine(SCHOLAR_SCRIPT);
    await expect(analyzeGame(engine, { startFen: STARTING_FEN, moves: ['e2e5'] }, { limits: { depth: 5 } })).rejects.toThrow(/Illegal move/);
    expect(engine.requests).toHaveLength(0);
  });

  it('stops when the signal is aborted', async () => {
    const controller = new AbortController();
    const script = SCHOLAR_SCRIPT.map((step, index) =>
      index === 2
        ? () => {
            controller.abort();
            return step as BestMoveResult;
          }
        : step,
    );
    const engine = new ScriptedEngine(script);
    const run = analyzeGame(engine, { startFen: STARTING_FEN, moves: SCHOLARS_MATE }, { limits: { depth: 5 }, signal: controller.signal });
    await expect(run).rejects.toBeInstanceOf(EngineError);
    expect(engine.requests).toHaveLength(3);
  });

  it('evaluates a drawn final position as equal', async () => {
    const stalemateFen = 'k7/8/1Q6/8/8/8/8/7K w - - 0 1';
    const engine = new ScriptedEngine([reply('h1g2', 'cp', 900)]);
    const analysis = await analyzeGame(engine, { startFen: stalemateFen, moves: ['b6c7'] }, { limits: { depth: 5 } });
    expect(analysis.positions[1]!.evaluation).toEqual(cp(0));
    expect(analysis.moves[0]!.classification).toBe('missed-win');
  });
});
