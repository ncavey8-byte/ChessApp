import type { Color } from '../game/game';
import { winProbability, type Evaluation } from './evaluation';

export type MoveClassification = 'best' | 'good' | 'inaccuracy' | 'mistake' | 'blunder' | 'missed-win';

/**
 * Win-probability loss thresholds, in percentage points for the side that moved.
 * These match Lichess (0.1 / 0.2 / 0.3 of its −1…+1 winning-chances scale). Because the
 * win-probability curve flattens in decided positions, going from +8 to +5 costs almost
 * nothing and is not flagged, while dropping from +1 to −1 is.
 */
export const CLASSIFICATION_THRESHOLDS = { inaccuracy: 5, mistake: 10, blunder: 15 } as const;

/** A "missed win": the mover was clearly winning before the move and no longer is. */
export const MISSED_WIN = { winningBefore: 80, notWinningAfter: 60, losingAfter: 40 } as const;

export const CLASSIFICATION_SYMBOLS: Record<MoveClassification, string> = {
  best: '',
  good: '',
  inaccuracy: '?!',
  mistake: '?',
  blunder: '??',
  'missed-win': '?',
};

export interface ClassifyInput {
  mover: Color;
  before: Evaluation;
  after: Evaluation;
  playedUci: string;
  bestUci: string | null;
}

export interface Classified {
  classification: MoveClassification;
  /** Mover's win chance (0–100) before and after the move. */
  winProbBefore: number;
  winProbAfter: number;
  winProbLoss: number;
}

export function classifyMove({ mover, before, after, playedUci, bestUci }: ClassifyInput): Classified {
  const winProbBefore = winProbability(before, mover);
  const winProbAfter = winProbability(after, mover);
  const winProbLoss = Math.max(0, winProbBefore - winProbAfter);
  let classification: MoveClassification;
  if (bestUci !== null && playedUci === bestUci) classification = 'best';
  else if (
    winProbLoss >= CLASSIFICATION_THRESHOLDS.mistake &&
    winProbBefore >= MISSED_WIN.winningBefore &&
    winProbAfter < MISSED_WIN.notWinningAfter &&
    winProbAfter >= MISSED_WIN.losingAfter
  )
    classification = 'missed-win';
  else if (winProbLoss >= CLASSIFICATION_THRESHOLDS.blunder) classification = 'blunder';
  else if (winProbLoss >= CLASSIFICATION_THRESHOLDS.mistake) classification = 'mistake';
  else if (winProbLoss >= CLASSIFICATION_THRESHOLDS.inaccuracy) classification = 'inaccuracy';
  else classification = 'good';
  return { classification, winProbBefore, winProbAfter, winProbLoss };
}
