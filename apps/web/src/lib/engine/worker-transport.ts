import type { UciTransport } from '@acc/chess-core';

export const ENGINE_SCRIPT_URL = '/engine/stockfish-19-lite-single.js';

/** Runs Stockfish (WASM) in a dedicated Web Worker so searches never block the UI thread. */
export function createWorkerTransport(url: string = ENGINE_SCRIPT_URL): UciTransport {
  if (typeof Worker === 'undefined' || typeof WebAssembly === 'undefined') {
    throw new Error('This browser does not support Web Workers and WebAssembly, which the chess engine needs.');
  }
  const worker = new Worker(url);
  const lineListeners = new Set<(line: string) => void>();
  const errorListeners = new Set<(error: Error) => void>();

  worker.onmessage = (event: MessageEvent) => {
    const line = typeof event.data === 'string' ? event.data : String(event.data);
    for (const listener of lineListeners) listener(line);
  };
  worker.onerror = (event: ErrorEvent) => {
    event.preventDefault();
    const error = new Error(event.message || 'The engine worker failed to load');
    for (const listener of errorListeners) listener(error);
  };

  return {
    send: (command) => worker.postMessage(command),
    onLine(listener) {
      lineListeners.add(listener);
      return () => lineListeners.delete(listener);
    },
    onError(listener) {
      errorListeners.add(listener);
      return () => errorListeners.delete(listener);
    },
    terminate() {
      lineListeners.clear();
      errorListeners.clear();
      worker.terminate();
    },
  };
}
