import { getDifficulty, type Color, type GameResult, type Termination } from '@acc/chess-core';

export const COLOR_NAMES: Record<Color, string> = { w: 'White', b: 'Black' };

const TERMINATION_LABELS: Record<Termination, string> = {
  checkmate: 'by checkmate',
  resignation: 'by resignation',
  stalemate: 'by stalemate',
  'threefold-repetition': 'by threefold repetition',
  'insufficient-material': 'by insufficient material',
  'fifty-move-rule': 'by the fifty-move rule',
};

export function describeResult(result: GameResult, playerColor: Color): { title: string; detail: string } {
  const how = TERMINATION_LABELS[result.termination];
  if (result.winner === null) return { title: 'Draw', detail: `Drawn ${how} (${result.outcome})` };
  if (result.winner === playerColor) return { title: 'You won!', detail: `You won ${how} (${result.outcome})` };
  return { title: 'Stockfish won', detail: `Stockfish won ${how} (${result.outcome})` };
}

export function opponentLabel(difficulty: number): string {
  const preset = getDifficulty(difficulty);
  return `Stockfish · Level ${preset.level} (${preset.label})`;
}

/** Groups SAN moves into numbered rows: [{ number, white, black }]. */
export function moveRows(
  sans: readonly string[],
  firstMoveColor: Color,
  firstMoveNumber: number,
): Array<{ number: number; white?: string; black?: string; whitePly?: number; blackPly?: number }> {
  const rows: Array<{ number: number; white?: string; black?: string; whitePly?: number; blackPly?: number }> = [];
  let index = 0;
  let number = firstMoveNumber;
  if (firstMoveColor === 'b' && sans.length > 0) {
    rows.push({ number, black: sans[0]!, blackPly: 1 });
    index = 1;
    number++;
  }
  for (; index < sans.length; index += 2) {
    const row: { number: number; white?: string; black?: string; whitePly?: number; blackPly?: number } = {
      number,
      white: sans[index]!,
      whitePly: index + 1,
    };
    if (index + 1 < sans.length) {
      row.black = sans[index + 1]!;
      row.blackPly = index + 2;
    }
    rows.push(row);
    number++;
  }
  return rows;
}
