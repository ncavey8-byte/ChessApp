import type { Score } from '../engine/types';
import { otherColor, type Color } from '../game/game';

/**
 * Engine evaluation from White's point of view.
 * `mate` with `moves: 0` means the position is already checkmate.
 */
export type Evaluation =
  | { readonly kind: 'cp'; readonly cp: number }
  | { readonly kind: 'mate'; readonly moves: number; readonly winner: Color };

/** Logistic constant used by Lichess to map centipawns to winning chances. */
const WIN_CURVE = 0.00368208;

/** Converts a UCI score (relative to the side to move) to a White-relative evaluation. */
export function evaluationFromScore(score: Score, sideToMove: Color): Evaluation {
  if (score.type === 'cp') return { kind: 'cp', cp: sideToMove === 'w' ? score.value : -score.value };
  if (score.value > 0) return { kind: 'mate', moves: score.value, winner: sideToMove };
  return { kind: 'mate', moves: Math.abs(score.value), winner: otherColor(sideToMove) };
}

/** Chance (0–100) that `color` wins from this evaluation, using the Lichess logistic curve. */
export function winProbability(evaluation: Evaluation, color: Color): number {
  if (evaluation.kind === 'mate') return evaluation.winner === color ? 100 : 0;
  const white = 50 + 50 * (2 / (1 + Math.exp(-WIN_CURVE * evaluation.cp)) - 1);
  return color === 'w' ? white : 100 - white;
}

/** Short human-readable label such as "+1.4", "−0.3", "#3" or "#-2" (White-relative). */
export function formatEvaluation(evaluation: Evaluation): string {
  if (evaluation.kind === 'mate') {
    if (evaluation.moves === 0) return evaluation.winner === 'w' ? '1-0' : '0-1';
    return `#${evaluation.winner === 'w' ? '' : '-'}${evaluation.moves}`;
  }
  const pawns = evaluation.cp / 100;
  if (Math.abs(pawns) < 0.05) return '0.0';
  return `${pawns > 0 ? '+' : '−'}${Math.abs(pawns).toFixed(1)}`;
}
