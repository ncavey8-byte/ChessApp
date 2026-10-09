// Copies the Stockfish WASM build (GPL-3.0) and its licence into public/engine so it is
// served as a static Web Worker script. The files are not committed; they come from the
// pinned `stockfish` npm package.
import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const pkgDir = dirname(require.resolve('stockfish/package.json'));
const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'engine');
mkdirSync(outDir, { recursive: true });

for (const file of ['stockfish-19-lite-single.js', 'stockfish-19-lite-single.wasm']) {
  copyFileSync(join(pkgDir, 'bin', file), join(outDir, file));
}
copyFileSync(join(pkgDir, 'Copying.txt'), join(outDir, 'Copying.txt'));
console.log(`Stockfish engine copied to ${outDir}`);
