/** A bidirectional line-based channel to a UCI engine (Web Worker, Node module, native module, ...). */
export interface UciTransport {
  send(command: string): void;
  /** Subscribe to output lines. Returns an unsubscribe function. */
  onLine(listener: (line: string) => void): () => void;
  /** Subscribe to fatal transport errors (e.g. the worker failed to load). */
  onError(listener: (error: Error) => void): () => void;
  terminate(): void;
}

export interface SearchLimits {
  depth?: number;
  movetimeMs?: number;
  nodes?: number;
}

export type Score = { readonly type: 'cp' | 'mate'; readonly value: number };

export interface SearchInfo {
  depth?: number;
  seldepth?: number;
  multipv?: number;
  score?: Score;
  nodes?: number;
  nps?: number;
  timeMs?: number;
  pv?: string[];
}

export interface BestMoveRequest {
  /** Start position of the game (so the engine knows the repetition history). */
  startFen: string;
  /** Moves played since startFen, in UCI notation. */
  moves: readonly string[];
  limits: SearchLimits;
  /** Stockfish "Skill Level" (0–20). Omit for full strength. */
  skillLevel?: number;
  signal?: AbortSignal;
}

export interface BestMoveResult {
  /** UCI move, or null if the side to move has no legal moves. */
  bestMove: string | null;
  ponder?: string;
  /** Last search info line received for the principal variation. */
  info?: SearchInfo;
}

export interface EngineIdentity {
  name: string;
  author?: string;
}

export interface ChessEngine {
  init(): Promise<EngineIdentity>;
  bestMove(request: BestMoveRequest): Promise<BestMoveResult>;
  dispose(): void;
}

export type EngineErrorCode = 'init-timeout' | 'search-timeout' | 'crashed' | 'disposed' | 'aborted' | 'invalid-request';

export class EngineError extends Error {
  readonly code: EngineErrorCode;

  constructor(code: EngineErrorCode, message: string) {
    super(message);
    this.name = 'EngineError';
    this.code = code;
  }
}
