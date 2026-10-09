import type { PositionEvaluation } from '@acc/chess-core';
import { describe, expect, it } from 'vitest';
import { describeLimits, evalAreaPath, evalGraphPoints, plyAtX } from './presentation';

const pos = (ply: number, evaluation: PositionEvaluation['evaluation']): PositionEvaluation => ({
  ply,
  fen: '',
  evaluation,
  bestMove: null,
  pv: [],
  depth: null,
});

describe('eval graph helpers', () => {
  it('maps win chances to coordinates (top = White winning)', () => {
    const points = evalGraphPoints(
      [pos(0, { kind: 'cp', cp: 0 }), pos(1, { kind: 'mate', moves: 1, winner: 'w' }), pos(2, { kind: 'mate', moves: 0, winner: 'b' })],
      200,
      100,
    );
    expect(points.map((p) => [p.x, Math.round(p.y)])).toEqual([
      [0, 50],
      [100, 0],
      [200, 100],
    ]);
    expect(evalAreaPath(points, 100)).toBe('M0.0,50.0 L100.0,0.0 L200.0,100.0 L200.0,100 L0,100 Z');
    expect(evalAreaPath([], 100)).toBe('');
  });

  it('converts clicks to the nearest ply within range', () => {
    expect(plyAtX(0, 300, 10)).toBe(0);
    expect(plyAtX(149, 300, 10)).toBe(5);
    expect(plyAtX(500, 300, 10)).toBe(10);
    expect(plyAtX(-5, 300, 10)).toBe(0);
    expect(plyAtX(50, 300, 0)).toBe(0);
  });

  it('describes analysis limits', () => {
    expect(describeLimits({ depth: 10, movetimeMs: 300 })).toBe('depth 10, up to 0.3 s per position');
  });
});
