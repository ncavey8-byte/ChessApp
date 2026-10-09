# Adaptive Chess Coach

A chess-training platform for improving players: play the computer, get feedback on finished games, and practise exercises built from your own mistakes.

**Status: Milestone 1 of 6.** The current build lets you play complete games against Stockfish in the browser. Game analysis, coaching, accounts, personalised practice and the mobile app are not built yet. See [docs/PLAN.md](docs/PLAN.md) for the architecture and roadmap.

## What works (Milestone 1)

- Interactive board (drag or click-to-move) with legal-move highlights, last move and check indicators
- Every chess rule via chess.js: castling, en passant, promotion (with piece picker), checkmate, stalemate, threefold repetition, fifty-move rule, insufficient material
- Stockfish 19 (WASM, single-threaded "lite" build) running in a Web Worker, with 6 difficulty levels
- Play as White, Black or random; optional custom start position (FEN)
- Undo (takes back your move and the engine's reply), resign, flip board, new game, copy PGN
- Typed move entry (SAN such as `Nf3` or UCI such as `g1f3`) for keyboard users
- Engine loading, timeout and crash states with a restart button; every engine move is checked for legality before it is played

## Layout

```
apps/web               Next.js (App Router) web app — presentation only
packages/chess-core    Pure TypeScript: rules wrapper, game sessions, UCI engine client
docs/PLAN.md           Architecture, data model, risks, milestones
```

`packages/chess-core` has no React or DOM dependencies, so the future Expo app can reuse it.

## Setup

Requires Node 22 (see `.nvmrc`) and pnpm 10 (`corepack enable`).

```bash
pnpm install --frozen-lockfile   # also copies the Stockfish files into apps/web/public/engine
pnpm dev                          # http://localhost:3000
```

Production build: `pnpm build && pnpm start`.

No environment variables or secrets are needed for Milestone 1.

## Checks

```bash
pnpm lint         # ESLint
pnpm typecheck    # tsc in every package
pnpm test         # Vitest unit + integration tests (includes games against real Stockfish)
pnpm --filter @acc/web exec playwright install --with-deps chromium   # first time only
pnpm test:e2e     # Playwright, desktop + mobile viewports
```

CI runs all of these on every push and pull request (`.github/workflows/ci.yml`).

## Known limitations

- Games are not saved yet. The game record format (start FEN + move list) supports resume and is tested, but storage arrives in Milestone 2/3. Reloading the page loses the game.
- Difficulty levels use Stockfish's Skill Level and short search times. They are not calibrated to real ratings.
- No analysis, coaching, accounts, practice or dashboard yet.
- Stockfish is GPL-3.0. See the `/licenses` page and docs/PLAN.md for what that means for distribution, especially on iOS.

## Licences

App code: not yet licensed (private). Third-party: Stockfish (GPL-3.0, source: https://github.com/nmrugg/stockfish.js/tree/v19.0.0), chess.js (BSD-2-Clause), react-chessboard (MIT), Next.js (MIT), React (MIT). Full notices are on the `/licenses` page.
