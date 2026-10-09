'use client';

import {
  ANALYSIS_PRESETS,
  CLASSIFICATION_SYMBOLS,
  ChessPosition,
  EngineError,
  analyzeGame,
  archivedPgn,
  formatEvaluation,
  getAnalysisPreset,
  summarizeAnalysis,
  winProbability,
  type AnalysisPresetId,
  type ArchivedGame,
  type MoveClassification,
} from '@acc/chess-core';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chessboard, type ChessboardOptions } from 'react-chessboard';
import { CLASSIFICATION_LABELS, FLAGGED, describeLimits } from '@/lib/analysis/presentation';
import { describeEngineError, useEngine } from '@/lib/engine/use-engine';
import { moveRows } from '@/lib/game/labels';
import { downloadText, getGameRepository } from '@/lib/storage/game-repository';
import { EvalGraph } from './EvalGraph';

const LIGHT_SQUARE = { backgroundColor: '#e9e4d4' };
const DARK_SQUARE = { backgroundColor: '#7f9a78' };
const MOVE_COLORS: Record<MoveClassification, string> = {
  best: 'rgba(74, 222, 128, 0.45)',
  good: 'rgba(234, 179, 8, 0.32)',
  inaccuracy: 'rgba(250, 204, 21, 0.55)',
  mistake: 'rgba(251, 146, 60, 0.6)',
  blunder: 'rgba(239, 68, 68, 0.6)',
  'missed-win': 'rgba(168, 85, 247, 0.55)',
};
const SUMMARY_KEYS: MoveClassification[] = ['inaccuracy', 'mistake', 'blunder', 'missed-win'];

type Load = { status: 'loading' } | { status: 'missing' } | { status: 'ready'; game: ArchivedGame };
type Run = { status: 'idle' } | { status: 'running'; done: number; total: number } | { status: 'error'; message: string };

