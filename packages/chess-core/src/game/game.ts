import { Chess, validateFen as chessJsValidateFen, type Move as ChessJsMove, type Square } from 'chess.js';

export type Color = 'w' | 'b';
export type PromotionPiece = 'q' | 'r' | 'b' | 'n';
export type PieceSymbol = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';

export const STARTING_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/** Serializable description of a game: a start position plus the moves played in UCI notation. */
export interface GameRecord {
  readonly startFen: string;
  readonly moves: readonly string[];
}

export interface MoveInput {
  from: string;
  to: string;
  promotion?: PromotionPiece;
}

export interface PlayedMove {
  readonly ply: number;
  readonly color: Color;
  readonly san: string;
  readonly uci: string;
  readonly from: string;
  readonly to: string;
  readonly piece: PieceSymbol;
  readonly captured?: PieceSymbol;
  readonly promotion?: PromotionPiece;
  readonly fenBefore: string;
  readonly fenAfter: string;
}

export interface LegalMove {
  readonly from: string;
  readonly to: string;
  readonly san: string;
  readonly uci: string;
  readonly promotion?: PromotionPiece;
}

export type DrawReason = 'stalemate' | 'threefold-repetition' | 'insufficient-material' | 'fifty-move-rule';

export type GameStatus =
  | { readonly kind: 'in-progress'; readonly turn: Color; readonly inCheck: boolean }
  | { readonly kind: 'checkmate'; readonly winner: Color }
  | { readonly kind: 'draw'; readonly reason: DrawReason };

export type Result<T, E = string> = { ok: true; value: T } | { ok: false; error: E };

const UCI_MOVE = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/;
const SQUARE = /^[a-h][1-8]$/;

export function isSquare(value: string): value is Square {
  return SQUARE.test(value);
}

export function parseUciMove(uci: string): MoveInput | null {
  const match = UCI_MOVE.exec(uci.trim().toLowerCase());
  if (!match) return null;
  const [, from, to, promotion] = match;
  return promotion ? { from: from!, to: to!, promotion: promotion as PromotionPiece } : { from: from!, to: to! };
}

export function toUci(move: MoveInput): string {
  return `${move.from}${move.to}${move.promotion ?? ''}`;
}

export function validateFen(fen: string): Result<string> {
  const trimmed = fen.trim().replace(/\s+/g, ' ');
  const check = chessJsValidateFen(trimmed);
  if (!check.ok) return { ok: false, error: check.error ?? 'Invalid FEN' };
  return { ok: true, value: trimmed };
}

export function otherColor(color: Color): Color {
  return color === 'w' ? 'b' : 'w';
}

function toPlayedMove(move: ChessJsMove, ply: number): PlayedMove {
  return {
    ply,
    color: move.color,
    san: move.san,
    uci: move.lan,
    from: move.from,
    to: move.to,
    piece: move.piece,
    ...(move.captured ? { captured: move.captured } : {}),
    ...(move.promotion ? { promotion: move.promotion as PromotionPiece } : {}),
    fenBefore: move.before,
    fenAfter: move.after,
  };
}

function toLegalMove(move: ChessJsMove): LegalMove {
  return {
    from: move.from,
    to: move.to,
    san: move.san,
    uci: move.lan,
    ...(move.promotion ? { promotion: move.promotion as PromotionPiece } : {}),
  };
}

/**
 * Read-only view of a game position, rebuilt by replaying a GameRecord so that
 * repetition history is always correct. Instances are never mutated after construction.
 */
export class ChessPosition {
  readonly record: GameRecord;
  readonly history: readonly PlayedMove[];
  private readonly chess: Chess;

  private constructor(record: GameRecord, chess: Chess, history: PlayedMove[]) {
    this.record = record;
    this.chess = chess;
    this.history = history;
  }

  static fromRecord(record: GameRecord): Result<ChessPosition> {
    const fen = validateFen(record.startFen);
    if (!fen.ok) return { ok: false, error: `Invalid start position: ${fen.error}` };
    const chess = new Chess(fen.value);
    const history: PlayedMove[] = [];
    for (const [index, uci] of record.moves.entries()) {
      const input = parseUciMove(uci);
      if (!input) return { ok: false, error: `Malformed move "${uci}" at ply ${index + 1}` };
      try {
        history.push(toPlayedMove(chess.move(input), index + 1));
      } catch {
        return { ok: false, error: `Illegal move "${uci}" at ply ${index + 1}` };
      }
    }
    return { ok: true, value: new ChessPosition({ startFen: fen.value, moves: [...record.moves] }, chess, history) };
  }

  static initial(startFen: string = STARTING_FEN): Result<ChessPosition> {
    return ChessPosition.fromRecord({ startFen, moves: [] });
  }

  get fen(): string {
    return this.chess.fen();
  }

  get turn(): Color {
    return this.chess.turn();
  }

  get inCheck(): boolean {
    return this.chess.inCheck();
  }

  get lastMove(): PlayedMove | undefined {
    return this.history[this.history.length - 1];
  }

