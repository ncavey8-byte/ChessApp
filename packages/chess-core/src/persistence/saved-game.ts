import type { GameAnalysis } from '../analysis/analyze-game';
import { isValidDifficulty } from '../engine/difficulty';
import { ChessPosition, type Color, type GameRecord, type ParsedPgn, type Result } from '../game/game';
import { resign, resultFromPosition, type GameOutcome, type GameSession, type Termination } from '../session/session';

/** An in-progress game, saved so it can be resumed after a reload. */
export interface SavedSession {
  readonly version: 1;
  readonly id: string;
  readonly playerColor: Color;
  readonly difficulty: number;
  readonly record: GameRecord;
  readonly resigned: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** A finished (or imported) game kept for review, with its analysis once computed. */
export interface ArchivedGame {
  readonly version: 1;
  readonly id: string;
  readonly source: 'played' | 'imported';
  readonly record: GameRecord;
  /** The user's colour for played games; null for imported games. */
  readonly playerColor: Color | null;
  readonly difficulty: number | null;
  readonly white: string;
  readonly black: string;
  readonly outcome: GameOutcome | '*';
  readonly termination: Termination | null;
  readonly finishedAt: string;
  readonly analysis: GameAnalysis | null;
}

const OUTCOMES = new Set(['1-0', '0-1', '1/2-1/2', '*']);
const TERMINATIONS = new Set(['checkmate', 'resignation', 'stalemate', 'threefold-repetition', 'insufficient-material', 'fifty-move-rule']);
const MAX_NAME = 80;

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);
const isString = (v: unknown): v is string => typeof v === 'string';
const isColor = (v: unknown): v is Color => v === 'w' || v === 'b';

function parseRecord(raw: unknown): Result<GameRecord> {
  if (!isObject(raw) || !isString(raw.startFen) || !Array.isArray(raw.moves) || !raw.moves.every(isString)) {
    return { ok: false, error: 'Saved game has an invalid move record' };
  }
  const position = ChessPosition.fromRecord({ startFen: raw.startFen, moves: raw.moves as string[] });
  return position.ok ? { ok: true, value: position.value.record } : position;
}

export function toSavedSession(session: GameSession, id: string, createdAt: string, now: Date = new Date()): SavedSession {
  return {
    version: 1,
    id,
    playerColor: session.playerColor,
    difficulty: session.difficulty,
    record: session.position.record,
    resigned: session.result?.termination === 'resignation',
    createdAt,
    updatedAt: now.toISOString(),
  };
}

export function parseSavedSession(raw: unknown): Result<SavedSession> {
  if (!isObject(raw) || raw.version !== 1) return { ok: false, error: 'Unsupported saved game format' };
  if (!isString(raw.id) || !raw.id || !isColor(raw.playerColor) || !isValidDifficulty(raw.difficulty)) {
    return { ok: false, error: 'Saved game is missing required fields' };
  }
  if (!isString(raw.createdAt) || !isString(raw.updatedAt) || typeof raw.resigned !== 'boolean') {
    return { ok: false, error: 'Saved game is missing required fields' };
  }
  const record = parseRecord(raw.record);
  if (!record.ok) return record;
  return {
    ok: true,
    value: {
      version: 1,
      id: raw.id,
      playerColor: raw.playerColor,
      difficulty: raw.difficulty,
      record: record.value,
      resigned: raw.resigned,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
    },
  };
}

export function restoreSession(saved: SavedSession): Result<GameSession> {
  const position = ChessPosition.fromRecord(saved.record);
  if (!position.ok) return position;
  const session: GameSession = {
    playerColor: saved.playerColor,
    difficulty: saved.difficulty,
    position: position.value,
    result: resultFromPosition(position.value),
  };
  return saved.resigned && !session.result ? resign(session) : { ok: true, value: session };
}

function opponentName(difficulty: number): string {
  return `Stockfish (level ${difficulty})`;
}

