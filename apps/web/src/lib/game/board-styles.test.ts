import { ChessPosition } from '@acc/chess-core';
import { describe, expect, it } from 'vitest';
import { computeSquareStyles } from './board-styles';

function pos(startFen: string, moves: string[] = []) {
  const result = ChessPosition.fromRecord({ startFen, moves });
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('computeSquareStyles', () => {
  it('is empty at the start with nothing selected', () => {
    expect(computeSquareStyles({ position: pos(START), selected: null, playerColor: 'w' })).toEqual({});
  });

  it('highlights the last move, the selection and legal targets', () => {
    const styles = computeSquareStyles({ position: pos(START, ['e2e4', 'd7d5']), selected: 'e4', playerColor: 'w' });
    expect(Object.keys(styles).sort()).toEqual(['d5', 'd7', 'e4', 'e5'].sort());
    expect(String(styles.d5?.background)).toContain('58%');
    expect(String(styles.e5?.background)).toContain('20%');
  });

  it('marks a king in check', () => {
    const styles = computeSquareStyles({ position: pos(START, ['e2e4', 'f7f6', 'd1h5']), selected: null, playerColor: 'b' });
    expect(String(styles.e8?.background)).toContain('239, 68, 68');
  });
});