export function AnalysisScreen({ gameId }: { gameId: string }) {
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [run, setRun] = useState<Run>({ status: 'idle' });
  const [presetId, setPresetId] = useState<AnalysisPresetId>('quick');
  const [ply, setPly] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const { state: engineState, retry } = useEngine();
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    getGameRepository()
      .getArchived(gameId)
      .then(
        (game) => setLoad(game ? { status: 'ready', game } : { status: 'missing' }),
        () => setLoad({ status: 'missing' }),
      );
    return () => abortRef.current?.abort();
  }, [gameId]);

  const game = load.status === 'ready' ? load.game : null;
  const position = useMemo(() => {
    if (!game) return null;
    const p = ChessPosition.fromRecord(game.record);
    return p.ok ? p.value : null;
  }, [game]);
  const plyCount = position?.history.length ?? 0;
  const analysis = game?.analysis ?? null;

  const select = useCallback((next: number) => setPly(Math.max(0, Math.min(plyCount, next))), [plyCount]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if (event.key === 'ArrowLeft') select(ply - 1);
      else if (event.key === 'ArrowRight') select(ply + 1);
      else if (event.key === 'Home') select(0);
      else if (event.key === 'End') select(plyCount);
      else return;
      event.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ply, plyCount, select]);

  async function startAnalysis() {
    if (!game || engineState.status !== 'ready') return;
    const controller = new AbortController();
    abortRef.current = controller;
    const preset = getAnalysisPreset(presetId);
    setRun({ status: 'running', done: 0, total: game.record.moves.length + 1 });
    try {
      const result = await analyzeGame(engineState.engine, game.record, {
        limits: preset.limits,
        engineName: engineState.name,
        signal: controller.signal,
        onProgress: (done, total) => setRun({ status: 'running', done, total }),
      });
      const updated: ArchivedGame = { ...game, analysis: result };
      setLoad({ status: 'ready', game: updated });
      setRun({ status: 'idle' });
      getGameRepository()
        .saveArchived(updated)
        .catch(() => setRun({ status: 'error', message: 'Analysis finished but could not be saved in your browser.' }));
    } catch (error) {
      if (controller.signal.aborted || (error instanceof EngineError && error.code === 'aborted')) {
        setRun({ status: 'idle' });
        return;
      }
      setRun({ status: 'error', message: describeEngineError(error) });
    }
  }

  if (load.status === 'loading') return <p className="muted">Loading game…</p>;
  if (load.status === 'missing' || !game || !position) {
    return (
      <div className="panel">
        <h1 className="panel-title">Game not found</h1>
        <p className="muted">This game is not stored in this browser.</p>
        <Link href="/analysis" className="btn btn-secondary">
          Back to your games
        </Link>
      </div>
    );
  }

  const fen = ply === 0 ? position.record.startFen : position.history[ply - 1]!.fenAfter;
  const lastMove = ply > 0 ? position.history[ply - 1]! : null;
  const moveInfo = analysis && ply > 0 ? analysis.moves[ply - 1]! : null;
  const here = analysis?.positions[ply] ?? null;
  const squareStyles: Record<string, React.CSSProperties> = {};
  if (lastMove) {
    const color = { backgroundColor: MOVE_COLORS[moveInfo?.classification ?? 'good'] };
    squareStyles[lastMove.from] = color;
    squareStyles[lastMove.to] = color;
  }
  const bestHere = here?.bestMove;
  const boardOptions: ChessboardOptions = {
    id: 'analysis-board',
    position: fen,
    boardOrientation: (game.playerColor === 'b') !== flipped ? 'black' : 'white',
    allowDragging: false,
    allowDrawingArrows: false,
    squareStyles,
    lightSquareStyle: LIGHT_SQUARE,
    darkSquareStyle: DARK_SQUARE,
    animationDurationInMs: 120,
    arrows: bestHere ? [{ startSquare: bestHere.slice(0, 2), endSquare: bestHere.slice(2, 4), color: 'rgba(74, 222, 128, 0.85)' }] : [],
  };

  const [, turn = 'w', , , , fullmove = '1'] = position.record.startFen.split(' ');
  const rows = moveRows(position.history.map((m) => m.san), turn === 'b' ? 'b' : 'w', Number(fullmove) || 1);
  const summary = analysis ? summarizeAnalysis(analysis) : null;
  const running = run.status === 'running';

  const moveButton = (san: string | undefined, movePly: number | undefined) => {
    if (!san || movePly === undefined) return <span className="move-san" />;
    const info = analysis?.moves[movePly - 1];
    const cls = info?.classification;
    return (
      <button
        type="button"
        className={`move-san move-btn${movePly === ply ? ' is-current' : ''}${cls && FLAGGED.has(cls) ? ` is-${cls}` : ''}`}
        onClick={() => select(movePly)}
        aria-current={movePly === ply ? 'step' : undefined}
        aria-label={`${san}${cls ? `, ${CLASSIFICATION_LABELS[cls]}` : ''}`}
      >
        {san}
        {cls && CLASSIFICATION_SYMBOLS[cls]}
      </button>
    );
  };

  return (
    <div className="play-layout analysis-layout">
      <section className="board-column" aria-label="Analysis board">
        <div className="player-strip">
          <span>
            {game.white} vs {game.black} · {game.outcome}
          </span>
        </div>
        <div className="board-frame">
          <Chessboard options={boardOptions} />
        </div>
        <div className="controls nav-controls">
          <button type="button" className="btn btn-secondary" onClick={() => select(0)} aria-label="First position" disabled={ply === 0}>
            «
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => select(ply - 1)} aria-label="Previous move" disabled={ply === 0}>
            ‹
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => select(ply + 1)} aria-label="Next move" disabled={ply === plyCount}>
            ›
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => select(plyCount)} aria-label="Last position" disabled={ply === plyCount}>
            »
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => setFlipped((f) => !f)}>
            Flip
          </button>
        </div>
        {analysis && <EvalGraph positions={analysis.positions} moves={analysis.moves} ply={ply} onSelect={select} />}
      </section>

      <aside className="side-column">
        <div className="panel">
          {analysis ? (
            <div className="move-detail" data-testid="move-detail" aria-live="polite">
              {moveInfo ? (
                <>
                  <p>
                    <strong>
                      {moveInfo.san}
                      {CLASSIFICATION_SYMBOLS[moveInfo.classification]}
                    </strong>{' '}
                    <span className={`tag is-${moveInfo.classification}`}>{CLASSIFICATION_LABELS[moveInfo.classification]}</span>
                  </p>
                  <p className="small">
                    {moveInfo.color === 'w' ? 'White' : 'Black'}&apos;s winning chances: {Math.round(moveInfo.winProbBefore)}% →{' '}
                    {Math.round(moveInfo.winProbAfter)}% · eval {formatEvaluation(moveInfo.evalAfter)}
                  </p>
                  {moveInfo.classification !== 'best' && moveInfo.bestSan && (
                    <p className="small">
                      Engine preferred <strong>{moveInfo.bestSan}</strong>
                      {moveInfo.bestLine.length > 1 && <span className="muted"> ({moveInfo.bestLine.join(' ')})</span>}
                    </p>
                  )}
                </>
              ) : (
                <p className="small">
                  Start position · eval {here ? formatEvaluation(here.evaluation) : '—'} (White {here ? Math.round(winProbability(here.evaluation, 'w')) : 50}%)
                </p>
              )}
              {bestHere && <p className="muted small">Green arrow: engine&apos;s best move in this position.</p>}
            </div>
          ) : (
            <div className="analysis-start">
              <h1 className="panel-title">Analyse this game</h1>
              <fieldset className="fieldset">
                <legend className="label">Depth</legend>
                <div className="segmented">
                  {ANALYSIS_PRESETS.map((p) => (
                    <label key={p.id} className={`segment${presetId === p.id ? ' is-selected' : ''}`} title={p.description}>
                      <input type="radio" name="preset" value={p.id} checked={presetId === p.id} onChange={() => setPresetId(p.id)} disabled={running} />
                      {p.label}
                    </label>
                  ))}
                </div>
              </fieldset>
              <p className="muted small">{getAnalysisPreset(presetId).description}. Runs in your browser; you can keep browsing the moves.</p>
              {running ? (
                <>
                  <progress className="progress" value={run.done} max={run.total} aria-label="Analysis progress" />
                  <p className="small" role="status">
                    Analysing position {run.done} of {run.total}…
                  </p>
                  <button type="button" className="btn btn-secondary" onClick={() => abortRef.current?.abort()}>
                    Cancel
                  </button>
                </>
              ) : (
                <button type="button" className="btn btn-primary btn-block" onClick={startAnalysis} disabled={engineState.status !== 'ready'}>
                  {engineState.status === 'loading' ? 'Loading engine…' : 'Analyse game'}
                </button>
              )}
            </div>
          )}
          {run.status === 'error' && (
            <div className="alert alert-error" role="alert">
              <p>{run.message}</p>
            </div>
          )}
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

          <div className="move-list" data-testid="analysis-move-list" aria-label="Moves" role="region">
            <ol className="move-rows">
              {rows.map((row) => (
                <li key={row.number} className="move-row">
                  <span className="move-number">{row.number}.</span>
                  {moveButton(row.white, row.whitePly)}
                  {moveButton(row.black, row.blackPly)}
                </li>
              ))}
            </ol>
          </div>

          {summary && (
            <table className="summary-table" data-testid="analysis-summary">
              <thead>
                <tr>
                  <th scope="col" />
                  <th scope="col">White</th>
                  <th scope="col">Black</th>
                </tr>
              </thead>
              <tbody>
                {SUMMARY_KEYS.map((key) => (
                  <tr key={key}>
                    <th scope="row" className={`tag-text is-${key}`}>
                      {CLASSIFICATION_LABELS[key]}
                    </th>
                    <td>{summary.w[key]}</td>
                    <td>{summary.b[key]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <div className="controls">
            <button type="button" className="btn btn-secondary" onClick={() => downloadText(`chess-game-${game.id.slice(0, 8)}.pgn`, archivedPgn(game))}>
              Download PGN
            </button>
            {analysis && !running && (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setLoad({ status: 'ready', game: { ...game, analysis: null } })}
              >
                Re-analyse
              </button>
            )}
            <Link href="/analysis" className="btn btn-ghost">
              All games
            </Link>
          </div>
        </div>
        {analysis && (
          <p className="muted small disclaimer">
            Analysed by {analysis.engineName} ({describeLimits(analysis.limits)}). Move labels are estimates from a short search and can be wrong
            in complicated positions.
          </p>
        )}
      </aside>
    </div>
  );
}