export function archiveFromSession(session: GameSession, id: string, now: Date = new Date()): ArchivedGame {
  const engine = opponentName(session.difficulty);
  return {
    version: 1,
    id,
    source: 'played',
    record: session.position.record,
    playerColor: session.playerColor,
    difficulty: session.difficulty,
    white: session.playerColor === 'w' ? 'You' : engine,
    black: session.playerColor === 'b' ? 'You' : engine,
    outcome: session.result?.outcome ?? '*',
    termination: session.result?.termination ?? null,
    finishedAt: now.toISOString(),
    analysis: null,
  };
}

export function archiveFromPgn(parsed: ParsedPgn, id: string, now: Date = new Date()): ArchivedGame {
  const position = ChessPosition.fromRecord(parsed.record);
  const result = position.ok ? resultFromPosition(position.value) : null;
  const headerResult = parsed.headers.Result;
  const name = (value: string | undefined, fallback: string) => (value && value !== '?' ? value.slice(0, MAX_NAME) : fallback);
  return {
    version: 1,
    id,
    source: 'imported',
    record: parsed.record,
    playerColor: null,
    difficulty: null,
    white: name(parsed.headers.White, 'White'),
    black: name(parsed.headers.Black, 'Black'),
    outcome: result?.outcome ?? (headerResult && OUTCOMES.has(headerResult) ? (headerResult as GameOutcome | '*') : '*'),
    termination: result?.termination ?? null,
    finishedAt: now.toISOString(),
    analysis: null,
  };
}

function analysisMatches(analysis: unknown, record: GameRecord): analysis is GameAnalysis {
  if (!isObject(analysis) || analysis.version !== 1) return false;
  if (!Array.isArray(analysis.moves) || !Array.isArray(analysis.positions) || !isObject(analysis.record)) return false;
  const analysed = analysis.record;
  return (
    analysed.startFen === record.startFen &&
    Array.isArray(analysed.moves) &&
    analysed.moves.length === record.moves.length &&
    analysed.moves.every((m, i) => m === record.moves[i]) &&
    analysis.moves.length === record.moves.length &&
    analysis.positions.length === record.moves.length + 1
  );
}

export function parseArchivedGame(raw: unknown): Result<ArchivedGame> {
  if (!isObject(raw) || raw.version !== 1) return { ok: false, error: 'Unsupported archived game format' };
  if (!isString(raw.id) || !raw.id || (raw.source !== 'played' && raw.source !== 'imported')) {
    return { ok: false, error: 'Archived game is missing required fields' };
  }
  if (!isString(raw.white) || !isString(raw.black) || !isString(raw.finishedAt) || !isString(raw.outcome) || !OUTCOMES.has(raw.outcome)) {
    return { ok: false, error: 'Archived game is missing required fields' };
  }
  const playerColor = raw.playerColor === null ? null : isColor(raw.playerColor) ? raw.playerColor : undefined;
  const difficulty = raw.difficulty === null ? null : isValidDifficulty(raw.difficulty) ? raw.difficulty : undefined;
  const termination = raw.termination === null ? null : isString(raw.termination) && TERMINATIONS.has(raw.termination) ? (raw.termination as Termination) : undefined;
  if (playerColor === undefined || difficulty === undefined || termination === undefined) {
    return { ok: false, error: 'Archived game has invalid fields' };
  }
  const record = parseRecord(raw.record);
  if (!record.ok) return record;
  return {
    ok: true,
    value: {
      version: 1,
      id: raw.id,
      source: raw.source,
      record: record.value,
      playerColor,
      difficulty,
      white: raw.white.slice(0, MAX_NAME),
      black: raw.black.slice(0, MAX_NAME),
      outcome: raw.outcome as GameOutcome | '*',
      termination,
      finishedAt: raw.finishedAt,
      // Analysis is a cache: drop it if it does not belong to this exact game.
      analysis: analysisMatches(raw.analysis, record.value) ? raw.analysis : null,
    },
  };
}

export function archivedPgn(game: ArchivedGame): string {
  const position = ChessPosition.fromRecord(game.record);
  if (!position.ok) return '';
  return position.value.pgn({
    Event: game.source === 'played' ? 'Adaptive Chess Coach practice game' : 'Imported game',
    Date: game.finishedAt.slice(0, 10).replace(/-/g, '.'),
    White: game.white,
    Black: game.black,
    Result: game.outcome,
  });
}
