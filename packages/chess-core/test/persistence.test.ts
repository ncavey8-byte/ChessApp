import { describe, expect, it } from 'vitest';
import {
  MAX_PGN_LENGTH,
  STARTING_FEN,
  applyPlayerMove,
  archiveFromPgn,
  archiveFromSession,
  archivedPgn,
  createMemoryStorage,
  createSession,
  createStorageGameRepository,
  parseArchivedGame,
  parsePgn,
  parseSavedSession,
  resign,
  restoreSession,
  toSavedSession,
  type GameSession,
} from '../src';

function unwrap<T>(result: { ok: true; value: T } | { ok: false; error: string }): T {
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

function sessionWithMoves(...moves: Array<[string, string]>): GameSession {
  let session = unwrap(createSession({ playerColor: 'w', difficulty: 2 }));
  for (const [from, to] of moves) {
    session = { ...session, playerColor: session.position.turn };
    session = unwrap(applyPlayerMove(session, { from, to }));
  }
  return { ...session, playerColor: 'w' };
}

describe('parsePgn', () => {
  it('reads moves and headers', () => {
    const parsed = unwrap(parsePgn('[White "Ann"]\n[Black "Bob"]\n[Result "1-0"]\n\n1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0'));
    expect(parsed.record.moves).toEqual(['e2e4', 'e7e5', 'd1h5', 'b8c6', 'f1c4', 'g8f6', 'h5f7']);
    expect(parsed.record.startFen).toBe(STARTING_FEN);
    expect(parsed.headers.White).toBe('Ann');
  });

  it('supports games from a custom position', () => {
    const fen = '6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1';
    const parsed = unwrap(parsePgn(`[SetUp "1"]\n[FEN "${fen}"]\n\n1. Ra8# *`));
    expect(parsed.record).toEqual({ startFen: fen, moves: ['a1a8'] });
  });

  it('rejects empty, oversized, illegal and move-less input', () => {
    expect(parsePgn('   ').ok).toBe(false);
    expect(parsePgn('1. e4 '.repeat(MAX_PGN_LENGTH)).ok).toBe(false);
    const illegal = parsePgn('1. e4 e5 2. Ke3 Ke6 3. Qxf7');
    expect(illegal.ok).toBe(false);
    expect(parsePgn('[White "Nobody"]\n\n*').ok).toBe(false);
    expect(parsePgn('this is not chess').ok).toBe(false);
  });
});

describe('saved sessions', () => {
  it('round-trips an in-progress game through JSON', () => {
    const session = sessionWithMoves(['e2', 'e4'], ['e7', 'e5']);
    const saved = toSavedSession(session, 'g1', '2026-01-01T00:00:00.000Z', new Date('2026-01-01T00:05:00Z'));
    const parsed = unwrap(parseSavedSession(JSON.parse(JSON.stringify(saved))));
    const restored = unwrap(restoreSession(parsed));
    expect(restored.position.record.moves).toEqual(['e2e4', 'e7e5']);
    expect(restored.playerColor).toBe('w');
    expect(restored.difficulty).toBe(2);
    expect(restored.result).toBeNull();
  });

  it('restores resignations', () => {
    const resigned = unwrap(resign(sessionWithMoves(['e2', 'e4'])));
    const restored = unwrap(restoreSession(toSavedSession(resigned, 'g2', '2026-01-01T00:00:00.000Z')));
    expect(restored.result).toMatchObject({ termination: 'resignation', winner: 'b' });
  });

  it('rejects malformed saves', () => {
    const valid = toSavedSession(sessionWithMoves(['e2', 'e4']), 'g3', '2026-01-01T00:00:00.000Z');
    const bad: unknown[] = [
      null,
      'text',
      [],
      { ...valid, version: 2 },
      { ...valid, id: '' },
      { ...valid, playerColor: 'x' },
      { ...valid, difficulty: 99 },
      { ...valid, resigned: 'no' },
      { ...valid, record: { startFen: 'bad', moves: [] } },
      { ...valid, record: { startFen: STARTING_FEN, moves: ['e2e5'] } },
      { ...valid, record: { startFen: STARTING_FEN, moves: [42] } },
    ];
    for (const value of bad) expect(parseSavedSession(value).ok, JSON.stringify(value)).toBe(false);
  });
});

describe('archived games', () => {
  it('archives a finished game and exports PGN', () => {
    const finished = unwrap(resign(sessionWithMoves(['e2', 'e4'])));
    const archived = archiveFromSession(finished, 'a1', new Date('2026-02-03T00:00:00Z'));
    expect(archived).toMatchObject({ white: 'You', black: 'Stockfish (level 2)', outcome: '0-1', termination: 'resignation' });
    const pgn = archivedPgn(archived);
    expect(pgn).toContain('[Result "0-1"]');
    expect(pgn).toContain('1. e4');
    expect(unwrap(parsePgn(pgn)).record.moves).toEqual(['e2e4']);
  });

  it('derives the result of imported games from the final position', () => {
    const parsed = unwrap(parsePgn('[White "Ann"]\n[Black "?"]\n[Result "*"]\n\n1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7#'));
    const archived = archiveFromPgn(parsed, 'a2');
    expect(archived).toMatchObject({ source: 'imported', white: 'Ann', black: 'Black', outcome: '1-0', termination: 'checkmate', playerColor: null });
  });

  it('drops a cached analysis that does not match the game', () => {
    const archived = archiveFromSession(sessionWithMoves(['e2', 'e4']), 'a3');
    const stale = { ...archived, analysis: { version: 1, record: { startFen: STARTING_FEN, moves: ['d2d4'] }, moves: [{}], positions: [{}, {}] } };
    expect(unwrap(parseArchivedGame(JSON.parse(JSON.stringify(stale)))).analysis).toBeNull();
    expect(parseArchivedGame({ ...archived, outcome: 'win' }).ok).toBe(false);
    expect(parseArchivedGame({ ...archived, termination: 'boredom' }).ok).toBe(false);
  });
});

describe('storage repository', () => {
  it('saves, loads and clears the current game', async () => {
    const storage = createMemoryStorage();
    const repo = createStorageGameRepository(storage);
    expect(await repo.loadCurrent()).toBeNull();
    const saved = toSavedSession(sessionWithMoves(['e2', 'e4']), 'c1', '2026-01-01T00:00:00.000Z');
    await repo.saveCurrent(saved);
    expect(await repo.loadCurrent()).toEqual(saved);
    await repo.clearCurrent();
    expect(await repo.loadCurrent()).toBeNull();
  });

  it('ignores corrupt storage instead of throwing', async () => {
    const storage = createMemoryStorage({ 'acc:v1:current-game': '{not json', 'acc:v1:archive': '[{"version":1},"junk"]' });
    const repo = createStorageGameRepository(storage);
    expect(await repo.loadCurrent()).toBeNull();
    expect(await repo.listArchived()).toEqual([]);
  });

  it('keeps the archive newest-first, de-duplicated and capped', async () => {
    const repo = createStorageGameRepository(createMemoryStorage(), { maxArchived: 3 });
    const game = (id: string) => archiveFromSession(sessionWithMoves(['e2', 'e4']), id);
    for (const id of ['a', 'b', 'c', 'd']) await repo.saveArchived(game(id));
    await repo.saveArchived(game('b'));
    expect((await repo.listArchived()).map((g) => g.id)).toEqual(['b', 'd', 'c']);
    expect(await repo.getArchived('a')).toBeNull();
    await repo.deleteArchived('d');
    expect((await repo.listArchived()).map((g) => g.id)).toEqual(['b', 'c']);
  });
});
