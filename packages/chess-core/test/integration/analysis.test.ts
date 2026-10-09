import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ANALYSIS_PRESETS, STARTING_FEN, UciEngine, analyzeGame, getAnalysisPreset, parsePgn } from '../../src';
import { createNodeStockfishTransport } from '../helpers/node-stockfish';

let engine: UciEngine;

beforeAll(async () => {
  engine = new UciEngine(await createNodeStockfishTransport());
  await engine.init();
}, 60_000);

afterAll(() => engine?.dispose());

const quick = getAnalysisPreset('quick').limits;

describe('analysis with real Stockfish', () => {
  it('flags the losing move in scholar\'s mate and confirms the mate', async () => {
    const analysis = await analyzeGame(
      engine,
      { startFen: STARTING_FEN, moves: ['e2e4', 'e7e5', 'd1h5', 'b8c6', 'f1c4', 'g8f6', 'h5f7'] },
      { limits: quick },
    );
    const nf6 = analysis.moves[5]!;
    expect(nf6.san).toBe('Nf6');
    expect(nf6.classification).toBe('blunder');
    expect(nf6.evalAfter).toEqual({ kind: 'mate', moves: 1, winner: 'w' });
    expect(['g6', 'Qe7', 'Qf6']).toContain(nf6.bestSan);
    expect(analysis.moves[6]).toMatchObject({ san: 'Qxf7#', classification: 'best' });
    expect(analysis.moves.slice(0, 2).every((m) => m.classification !== 'blunder')).toBe(true);
  });

  it('spots a hung queen', async () => {
    // 1.d4 e5 2.dxe5 Qg5?? 3.Bxg5
    const analysis = await analyzeGame(engine, { startFen: STARTING_FEN, moves: ['d2d4', 'e7e5', 'd4e5', 'd8g5', 'c1g5'] }, { limits: quick });
    expect(analysis.moves[3]).toMatchObject({ san: 'Qg5', classification: 'blunder' });
    expect(analysis.moves[4]).toMatchObject({ san: 'Bxg5', classification: 'best' });
  });

  it('analyses a 40-move game within the per-position time limit', async () => {
    const pgn = unwrap(parsePgn(readFileSync(new URL('../fixtures/forty-moves.pgn', import.meta.url), 'utf8')));
    expect(pgn.record.moves).toHaveLength(80);
    const started = Date.now();
    let lastProgress = 0;
    const analysis = await analyzeGame(engine, pgn.record, { limits: quick, onProgress: (done) => (lastProgress = done) });
    const elapsedMs = Date.now() - started;
    expect(lastProgress).toBe(81);
    expect(analysis.moves).toHaveLength(80);
    expect(analysis.positions.every((p) => p.bestMove !== null && p.depth !== null)).toBe(true);
    expect(elapsedMs).toBeLessThan(81 * (ANALYSIS_PRESETS[0]!.limits.movetimeMs! + 200));
  }, 120_000);
});

function unwrap<T>(result: { ok: true; value: T } | { ok: false; error: string }): T {
  if (!result.ok) throw new Error(result.error);
  return result.value;
}
