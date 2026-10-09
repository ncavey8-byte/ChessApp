import type { ChessPosition, Color } from '@acc/chess-core';
import type { CSSProperties } from 'react';

const LAST_MOVE: CSSProperties = { backgroundColor: 'rgba(234, 179, 8, 0.32)' };
const SELECTED: CSSProperties = { backgroundColor: 'rgba(234, 179, 8, 0.55)' };
const CHECK: CSSProperties = {
  background: 'radial-gradient(circle, rgba(239, 68, 68, 0.9) 0%, rgba(239, 68, 68, 0.45) 45%, transparent 75%)',
};
const QUIET_TARGET: CSSProperties = {
  background: 'radial-gradient(circle, rgba(15, 23, 42, 0.32) 20%, transparent 22%)',
  cursor: 'pointer',
};
const CAPTURE_TARGET: CSSProperties = {
  background: 'radial-gradient(circle, transparent 58%, rgba(15, 23, 42, 0.32) 60%)',
  cursor: 'pointer',
};

export interface SquareStyleInput {
  position: ChessPosition;
  selected: string | null;
  playerColor: Color;
}

/** Highlight styles for the board: last move, check, selection and legal targets. */
export function computeSquareStyles({ position, selected }: SquareStyleInput): Record<string, CSSProperties> {
  const styles: Record<string, CSSProperties> = {};
  const last = position.lastMove;
  if (last) {
    styles[last.from] = LAST_MOVE;
    styles[last.to] = LAST_MOVE;
  }
  const checked = position.checkedKingSquare();
  if (checked) styles[checked] = CHECK;
  if (selected) {
    styles[selected] = SELECTED;
    for (const move of position.legalMoves(selected)) {
      styles[move.to] = position.pieceAt(move.to) ? CAPTURE_TARGET : QUIET_TARGET;
    }
  }
  return styles;
}
