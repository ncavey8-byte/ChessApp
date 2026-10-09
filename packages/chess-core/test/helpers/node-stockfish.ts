import { createRequire } from 'node:module';
import type { UciTransport } from '../../src';

const require = createRequire(import.meta.url);

interface NodeStockfish {
  listener: (line: string) => void;
  sendCommand: (command: string) => void;
}

/** UCI transport backed by the real Stockfish 19 lite WASM build running in Node. */
export async function createNodeStockfishTransport(): Promise<UciTransport> {
  const initEngine = require('stockfish') as (flavor: string) => Promise<NodeStockfish>;
  const engine = await initEngine('lite-single');
  const lineListeners = new Set<(line: string) => void>();
  let terminated = false;
  engine.listener = (line: string) => {
    if (!terminated) for (const listener of lineListeners) listener(line);
  };
  return {
    send(command) {
      if (terminated) throw new Error('Transport terminated');
      engine.sendCommand(command);
    },
    onLine(listener) {
      lineListeners.add(listener);
      return () => lineListeners.delete(listener);
    },
    onError() {
      return () => undefined;
    },
    terminate() {
      // Sending "quit" would exit the Node process, so just detach.
      terminated = true;
      lineListeners.clear();
    },
  };
}
