import { describe, expect, it } from 'vitest';
import { goCommand, parseUciLine, positionCommand, setOptionCommand } from '../src';

describe('parseUciLine', () => {
  it('parses handshake messages', () => {
    expect(parseUciLine('uciok')).toEqual({ type: 'uciok' });
    expect(parseUciLine('readyok\n')).toEqual({ type: 'readyok' });
    expect(parseUciLine('id name Stockfish 19')).toEqual({ type: 'id', key: 'name', value: 'Stockfish 19' });
  });

  it('parses bestmove with and without ponder, and no-move results', () => {
    expect(parseUciLine('bestmove e2e4 ponder e7e5')).toEqual({ type: 'bestmove', move: 'e2e4', ponder: 'e7e5' });
    expect(parseUciLine('bestmove g1f3')).toEqual({ type: 'bestmove', move: 'g1f3' });
    expect(parseUciLine('bestmove (none)')).toEqual({ type: 'bestmove', move: null });
  });

  it('parses info lines with cp and mate scores', () => {
    const cp = parseUciLine('info depth 8 seldepth 12 multipv 1 score cp -36 nodes 7548 nps 471750 hashfull 3 time 16 pv c7c5 g1f3');
    expect(cp).toEqual({
      type: 'info',
      info: { depth: 8, seldepth: 12, multipv: 1, score: { type: 'cp', value: -36 }, nodes: 7548, nps: 471750, timeMs: 16, pv: ['c7c5', 'g1f3'] },
    });
    const mate = parseUciLine('info depth 3 score mate -2 pv h4e1');
    expect(mate.type === 'info' && mate.info.score).toEqual({ type: 'mate', value: -2 });
  });

  it('tolerates info strings and garbage', () => {
    expect(parseUciLine('info string NNUE evaluation enabled')).toEqual({ type: 'info', info: {}, string: 'NNUE evaluation enabled' });
    expect(parseUciLine('info depth banana score cp')).toEqual({ type: 'info', info: {} });
    expect(parseUciLine('Stockfish 19 by the Stockfish developers')).toEqual({ type: 'other', line: 'Stockfish 19 by the Stockfish developers' });
    expect(parseUciLine('')).toEqual({ type: 'other', line: '' });
  });
});

describe('command builders', () => {
  it('builds position and go commands', () => {
    expect(positionCommand('8/8/8/8/8/8/8/K6k w - - 0 1', [])).toBe('position fen 8/8/8/8/8/8/8/K6k w - - 0 1');
    expect(positionCommand('F', ['e2e4', 'e7e5'])).toBe('position fen F moves e2e4 e7e5');
    expect(goCommand({ depth: 4, movetimeMs: 200.7 })).toBe('go depth 4 movetime 200');
    expect(() => goCommand({})).toThrow();
    expect(setOptionCommand('Skill Level', 5)).toBe('setoption name Skill Level value 5');
  });
});
