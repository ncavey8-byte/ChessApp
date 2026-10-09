import { describe, expect, it } from 'vitest';
import { describeResult, moveRows, opponentLabel } from './labels';

describe('describeResult', () => {
  it('describes wins, losses and draws from the player perspective', () => {
    expect(describeResult({ outcome: '1-0', winner: 'w', termination: 'checkmate' }, 'w')).toEqual({
      title: 'You won!',
      detail: 'You won by checkmate (1-0)',
    });
    expect(describeResult({ outcome: '1-0', winner: 'w', termination: 'resignation' }, 'b').title).toBe('Stockfish won');
    expect(describeResult({ outcome: '1/2-1/2', winner: null, termination: 'threefold-repetition' }, 'w')).toEqual({
      title: 'Draw',
      detail: 'Drawn by threefold repetition (1/2-1/2)',
    });
  });
});

describe('moveRows', () => {
  it('pairs moves starting with white', () => {
    expect(moveRows(['e4', 'e5', 'Nf3'], 'w', 1)).toEqual([
      { number: 1, white: 'e4', whitePly: 1, black: 'e5', blackPly: 2 },
      { number: 2, white: 'Nf3', whitePly: 3 },
    ]);
  });

  it('handles positions where black moves first', () => {
    expect(moveRows(['Kb2', 'Kc4'], 'b', 40)).toEqual([
      { number: 40, black: 'Kb2', blackPly: 1 },
      { number: 41, white: 'Kc4', whitePly: 2 },
    ]);
    expect(moveRows([], 'b', 1)).toEqual([]);
  });
});

describe('opponentLabel', () => {
  it('names the level', () => {
    expect(opponentLabel(1)).toBe('Stockfish · Level 1 (Beginner)');
  });
});
