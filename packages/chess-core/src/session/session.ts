import { DEFAULT_DIFFICULTY, isValidDifficulty } from '../engine/difficulty';
import { ChessPosition, STARTING_FEN, parseUciMove, type Color, type DrawReason, type MoveInput, type Result } from '../game/game';

export type GameOutcome = '1-0' | '0-1' | '1/2-1/2';
export type Termination = 'checkmate' | 'resignation' | DrawReason;

export interface GameResult {
  readonly outcome: GameOutcome;
  readonly winner: Color | null;
  readonly termination: Termination;
}

/** Immutable state of a game between the player and the computer. */
export interface GameSession {
  readonly playerColor: Color;
  readonly difficulty: number;
  readonly position: ChessPosition;
  readonly result: GameResult | null;
}

export interface NewSessionOptions {
  playerColor: Color;
  difficulty?: number;
  startFen?: string;
}

function outcomeFor(winner: Color | null): GameOutcome {
  if (winner === null) return '1/2-1/2';
  return winner === 'w' ? '1-0' : '0-1';
}

export function resultFromPosition(position: ChessPosition): GameResult | null {
  const status = position.status();
  if (status.kind === 'checkmate') return { outcome: outcomeFor(status.winner), winner: status.winner, termination: 'checkmate' };
  if (status.kind === 'draw') return { outcome: '1/2-1/2', winner: null, termination: status.reason };
  return null;
}

export function createSession(options: NewSessionOptions): Result<GameSession> {
  const difficulty = options.difficulty ?? DEFAULT_DIFFICULTY;
  if (!isValidDifficulty(difficulty)) return { ok: false, error: `Unknown difficulty level: ${String(difficulty)}` };
  const position = ChessPosition.initial(options.startFen ?? STARTING_FEN);
  if (!position.ok) return position;
  return {
    ok: true,
    value: { playerColor: options.playerColor, difficulty, position: position.value, result: resultFromPosition(position.value) },
  };
}

export function isPlayersTurn(session: GameSession): boolean {
  return session.result === null && session.position.turn === session.playerColor;
}

export function isEnginesTurn(session: GameSession): boolean {
  return session.result === null && session.position.turn !== session.playerColor;
}

function withPosition(session: GameSession, position: ChessPosition): GameSession {
  return { ...session, position, result: resultFromPosition(position) };
}

export function applyPlayerMove(session: GameSession, move: MoveInput): Result<GameSession> {
  if (session.result) return { ok: false, error: 'The game is over' };
  if (!isPlayersTurn(session)) return { ok: false, error: "It is not your turn" };
  const next = session.position.play(move);
  return next.ok ? { ok: true, value: withPosition(session, next.value) } : next;
}

/** Applies a move proposed by the engine after validating it against the legal moves. */
export function applyEngineMove(session: GameSession, uci: string): Result<GameSession> {
  if (session.result) return { ok: false, error: 'The game is over' };
  if (!isEnginesTurn(session)) return { ok: false, error: "It is not the engine's turn" };
  const move = parseUciMove(uci);
  if (!move) return { ok: false, error: `Engine returned a malformed move: "${uci}"` };
  const next = session.position.play(move);
  return next.ok ? { ok: true, value: withPosition(session, next.value) } : { ok: false, error: `Engine returned an illegal move: "${uci}"` };
}

/** True when the player has a move that can be taken back (practice mode). */
export function canUndo(session: GameSession): boolean {
  if (session.result?.termination === 'resignation') return false;
  return session.position.history.some((m) => m.color === session.playerColor);
}

/**
 * Takes back the player's most recent move together with any engine reply,
 * so that it is the player's turn again. Clears a checkmate/draw result.
 */
export function undoLastTurn(session: GameSession): Result<GameSession> {
  if (!canUndo(session)) return { ok: false, error: 'Nothing to undo' };
  const moves = [...session.position.record.moves];
  const history = session.position.history;
  let index = history.length - 1;
  while (index >= 0 && history[index]!.color !== session.playerColor) index--;
  moves.length = Math.max(0, index);
  const position = ChessPosition.fromRecord({ startFen: session.position.record.startFen, moves });
  return position.ok ? { ok: true, value: withPosition(session, position.value) } : position;
}

export function resign(session: GameSession): Result<GameSession> {
  if (session.result) return { ok: false, error: 'The game is over' };
  const winner: Color = session.playerColor === 'w' ? 'b' : 'w';
  return { ok: true, value: { ...session, result: { outcome: outcomeFor(winner), winner, termination: 'resignation' } } };
}

export function sessionPgn(session: GameSession, headers: Record<string, string> = {}): string {
  const engineName = 'Stockfish';
  return session.position.pgn({
    Event: 'Adaptive Chess Coach practice game',
    White: session.playerColor === 'w' ? 'Player' : `${engineName} (level ${session.difficulty})`,
    Black: session.playerColor === 'b' ? 'Player' : `${engineName} (level ${session.difficulty})`,
    Result: session.result?.outcome ?? '*',
    ...headers,
  });
}
