import { createMemoryStorage, createStorageGameRepository, type GameRepository, type KeyValueStorage } from '@acc/chess-core';

let repository: GameRepository | null = null;

function browserStorage(): KeyValueStorage {
  try {
    const storage = window.localStorage;
    const probe = 'acc:probe';
    storage.setItem(probe, '1');
    storage.removeItem(probe);
    return storage;
  } catch {
    // Private browsing or storage disabled: keep games for this tab only.
    return createMemoryStorage();
  }
}

/** Browser-local game storage. Call only from effects/event handlers (never during SSR). */
export function getGameRepository(): GameRepository {
  repository ??= createStorageGameRepository(browserStorage());
  return repository;
}

export function newGameId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function downloadText(filename: string, text: string, type = 'application/x-chess-pgn'): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
