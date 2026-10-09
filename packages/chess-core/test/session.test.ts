import { describe, expect, it } from 'vitest';
import {
  applyEngineMove,
  applyPlayerMove,
  canUndo,
  createSession,
  isEnginesTurn,
  isPlayersTurn,
  resign,
  sessionPgn,
  undoLastTurn,
  type GameSession,
} from '../src';

function unwrap<T>(result: { ok: true; value: T } | { ok: false; error: string }): T {
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

function newSession(playerColor: 'w' | 'b' = 'w', startFen?: string): GameSession {
  return unwrap(createSession({ playerColor, difficulty: 2, ...(startFen ? { startFen } : {}) }));
}

describe('game session', () => {
  it('validates options', () => {
    expect(createSession({ playerColor: 'w', difficulty: 99 }).ok).toBe(false);
    expect(createSession({ playerColor: 'w', startFen: 'garbage' }).ok).toBe(false);
  });

  it('alternates between player and engine turns', () => {
    let s = newSession('w');
    expect(isPlayersTurn(s)).toBe(true);
    expect(applyEngineMove(s, 'e2e4').ok).toBe(false);
    s = unwrap(applyPlayerMove(s, { from: 'e2', to: 'e4' }));
    expect(isEnginesTurn(s)).toBe(true);
    expect(applyPlayerMove(s, { from: 'd7', to: 'd5' }).ok).toBe(false);
    s = unwrap(applyEngineMove(s, 'e7e5'));
    expect(isPlayersTurn(s)).toBe(true);
  });

  it('lets the engine move first when the player is black', () => {
    const s = newSession('b');
    expect(isEnginesTurn(s)).toBe(true);
    expect(canUndo(s)).toBe(false);
  });

  it('rejects malformed or illegal engine moves', () => {
    const s = unwrap(applyPlayerMove(newSession('w'), { from: 'e2', to: 'e4' }));
    expect(applyEngineMove(s, 'bogus')).toEqual({ ok: false, error: 'Engine returned a malformed move: "bogus"' });
    expect(applyEngineMove(s, 'e7e4')).toEqual({ ok: false, error: 'Engine returned an illegal move: "e7e4"' });
  });

  it('records checkmate results and blocks further moves', () => {
    let s = newSession('b');
    s = unwrap(applyEngineMove(s, 'f2f3'));
    s = unwrap(applyPlayerMove(s, { from: 'e7', to: 'e5' }));
    s = unwrap(applyEngineMove(s, 'g2g4'));
    s = unwrap(applyPlayerMove(s, { from: 'd8', to: 'h4' }));
    expect(s.result).toEqual({ outcome: '0-1', winner: 'b', termination: 'checkmate' });
    expect(isEnginesTurn(s)).toBe(false);
    expect(applyEngineMove(s, 'a2a3')).toEqual({ ok: false, error: 'The game is over' });
    expect(sessionPgn(s)).toContain('[Result "0-1"]');
  });

  it('records draws', () => {
    const s = unwrap(applyPlayerMove(newSession('w', '7k/8/5QK1/8/8/8/8/8 w - - 0 1'), { from: 'f6', to: 'f7' }));
    expect(s.result).toEqual({ outcome: '1/2-1/2', winner: null, termination: 'stalemate' });
  });

  it('undo takes back the player move and the engine reply', () => {
    let s = newSession('w');
    s = unwrap(applyPlayerMove(s, { from: 'e2', to: 'e4' }));
    s = unwrap(applyEngineMove(s, 'e7e5'));
    s = unwrap(applyPlayerMove(s, { from: 'g1', to: 'f3' }));
    s = unwrap(applyEngineMove(s, 'b8c6'));
    s = unwrap(undoLastTurn(s));
    expect(s.position.record.moves).toEqual(['e2e4', 'e7e5']);
    expect(isPlayersTurn(s)).toBe(true);
  });

  it('undo while the engine is thinking takes back only the player move', () => {
    let s = newSession('w');
    s = unwrap(applyPlayerMove(s, { from: 'e2', to: 'e4' }));
    s = unwrap(undoLastTurn(s));
    expect(s.position.record.moves).toEqual([]);
    expect(undoLastTurn(s).ok).toBe(false);
  });

  it("undo as black keeps the engine's first move", () => {
    let s = newSession('b');
    s = unwrap(applyEngineMove(s, 'e2e4'));
    s = unwrap(applyPlayerMove(s, { from: 'e7', to: 'e5' }));
    s = unwrap(applyEngineMove(s, 'g1f3'));
    s = unwrap(undoLastTurn(s));
    expect(s.position.record.moves).toEqual(['e2e4']);
    expect(isPlayersTurn(s)).toBe(true);
  });

  it('undo after checkmate reopens the game', () => {
    let s = newSession('w', '6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1');
    s = unwrap(applyPlayerMove(s, { from: 'a1', to: 'a8' }));
    expect(s.result?.termination).toBe('checkmate');
    s = unwrap(undoLastTurn(s));
    expect(s.result).toBeNull();
  });

  it('resignation ends the game and cannot be undone', () => {
    let s = unwrap(applyPlayerMove(newSession('w'), { from: 'e2', to: 'e4' }));
    s = unwrap(resign(s));
    expect(s.result).toEqual({ outcome: '0-1', winner: 'b', termination: 'resignation' });
    expect(canUndo(s)).toBe(false);
    expect(resign(s).ok).toBe(false);
  });
});
