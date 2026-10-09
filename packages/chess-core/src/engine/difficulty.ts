import type { SearchLimits } from './types';

export interface DifficultyPreset {
  readonly level: number;
  readonly label: string;
  readonly description: string;
  /** Stockfish "Skill Level" option (0–20). */
  readonly skillLevel: number;
  readonly limits: SearchLimits;
}

/**
 * Opponent presets. These are descriptive only: Stockfish's skill settings do not map
 * reliably to human ratings, so we deliberately do not claim an Elo for any level.
 */
export const DIFFICULTY_PRESETS: readonly DifficultyPreset[] = [
  { level: 1, label: 'Beginner', description: 'Very shallow search, frequent mistakes', skillLevel: 0, limits: { depth: 1, movetimeMs: 50 } },
  { level: 2, label: 'Casual', description: 'Misses many tactics', skillLevel: 3, limits: { depth: 2, movetimeMs: 100 } },
  { level: 3, label: 'Intermediate', description: 'Sees simple tactics', skillLevel: 6, limits: { depth: 4, movetimeMs: 200 } },
  { level: 4, label: 'Club', description: 'Solid, occasional inaccuracies', skillLevel: 10, limits: { depth: 8, movetimeMs: 400 } },
  { level: 5, label: 'Advanced', description: 'Strong and tactically sharp', skillLevel: 15, limits: { depth: 12, movetimeMs: 800 } },
  { level: 6, label: 'Maximum', description: 'Full strength of the browser engine', skillLevel: 20, limits: { movetimeMs: 1500 } },
];

export const DEFAULT_DIFFICULTY = 3;

export function getDifficulty(level: number): DifficultyPreset {
  return DIFFICULTY_PRESETS.find((p) => p.level === level) ?? DIFFICULTY_PRESETS[DEFAULT_DIFFICULTY - 1]!;
}

export function isValidDifficulty(level: unknown): level is number {
  return typeof level === 'number' && DIFFICULTY_PRESETS.some((p) => p.level === level);
}
