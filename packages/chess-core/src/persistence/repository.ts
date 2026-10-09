import type { Result } from '../game/game';
import { parseArchivedGame, parseSavedSession, type ArchivedGame, type SavedSession } from './saved-game';

/** Minimal key-value store: satisfied by window.localStorage and (async) React Native AsyncStorage. */
export interface KeyValueStorage {
  getItem(key: string): string | null | Promise<string | null>;
  setItem(key: string, value: string): void | Promise<void>;
  removeItem(key: string): void | Promise<void>;
}

/** Storage boundary for games. The local implementation is replaced by a Supabase-backed one in M3. */
export interface GameRepository {
  loadCurrent(): Promise<SavedSession | null>;
  saveCurrent(session: SavedSession): Promise<void>;
  clearCurrent(): Promise<void>;
  /** Newest first. */
  listArchived(): Promise<ArchivedGame[]>;
  getArchived(id: string): Promise<ArchivedGame | null>;
  /** Inserts or replaces (by id) and moves the game to the front. */
  saveArchived(game: ArchivedGame): Promise<void>;
  deleteArchived(id: string): Promise<void>;
}

export interface StorageRepositoryOptions {
  prefix?: string;
  maxArchived?: number;
}

function parseJson(text: string | null): Result<unknown> {
  if (text === null) return { ok: false, error: 'missing' };
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false, error: 'corrupt' };
  }
}

/**
 * GameRepository on top of a key-value store. Corrupt or outdated entries are
 * skipped rather than crashing the app, so a bad save never blocks playing.
 */
export function createStorageGameRepository(storage: KeyValueStorage, options: StorageRepositoryOptions = {}): GameRepository {
  const prefix = options.prefix ?? 'acc:v1:';
  const maxArchived = options.maxArchived ?? 30;
  const currentKey = `${prefix}current-game`;
  const archiveKey = `${prefix}archive`;

  async function readArchive(): Promise<ArchivedGame[]> {
    const parsed = parseJson(await storage.getItem(archiveKey));
    if (!parsed.ok || !Array.isArray(parsed.value)) return [];
    return parsed.value.flatMap((entry) => {
      const game = parseArchivedGame(entry);
      return game.ok ? [game.value] : [];
    });
  }

  return {
    async loadCurrent() {
      const parsed = parseJson(await storage.getItem(currentKey));
      if (!parsed.ok) return null;
      const saved = parseSavedSession(parsed.value);
      return saved.ok ? saved.value : null;
    },
    async saveCurrent(session) {
      await storage.setItem(currentKey, JSON.stringify(session));
    },
    async clearCurrent() {
      await storage.removeItem(currentKey);
    },
    listArchived: readArchive,
    async getArchived(id) {
      return (await readArchive()).find((g) => g.id === id) ?? null;
    },
    async saveArchived(game) {
      const others = (await readArchive()).filter((g) => g.id !== game.id);
      await storage.setItem(archiveKey, JSON.stringify([game, ...others].slice(0, maxArchived)));
    },
    async deleteArchived(id) {
      const remaining = (await readArchive()).filter((g) => g.id !== id);
      await storage.setItem(archiveKey, JSON.stringify(remaining));
    },
  };
}

/** In-memory KeyValueStorage, for tests and environments without persistent storage. */
export function createMemoryStorage(initial: Record<string, string> = {}): KeyValueStorage & { readonly data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}
