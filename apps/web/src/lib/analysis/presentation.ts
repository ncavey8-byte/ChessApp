import { winProbability, type MoveClassification, type PositionEvaluation } from '@acc/chess-core';

export const CLASSIFICATION_LABELS: Record<MoveClassification, string> = {
  best: 'Best move',
  good: 'Good',
  inaccuracy: 'Inaccuracy',
  mistake: 'Mistake',
  blunder: 'Blunder',
  'missed-win': 'Missed win',
};

/** Classifications worth drawing attention to in the move list and graph. */
export const FLAGGED: ReadonlySet<MoveClassification> = new Set(['inaccuracy', 'mistake', 'blunder', 'missed-win']);

export interface GraphPoint {
  ply: number;
  x: number;
  y: number;
  /** White's win chance (0–100). */
  white: number;
}

/** Maps each analysed position to SVG coordinates: x by ply, y by White's win chance (top = White winning). */
export function evalGraphPoints(positions: readonly PositionEvaluation[], width: number, height: number): GraphPoint[] {
  const steps = Math.max(1, positions.length - 1);
  return positions.map((p, index) => {
    const white = winProbability(p.evaluation, 'w');
    return { ply: p.ply, x: (index / steps) * width, y: height - (white / 100) * height, white };
  });
}

/** Closed SVG path for the area under White's win-chance line. */
export function evalAreaPath(points: readonly GraphPoint[], height: number): string {
  if (points.length === 0) return '';
  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  return `${line} L${points.at(-1)!.x.toFixed(1)},${height} L0,${height} Z`;
}

/** Nearest ply for a click at horizontal position x on a graph of the given width. */
export function plyAtX(x: number, width: number, plyCount: number): number {
  if (plyCount <= 0 || width <= 0) return 0;
  return Math.min(plyCount, Math.max(0, Math.round((x / width) * plyCount)));
}

export function describeLimits(limits: { depth?: number; movetimeMs?: number; nodes?: number }): string {
  const parts: string[] = [];
  if (limits.depth !== undefined) parts.push(`depth ${limits.depth}`);
  if (limits.movetimeMs !== undefined) parts.push(`up to ${(limits.movetimeMs / 1000).toLocaleString('en', { maximumFractionDigits: 1 })} s per position`);
  if (limits.nodes !== undefined) parts.push(`${limits.nodes.toLocaleString('en')} nodes`);
  return parts.join(', ');
}
