# Adaptive Chess Coach

A chess-training platform for improving players: play the computer, get feedback on finished games, and practise exercises built from your own mistakes.

**Status: Milestone 2 of 6.** You can play complete games against Stockfish, resume them after a reload, and analyse finished or imported games in the browser. Coaching, accounts, personalised practice and the mobile app are not built yet. See [docs/PLAN.md](docs/PLAN.md) for the architecture and roadmap.

## What works (Milestone 1)

- Interactive board (drag or click-to-move) with legal-move highlights, last move and check indicators
- Every chess rule via chess.js: castling, en passant, promotion (with piece picker), checkmate, stalemate, threefold repetition, fifty-move rule, insufficient material
- Stockfish 19 (WASM, single-threaded "lite" build) running in a Web Worker, with 6 difficulty levels
- Play as White, Black or random; optional custom start position (FEN)
- Undo (takes back your move and the engine's reply), resign, flip board, new game, copy PGN
- Typed move entry (SAN such as `Nf3` or UCI such as `g1f3`) for keyboard users
- Engine loading, timeout and crash states with a restart button; every engine move is checked for legality before it is played

## What works (Milestone 2)

- The in-progress game is saved in the browser (localStorage) after every move and resumed when you come back to `/play`
- Finished games are kept in a local library at `/analysis` (latest 30); PGN import (paste) and PGN download
- Engine analysis of every position (Stockfish, full strength, Quick or Standard depth) in a Web Worker, with progress and cancel
- Each move is classified by how much it lowered the mover's winning chances (Lichess-style thresholds): inaccuracy, mistake, blunder, missed win
- Analysis view: evaluation graph, annotated move list, best-move arrow, per-side summary, keyboard navigation (←/→/Home/End), settings disclaimer
- Analysis results are cached with the game and discarded automatically if they don't match its moves

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

- Games are stored only in this browser. Clearing site data deletes them, and they don't sync between devices until accounts arrive (Milestone 3).
- Analysis uses a short search in the browser engine, so move labels are estimates and can be wrong in complicated positions.
- Difficulty levels use Stockfish's Skill Level and short search times. They are not calibrated to real ratings.
- No coaching explanations, accounts, practice or dashboard yet.
- Stockfish is GPL-3.0. See the `/licenses` page and docs/PLAN.md for what that means for distribution, especially on iOS.

## Licences

App code: not yet licensed (private). Third-party: Stockfish (GPL-3.0, source: https://github.com/nmrugg/stockfish.js/tree/v19.0.0), chess.js (BSD-2-Clause), react-chessboard (MIT), Next.js (MIT), React (MIT). Full notices are on the `/licenses` page.
