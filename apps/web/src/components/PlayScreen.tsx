'use client';

import {
  STARTING_FEN,
  canUndo,
  createSession,
  isEnginesTurn,
  isPlayersTurn,
  sessionPgn,
  type Color,
  type GameSession,
  type NewSessionOptions,
  type MoveInput as Move,
  type PromotionPiece,
} from '@acc/chess-core';
import { useMemo, useState } from 'react';
import { Chessboard, type ChessboardOptions } from 'react-chessboard';
import { useEngine } from '@/lib/engine/use-engine';
import { computeSquareStyles } from '@/lib/game/board-styles';
import { COLOR_NAMES, describeResult, opponentLabel } from '@/lib/game/labels';
import { useGameController } from '@/lib/game/use-game-controller';
import { MoveInput } from './MoveInput';
import { MoveList } from './MoveList';
import { NewGamePanel, type NewGameSettings } from './NewGamePanel';
import { PromotionDialog } from './PromotionDialog';

export interface InitialSetup {
  settings: NewGameSettings;
  /** Present when the URL fully specified a valid game, which then starts immediately. Plain data so it can cross the server/client boundary. */
  start: NewSessionOptions | null;
  error: string | null;
}

const LIGHT_SQUARE = { backgroundColor: '#e9e4d4' };
const DARK_SQUARE = { backgroundColor: '#7f9a78' };
const PREVIEW_POSITION = (() => {
  const s = createSession({ playerColor: 'w' });
  if (!s.ok) throw new Error(s.error);
  return s.value.position;
})();

function initialSession(start: NewSessionOptions | null): GameSession | null {
  if (!start) return null;
  const created = createSession(start);
  return created.ok ? created.value : null;
}