  status(): GameStatus {
    const c = this.chess;
    if (c.isCheckmate()) return { kind: 'checkmate', winner: otherColor(c.turn()) };
    if (c.isStalemate()) return { kind: 'draw', reason: 'stalemate' };
    if (c.isInsufficientMaterial()) return { kind: 'draw', reason: 'insufficient-material' };
    if (c.isThreefoldRepetition()) return { kind: 'draw', reason: 'threefold-repetition' };
    if (c.isDrawByFiftyMoves()) return { kind: 'draw', reason: 'fifty-move-rule' };
    return { kind: 'in-progress', turn: c.turn(), inCheck: c.inCheck() };
  }

  isGameOver(): boolean {
    return this.status().kind !== 'in-progress';
  }

  legalMoves(from?: string): LegalMove[] {
    if (from !== undefined && !isSquare(from)) return [];
    const moves = from ? this.chess.moves({ square: from as Square, verbose: true }) : this.chess.moves({ verbose: true });
    return moves.map(toLegalMove);
  }

  /** True when moving from → to is a legal pawn promotion (the caller must ask which piece). */
  isPromotion(from: string, to: string): boolean {
    return this.legalMoves(from).some((m) => m.to === to && m.promotion !== undefined);
  }

  /** Square of the king of the side to move when it is in check, else null. */
  checkedKingSquare(): string | null {
    if (!this.chess.inCheck()) return null;
    const turn = this.chess.turn();
    for (const row of this.chess.board()) {
      for (const cell of row) {
        if (cell && cell.type === 'k' && cell.color === turn) return cell.square;
      }
    }
    return null;
  }

  pieceAt(square: string): { color: Color; type: PieceSymbol } | null {
    if (!isSquare(square)) return null;
    const piece = this.chess.get(square);
    return piece ? { color: piece.color, type: piece.type } : null;
  }

  /** Returns a new position with the move applied, or an error if the move is not legal here. */
  play(input: MoveInput): Result<ChessPosition> {
    if (!isSquare(input.from) || !isSquare(input.to)) return { ok: false, error: 'Invalid square' };
    if (this.isGameOver()) return { ok: false, error: 'The game is over' };
    const legal = this.legalMoves(input.from).find(
      (m) => m.to === input.to && (m.promotion ?? undefined) === (input.promotion ?? undefined),
    );
    if (!legal) {
      if (this.isPromotion(input.from, input.to) && !input.promotion) {
        return { ok: false, error: 'Choose a promotion piece' };
      }
      return { ok: false, error: 'Illegal move' };
    }
    return ChessPosition.fromRecord({ startFen: this.record.startFen, moves: [...this.record.moves, legal.uci] });
  }

  /** Parses a typed move in SAN ("Nf3", "exd5", "O-O", "e8=Q") or UCI ("g1f3", "e7e8q"). */
  parseMoveText(text: string): Result<MoveInput> {
    const trimmed = text.trim();
    if (!trimmed) return { ok: false, error: 'Enter a move' };
    const uci = parseUciMove(trimmed);
    if (uci) {
      const legal = this.legalMoves(uci.from).find(
        (m) => m.to === uci.to && (m.promotion ?? undefined) === (uci.promotion ?? undefined),
      );
      return legal ? { ok: true, value: uci } : { ok: false, error: `"${trimmed}" is not a legal move here` };
    }
    const normalized = trimmed.replace(/0/g, 'O');
    const match = this.legalMoves().find(
      (m) => m.san === normalized || m.san.replace(/[+#]$/, '') === normalized.replace(/[+#!?]+$/, ''),
    );
    if (!match) return { ok: false, error: `"${trimmed}" is not a legal move here` };
    return {
      ok: true,
      value: match.promotion ? { from: match.from, to: match.to, promotion: match.promotion } : { from: match.from, to: match.to },
    };
  }

  pgn(headers: Record<string, string> = {}): string {
    const chess = new Chess(this.record.startFen);
    for (const [key, value] of Object.entries(headers)) chess.setHeader(key, value);
    if (this.record.startFen !== STARTING_FEN) {
      chess.setHeader('SetUp', '1');
      chess.setHeader('FEN', this.record.startFen);
    }
    for (const move of this.record.moves) chess.move(parseUciMove(move)!);
    return chess.pgn();
  }
}

export interface ParsedPgn {
  readonly record: GameRecord;
  readonly headers: Readonly<Record<string, string>>;
}

export const MAX_PGN_LENGTH = 100_000;

/** Parses a single-game PGN into a GameRecord. All moves are re-validated by replaying them. */
export function parsePgn(pgn: string): Result<ParsedPgn> {
  const text = pgn.trim();
  if (!text) return { ok: false, error: 'Paste a PGN to import' };
  if (text.length > MAX_PGN_LENGTH) return { ok: false, error: `PGN is too long (limit ${MAX_PGN_LENGTH.toLocaleString('en')} characters)` };
  const chess = new Chess();
  try {
    chess.loadPgn(text);
  } catch (error) {
    return { ok: false, error: `Could not read the PGN: ${error instanceof Error ? error.message : 'invalid format'}` };
  }
  const moves = chess.history({ verbose: true });
  if (moves.length === 0) return { ok: false, error: 'The PGN contains no moves' };
  const position = ChessPosition.fromRecord({ startFen: moves[0]!.before, moves: moves.map((m) => m.lan) });
  if (!position.ok) return position;
  return { ok: true, value: { record: position.value.record, headers: chess.getHeaders() } };
}
