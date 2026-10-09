import { Chess } from 'chess.js';
import { EngineError, type ChessEngine, type SearchLimits } from '../engine/types';
import { ChessPosition, parseUciMove, type Color, type GameRecord } from '../game/game';
import { classifyMove, type Classified, type MoveClassification } from './classify';
import { evaluationFromScore, type Evaluation } from './evaluation';

export type AnalysisPresetId = 'quick' | 'standard';

export interface AnalysisPreset {
  readonly id: AnalysisPresetId;
  readonly label: string;
  readonly description: string;
  readonly limits: SearchLimits;
}

/** Search limits per position. Stockfish stops at whichever limit is reached first. */
export const ANALYSIS_PRESETS: readonly AnalysisPreset[] = [
  { id: 'quick', label: 'Quick', description: 'Depth 10, up to 0.3 s per position', limits: { depth: 10, movetimeMs: 300 } },
  { id: 'standard', label: 'Standard', description: 'Depth 14, up to 1 s per position', limits: { depth: 14, movetimeMs: 1000 } },
];

export function getAnalysisPreset(id: string): AnalysisPreset {
  return ANALYSIS_PRESETS.find((p) => p.id === id) ?? ANALYSIS_PRESETS[0]!;
}

export interface PositionEvaluation {
  /** Number of moves played before this position (0 = start position). */
  readonly ply: number;
  readonly fen: string;
  readonly evaluation: Evaluation;
  /** Engine's best move in UCI, or null when the game is over in this position. */
  readonly bestMove: string | null;
  readonly pv: readonly string[];
  readonly depth: number | null;
}

export interface MoveAnalysis extends Classified {
  readonly ply: number;
  readonly color: Color;
  readonly san: string;
  readonly uci: string;
  readonly fenBefore: string;
  readonly fenAfter: string;
  readonly bestMove: string | null;
  readonly bestSan: string | null;
  /** Engine's principal variation from the position before the move, in SAN. */
  readonly bestLine: readonly string[];
  readonly evalBefore: Evaluation;
  readonly evalAfter: Evaluation;
}

export interface GameAnalysis {
  readonly version: 1;
  readonly engineName: string;
  readonly limits: SearchLimits;
  readonly record: GameRecord;
  readonly positions: readonly PositionEvaluation[];
  readonly moves: readonly MoveAnalysis[];
  readonly createdAt: string;
}

export interface AnalyzeOptions {
  limits: SearchLimits;
  engineName?: string;
  signal?: AbortSignal;
  onProgress?: (done: number, total: number) => void;
  now?: () => Date;
}

/** Converts a UCI line to SAN, stopping at the first move that is not legal. */
export function uciLineToSan(fen: string, line: readonly string[], max = 8): string[] {
  const chess = new Chess(fen);
  const sans: string[] = [];
  for (const uci of line.slice(0, max)) {
    const move = parseUciMove(uci);
    if (!move) break;
    try {
      sans.push(chess.move(move).san);
    } catch {
      break;
    }
  }
  return sans;
}

function terminalEvaluation(position: ChessPosition): Evaluation | null {
  const status = position.status();
  if (status.kind === 'checkmate') return { kind: 'mate', moves: 0, winner: status.winner };
  if (status.kind === 'draw') return { kind: 'cp', cp: 0 };
  return null;
}

/**
 * Evaluates every position of a game with the engine (full strength) and classifies
 * each move by how much it lowered the mover's win probability. Engine output is
 * checked for legality; malformed or missing results raise an error rather than
 * producing a misleading report.
 */
export async function analyzeGame(engine: ChessEngine, record: GameRecord, options: AnalyzeOptions): Promise<GameAnalysis> {
  const game = ChessPosition.fromRecord(record);
  if (!game.ok) throw new Error(`Cannot analyse this game: ${game.error}`);
  const { history } = game.value;
  const startFen = game.value.record.startFen;
  const total = history.length + 1;
  const positions: PositionEvaluation[] = [];

  for (let ply = 0; ply < total; ply++) {
    if (options.signal?.aborted) throw new EngineError('aborted', 'Analysis was cancelled');
    const fen = ply === 0 ? startFen : history[ply - 1]!.fenAfter;
    const terminal = ply === history.length ? terminalEvaluation(game.value) : null;
    if (terminal) {
      positions.push({ ply, fen, evaluation: terminal, bestMove: null, pv: [], depth: null });
    } else {
      const result = await engine.bestMove({
        startFen,
        moves: record.moves.slice(0, ply),
        limits: options.limits,
        skillLevel: 20,
        ...(options.signal ? { signal: options.signal } : {}),
      });
      const score = result.info?.score;
      if (!result.bestMove || uciLineToSan(fen, [result.bestMove], 1).length !== 1) {
        throw new Error(`The engine returned an invalid best move (${String(result.bestMove)}) at ply ${ply}.`);
      }
      if (!score) throw new Error(`The engine returned no evaluation at ply ${ply}.`);
      const sideToMove: Color = fen.split(' ')[1] === 'b' ? 'b' : 'w';
      positions.push({
        ply,
        fen,
        evaluation: evaluationFromScore(score, sideToMove),
        bestMove: result.bestMove,
        pv: result.info?.pv?.length ? result.info.pv : [result.bestMove],
        depth: result.info?.depth ?? null,
      });
    }
    options.onProgress?.(ply + 1, total);
  }

  const moves = history.map((move, index): MoveAnalysis => {
    const before = positions[index]!;
    const after = positions[index + 1]!;
    const classified = classifyMove({
      mover: move.color,
      before: before.evaluation,
      after: after.evaluation,
      playedUci: move.uci,
      bestUci: before.bestMove,
    });
    const bestLine = uciLineToSan(move.fenBefore, before.pv);
    return {
      ...classified,
      ply: move.ply,
      color: move.color,
      san: move.san,
      uci: move.uci,
      fenBefore: move.fenBefore,
      fenAfter: move.fenAfter,
      bestMove: before.bestMove,
      bestSan: bestLine[0] ?? null,
      bestLine,
      evalBefore: before.evaluation,
      evalAfter: after.evaluation,
    };
  });

  return {
    version: 1,
    engineName: options.engineName ?? 'Stockfish',
    limits: options.limits,
    record: game.value.record,
    positions,
    moves,
    createdAt: (options.now?.() ?? new Date()).toISOString(),
  };
}

export type ClassificationCounts = Record<MoveClassification, number>;

export function summarizeAnalysis(analysis: GameAnalysis): Record<Color, ClassificationCounts> {
  const empty = (): ClassificationCounts => ({ best: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0, 'missed-win': 0 });
  const summary = { w: empty(), b: empty() };
  for (const move of analysis.moves) summary[move.color][move.classification]++;
  return summary;
}
