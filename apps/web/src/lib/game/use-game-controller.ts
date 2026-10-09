'use client';

import {
  EngineError,
  applyEngineMove,
  applyPlayerMove,
  getDifficulty,
  isEnginesTurn,
  resign,
  undoLastTurn,
  type ChessEngine,
  type GameSession,
  type MoveInput,
} from '@acc/chess-core';
import { useEffect, useReducer } from 'react';

/** Small pause so instant engine replies at low levels still read as a turn. */
const MIN_ENGINE_TURN_MS = 350;

interface State {
  session: GameSession | null;
  notice: string | null;
}

export type GameAction =
  | { type: 'start'; session: GameSession }
  | { type: 'player-move'; move: MoveInput }
  | { type: 'engine-move'; uci: string; ply: number }
  | { type: 'undo' }
  | { type: 'resign' }
  | { type: 'notice'; message: string | null };

export function gameReducer(state: State, action: GameAction): State {
  if (action.type === 'start') return { session: action.session, notice: null };
  if (action.type === 'notice') return { ...state, notice: action.message };
  const session = state.session;
  if (!session) return state;
  let result;
  switch (action.type) {
    case 'player-move':
      result = applyPlayerMove(session, action.move);
      break;
    case 'engine-move':
      // Ignore replies computed for a position that no longer exists (undo/new game).
      if (session.position.history.length !== action.ply) return state;
      result = applyEngineMove(session, action.uci);
      break;
    case 'undo':
      result = undoLastTurn(session);
      break;
    case 'resign':
      result = resign(session);
      break;
  }
  return result.ok ? { session: result.value, notice: null } : { ...state, notice: result.error };
}

/**
 * Owns the game session and asks the engine for a move whenever it is the
 * computer's turn. Searches are cancelled when the position changes.
 */
export function useGameController(
  engine: ChessEngine | null,
  onEngineFailure: (error: unknown) => void,
  initialSession: GameSession | null,
) {
  const [state, dispatch] = useReducer(gameReducer, { session: initialSession, notice: null });
  const { session } = state;

  useEffect(() => {
    if (!session || !engine || !isEnginesTurn(session)) return;
    const controller = new AbortController();
    const ply = session.position.history.length;
    const preset = getDifficulty(session.difficulty);
    const startedAt = Date.now();
    engine
      .bestMove({
        startFen: session.position.record.startFen,
        moves: session.position.record.moves,
        skillLevel: preset.skillLevel,
        limits: preset.limits,
        signal: controller.signal,
      })
      .then(async ({ bestMove }) => {
        const remaining = MIN_ENGINE_TURN_MS - (Date.now() - startedAt);
        if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
        if (controller.signal.aborted) return;
        if (!bestMove) {
          onEngineFailure(new Error('The engine returned no move in a position that still has legal moves.'));
          return;
        }
        if (!applyEngineMove(session, bestMove).ok) {
          onEngineFailure(new Error(`The engine suggested an illegal move (${bestMove}).`));
          return;
        }
        dispatch({ type: 'engine-move', uci: bestMove, ply });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || (error instanceof EngineError && error.code === 'aborted')) return;
        onEngineFailure(error);
      });
    return () => controller.abort();
  }, [session, engine, onEngineFailure]);

  return { session, notice: state.notice, dispatch };
}
