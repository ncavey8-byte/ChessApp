import { describe, expect, it } from 'vitest';
import { ChessPosition, STARTING_FEN, parseUciMove, validateFen, type GameRecord } from '../src';

function position(record: Partial<GameRecord> = {}): ChessPosition {
  const result = ChessPosition.fromRecord({ startFen: STARTING_FEN, moves: [], ...record });
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

function play(pos: ChessPosition, ...ucis: string[]): ChessPosition {
  let current = pos;
  for (const uci of ucis) {
    const next = current.play(parseUciMove(uci)!);
    if (!next.ok) throw new Error(`${uci}: ${next.error}`);
    current = next.value;
  }
  return current;
}

describe('ChessPosition basics', () => {
  it('starts with 20 legal moves and white to move', () => {
    const pos = position();
    expect(pos.turn).toBe('w');
    expect(pos.legalMoves()).toHaveLength(20);
    expect(pos.status()).toEqual({ kind: 'in-progress', turn: 'w', inCheck: false });
  });

  it('is immutable: playing a move returns a new position', () => {
    const start = position();
    const next = play(start, 'e2e4');
    expect(start.fen).toBe(STARTING_FEN);
    expect(next.turn).toBe('b');
    expect(next.record.moves).toEqual(['e2e4']);
    expect(next.lastMove?.san).toBe('e4');
  });

  it('rejects illegal moves and moves of the wrong colour', () => {
    const pos = position();
    expect(pos.play({ from: 'e2', to: 'e5' })).toEqual({ ok: false, error: 'Illegal move' });
    expect(pos.play({ from: 'e7', to: 'e5' })).toEqual({ ok: false, error: 'Illegal move' });
    expect(pos.play({ from: 'z9', to: 'e4' })).toEqual({ ok: false, error: 'Invalid square' });
  });

  it('lists legal moves for a square and ignores bad squares', () => {
    const pos = position();
    expect(pos.legalMoves('g1').map((m) => m.to).sort()).toEqual(['f3', 'h3']);
    expect(pos.legalMoves('e4')).toEqual([]);
    expect(pos.legalMoves('nope')).toEqual([]);
  });
});

describe('special moves', () => {
  it('supports kingside and queenside castling', () => {
    const fen = 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1';
    const kingside = play(position({ startFen: fen }), 'e1g1');
    expect(kingside.lastMove?.san).toBe('O-O');
    expect(kingside.pieceAt('f1')).toEqual({ color: 'w', type: 'r' });
    const queenside = play(kingside, 'e8c8');
    expect(queenside.lastMove?.san).toBe('O-O-O');
    expect(queenside.pieceAt('d8')).toEqual({ color: 'b', type: 'r' });
  });

  it('forbids castling through check', () => {
    const pos = position({ startFen: '4k3/8/8/8/8/8/5r2/4K2R w K - 0 1' });
    expect(pos.play({ from: 'e1', to: 'g1' }).ok).toBe(false);
  });

  it('supports en passant captures', () => {
    const pos = play(position(), 'e2e4', 'a7a6', 'e4e5', 'd7d5', 'e5d6');
    expect(pos.lastMove?.san).toBe('exd6');
    expect(pos.lastMove?.captured).toBe('p');
    expect(pos.pieceAt('d5')).toBeNull();
  });

  it('requires a promotion piece and supports under-promotion', () => {
    const pos = position({ startFen: '8/P7/8/8/8/8/8/k6K w - - 0 1' });
    expect(pos.isPromotion('a7', 'a8')).toBe(true);
    expect(pos.play({ from: 'a7', to: 'a8' })).toEqual({ ok: false, error: 'Choose a promotion piece' });
    const knight = play(pos, 'a7a8n');
    expect(knight.pieceAt('a8')).toEqual({ color: 'w', type: 'n' });
    expect(knight.lastMove?.uci).toBe('a7a8n');
  });
});

describe('game termination', () => {
  it("detects checkmate (fool's mate)", () => {
    const pos = play(position(), 'f2f3', 'e7e5', 'g2g4', 'd8h4');
    expect(pos.status()).toEqual({ kind: 'checkmate', winner: 'b' });
    expect(pos.isGameOver()).toBe(true);
    expect(pos.checkedKingSquare()).toBe('e1');
    expect(pos.play({ from: 'a2', to: 'a3' })).toEqual({ ok: false, error: 'The game is over' });
  });

  it('detects stalemate', () => {
    const pos = play(position({ startFen: '7k/8/5QK1/8/8/8/8/8 w - - 0 1' }), 'f6f7');
    expect(pos.status()).toEqual({ kind: 'draw', reason: 'stalemate' });
  });

  it('detects insufficient material', () => {
    expect(position({ startFen: '8/8/8/8/8/8/8/KB5k w - - 0 1' }).status()).toEqual({ kind: 'draw', reason: 'insufficient-material' });
    expect(position({ startFen: '8/8/8/8/8/8/8/KR5k w - - 0 1' }).status().kind).toBe('in-progress');
    const bare = play(position({ startFen: '8/8/8/8/8/8/1q6/K6k w - - 0 1' }), 'a1b2');
    expect(bare.status()).toEqual({ kind: 'draw', reason: 'insufficient-material' });
  });

  it('detects threefold repetition', () => {
    const pos = play(position(), 'g1f3', 'g8f6', 'f3g1', 'f6g8', 'g1f3', 'g8f6', 'f3g1', 'f6g8');
    expect(pos.status()).toEqual({ kind: 'draw', reason: 'threefold-repetition' });
  });

  it('detects the fifty-move rule', () => {
    const pos = play(position({ startFen: '8/8/8/4k3/8/8/4K3/R7 w - - 99 80' }), 'a1a2');
    expect(pos.status()).toEqual({ kind: 'draw', reason: 'fifty-move-rule' });
  });
});

describe('malformed input', () => {
  it('rejects invalid FEN strings', () => {
    expect(validateFen('not a fen').ok).toBe(false);
    expect(validateFen('8/8/8/8/8/8/8/8 w - - 0 1').ok).toBe(false);
    expect(ChessPosition.initial('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP w KQkq - 0 1').ok).toBe(false);
  });

  it('rejects records with malformed or illegal moves', () => {
    expect(ChessPosition.fromRecord({ startFen: STARTING_FEN, moves: ['e2e4', 'xx'] })).toEqual({
      ok: false,
      error: 'Malformed move "xx" at ply 2',
    });
    expect(ChessPosition.fromRecord({ startFen: STARTING_FEN, moves: ['e2e5'] })).toEqual({
      ok: false,
      error: 'Illegal move "e2e5" at ply 1',
    });
  });

  it('parses UCI strictly', () => {
    expect(parseUciMove('e7e8q')).toEqual({ from: 'e7', to: 'e8', promotion: 'q' });
    expect(parseUciMove('e7e8k')).toBeNull();
    expect(parseUciMove('e9e8')).toBeNull();
    expect(parseUciMove('')).toBeNull();
  });
});

describe('typed moves', () => {
  it('accepts SAN, UCI and castling written with zeros', () => {
    const pos = position();
    expect(pos.parseMoveText('Nf3')).toEqual({ ok: true, value: { from: 'g1', to: 'f3' } });
    expect(pos.parseMoveText(' e2e4 ')).toEqual({ ok: true, value: { from: 'e2', to: 'e4' } });
    const castle = position({ startFen: 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1' });
    expect(castle.parseMoveText('0-0')).toEqual({ ok: true, value: { from: 'e1', to: 'g1' } });
  });

  it('accepts promotions and ignores check suffixes', () => {
    const pos = position({ startFen: '8/P7/8/8/8/8/8/k6K w - - 0 1' });
    expect(pos.parseMoveText('a8=Q+')).toEqual({ ok: true, value: { from: 'a7', to: 'a8', promotion: 'q' } });
  });

  it('rejects illegal or empty text', () => {
    const pos = position();
    expect(pos.parseMoveText('Ke2').ok).toBe(false);
    expect(pos.parseMoveText('e2e5').ok).toBe(false);
    expect(pos.parseMoveText('   ')).toEqual({ ok: false, error: 'Enter a move' });
  });
});

describe('PGN', () => {
  it('exports moves and records non-standard start positions', () => {
    const pgn = play(position(), 'e2e4', 'e7e5').pgn({ White: 'A', Black: 'B' });
    expect(pgn).toContain('[White "A"]');
    expect(pgn).toContain('1. e4 e5');
    const custom = position({ startFen: '8/P7/8/8/8/8/8/k6K w - - 0 1' }).pgn();
    expect(custom).toContain('[SetUp "1"]');
    expect(custom).toContain('[FEN "8/P7/8/8/8/8/8/k6K w - - 0 1"]');
  });
});