export function PlayScreen({ initial }: { initial: InitialSetup }) {
  const { state: engineState, retry, reportFailure } = useEngine();
  const engine = engineState.status === 'ready' ? engineState.engine : null;
  const [firstSession] = useState(() => initialSession(initial.start));
  const { session, notice, dispatch } = useGameController(engine, reportFailure, firstSession);

  const [setupOpen, setSetupOpen] = useState(firstSession === null);
  const [setupError, setSetupError] = useState<string | null>(initial.error);
  const [settings, setSettings] = useState<NewGameSettings>(initial.settings);
  const [flipped, setFlipped] = useState(false);
  const [selection, setSelection] = useState<{ square: string; ply: number } | null>(null);
  const [promotion, setPromotion] = useState<{ from: string; to: string; ply: number } | null>(null);
  const [confirmResign, setConfirmResign] = useState(false);
  const [copied, setCopied] = useState(false);

  const position = session?.position ?? PREVIEW_POSITION;
  const ply = position.history.length;
  const playerColor: Color = session?.playerColor ?? 'w';
  const canMove = Boolean(session) && !setupOpen && isPlayersTurn(session!);
  const selected = canMove && selection?.ply === ply ? selection.square : null;
  const pendingPromotion = canMove && promotion?.ply === ply ? promotion : null;
  const thinking = Boolean(session) && isEnginesTurn(session!) && engineState.status === 'ready';
  const orientation: 'white' | 'black' = (playerColor === 'w') !== flipped ? 'white' : 'black';

  const squareStyles = useMemo(
    () => computeSquareStyles({ position, selected, playerColor }),
    [position, selected, playerColor],
  );

  function startGame(next: NewGameSettings) {
    const color: Color = next.color === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : next.color;
    const created = createSession({ playerColor: color, difficulty: next.level, ...(next.fen ? { startFen: next.fen } : {}) });
    if (!created.ok) {
      setSetupError(created.error);
      return;
    }
    if (created.value.result) {
      setSetupError('That position is already finished (checkmate or draw). Choose another one.');
      return;
    }
    setSettings(next);
    setSetupError(null);
    setSetupOpen(false);
    setFlipped(false);
    setConfirmResign(false);
    setSelection(null);
    setPromotion(null);
    dispatch({ type: 'start', session: created.value });
  }

  function tryMove(from: string, to: string): boolean {
    if (!session || !canMove) return false;
    if (position.isPromotion(from, to)) {
      setPromotion({ from, to, ply });
      return false;
    }
    const move: Move = { from, to };
    if (!position.play(move).ok) return false;
    dispatch({ type: 'player-move', move });
    return true;
  }

  function choosePromotion(piece: PromotionPiece) {
    if (!pendingPromotion) return;
    dispatch({ type: 'player-move', move: { from: pendingPromotion.from, to: pendingPromotion.to, promotion: piece } });
    setPromotion(null);
  }

  const boardOptions: ChessboardOptions = {
    id: 'play-board',
    position: position.fen,
    boardOrientation: orientation,
    squareStyles,
    lightSquareStyle: LIGHT_SQUARE,
    darkSquareStyle: DARK_SQUARE,
    allowDragging: canMove,
    allowDrawingArrows: false,
    animationDurationInMs: 180,
    canDragPiece: ({ piece }) => canMove && piece.pieceType[0] === playerColor,
    onPieceDrop: ({ sourceSquare, targetSquare }) => {
      setSelection(null);
      return targetSquare ? tryMove(sourceSquare, targetSquare) : false;
    },
    onSquareClick: ({ square }) => {
      if (!canMove) return;
      if (selected && square !== selected && position.legalMoves(selected).some((m) => m.to === square)) {
        tryMove(selected, square);
        setSelection(null);
        return;
      }
      const piece = position.pieceAt(square);
      const selectable = piece?.color === playerColor && position.legalMoves(square).length > 0 && square !== selected;
      setSelection(selectable ? { square, ply } : null);
    },
  };

  let status: string;
  if (!session) status = 'Set up a game to begin.';
  else if (session.result) status = describeResult(session.result, playerColor).detail;
  else if (engineState.status === 'loading' && isEnginesTurn(session)) status = 'Loading the engine…';
  else if (engineState.status === 'error' && isEnginesTurn(session)) status = 'Waiting for the engine.';
  else if (thinking) status = 'Stockfish is thinking…';
  else status = position.inCheck ? 'Your move — you are in check!' : 'Your move';

  const result = session?.result ? describeResult(session.result, playerColor) : null;

  return (
    <div className="play-layout">
      <section className="board-column" aria-label="Chessboard">
        <div className="player-strip">
          <span className={`piece-dot piece-dot-${playerColor === 'w' ? 'b' : 'w'}`} aria-hidden="true" />
          <span>{session ? opponentLabel(session.difficulty) : 'Stockfish'}</span>
          {thinking && <span className="thinking" aria-hidden="true" />}
        </div>
        <div className={`board-frame${canMove ? '' : ' is-waiting'}`}>
          <Chessboard options={boardOptions} />
        </div>
        <div className="player-strip">
          <span className={`piece-dot piece-dot-${playerColor}`} aria-hidden="true" />
          <span>You{session ? ` · ${COLOR_NAMES[playerColor]}` : ''}</span>
        </div>
      </section>

      <aside className="side-column">
        {engineState.status === 'error' && (
          <div className="alert alert-error" role="alert">
            <p>
              <strong>Engine problem.</strong> {engineState.error}
            </p>
            <button type="button" className="btn btn-secondary" onClick={retry}>
              Restart engine
            </button>
          </div>
        )}

        {setupOpen ? (
          <NewGamePanel
            defaults={settings}
            error={setupError}
            onStart={startGame}
            {...(session ? { onCancel: () => setSetupOpen(false) } : {})}
          />
        ) : (
          session && (
            <div className="panel game-panel">
              {result ? (
                <div className={`result-banner${result.title === 'Draw' ? ' is-draw' : session.result?.winner === playerColor ? ' is-win' : ' is-loss'}`} data-testid="result-banner">
                  <h2>{result.title}</h2>
                  <p>{result.detail}</p>
                </div>
              ) : null}

              <p className="status" data-testid="game-status" role="status" aria-live="polite">
                {status}
              </p>
              {notice && (
                <p className="field-error" role="alert">
                  {notice}
                </p>
              )}

              <MoveList history={position.history} startFen={position.record.startFen} />

              <MoveInput position={position} disabled={!canMove} onMove={(move) => dispatch({ type: 'player-move', move })} />

              <div className="controls">
                <button type="button" className="btn btn-secondary" onClick={() => dispatch({ type: 'undo' })} disabled={!canUndo(session)}>
                  Undo
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setFlipped((f) => !f)}>
                  Flip board
                </button>
                {!session.result &&
                  (confirmResign ? (
                    <>
                      <button
                        type="button"
                        className="btn btn-danger"
                        onClick={() => {
                          dispatch({ type: 'resign' });
                          setConfirmResign(false);
                        }}
                      >
                        Confirm resign
                      </button>
                      <button type="button" className="btn btn-ghost" onClick={() => setConfirmResign(false)}>
                        Keep playing
                      </button>
                    </>
                  ) : (
                    <button type="button" className="btn btn-secondary" onClick={() => setConfirmResign(true)}>
                      Resign
                    </button>
                  ))}
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(sessionPgn(session, { Date: new Date().toISOString().slice(0, 10).replace(/-/g, '.') }));
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1500);
                    } catch {
                      dispatch({ type: 'notice', message: 'Could not copy to the clipboard.' });
                    }
                  }}
                >
                  {copied ? 'Copied!' : 'Copy PGN'}
                </button>
              </div>
              <button type="button" className="btn btn-primary btn-block" onClick={() => setSetupOpen(true)}>
                New game
              </button>
              {position.record.startFen !== STARTING_FEN && <p className="muted small">Started from a custom position.</p>}
            </div>
          )
        )}
        <p className="muted small engine-line">
          {engineState.status === 'ready' ? `Engine: ${engineState.name} (in-browser)` : engineState.status === 'loading' ? 'Engine: loading…' : 'Engine: unavailable'}
        </p>
      </aside>

      {pendingPromotion && (
        <PromotionDialog color={playerColor} onChoose={choosePromotion} onCancel={() => setPromotion(null)} />
      )}
    </div>
  );
}
