# Adaptive Chess Coach — Architecture & Milestone Plan

_Status: Milestone 1 implemented. Later milestones are proposals._

## 1. Existing state (at project start)

There was no existing repository: no GitHub repo for this project, and nothing on the dev machine. Node.js was not installed either. The project was created from scratch as a local git repository (`adaptive-chess-coach`). To push it to GitHub, create an empty repo first.

## 2. Library choices (checked October 2026)

| Concern | Choice | Version | License | Why / notes |
|---|---|---|---|---|
| Web framework | Next.js (App Router) + React | 16.4 / 19.x | MIT | Required by the brief. Turbopack build. |
| Language | TypeScript | 5.9 | Apache-2.0 | TS 7 (native compiler) is brand new. 5.9 is still the safe choice for the Next/ESLint toolchain. Revisit later. |
| Rules / game state | chess.js | 1.4.0 | BSD-2 | Standard, mature, pure TS, runs on web, Node and React Native. |
| Web board | react-chessboard | 5.12 | MIT | Actively maintained (Aug 2026), React 19, drag + click, custom square styles, arrows (needed for analysis). **Rejected:** `@lichess-org/chessground`, because it is GPL-3 (it would make the UI code GPL) and DOM-only. |
| Engine (web) | `stockfish` npm (stockfish.js by nmrugg / Chess.com), Stockfish 19 **lite single-threaded WASM** | 19.0.0 | **GPL-3.0** | ~1.6 MB build. Runs in a Web Worker, so it doesn't block the UI. Needs no COOP/COEP headers. Still far stronger than any human. |
| Engine (tests/server) | Same package, Node build | 19.0.0 | GPL-3.0 | Integration tests run against the real engine, not a mock. |
| Mobile board (later) | `react-native-chessboard` (MIT) **or** a custom Skia/SVG board | 0.2.0 | MIT | Pre-1.0 with heavy peer deps (Reanimated, Skia, Worklets). Decision deferred to the mobile milestone (see risks). |
| Auth / DB (M3) | Supabase (Postgres + RLS) | — | — | Required by the brief. Not needed until accounts exist. |
| Tests | Vitest (unit + integration), Playwright (E2E) | 5.x / 1.64 | MIT / Apache-2.0 | |
| Monorepo | pnpm workspaces | — | — | No Turborepo/Nx until build times need it. |

## 3. System architecture

```
apps/web (Next.js)           apps/mobile (Expo, later)
   │  presentation only          │  presentation only
   ▼                             ▼
packages/chess-core  ── pure TS, no React, no DOM ──
   game/      chess.js wrapper: legal moves, status, PGN, FEN validation
   session/   game-session reducer: player colour, difficulty, undo, restart, result
   engine/    ChessEngine interface, UCI protocol parser, UciEngine (transport-agnostic),
              difficulty presets
   (M2) analysis/  move classification from engine evals (win-probability based)
   (M4) training/  themes, exercise scheduling, performance stats
   (M3) coaching/  CoachProvider interface; LLM adapter lives server-side only

Engine transports (adapters around UciEngine):
   web    → Web Worker running stockfish-19-lite-single.js (served from /engine)
   node   → stockfish npm Node build (tests; later server-side batch analysis)
   mobile → native Stockfish binding or WASM in a JS engine (decided in M6)

Server side (M3+): Next.js route handlers / server actions
   Supabase auth, Postgres with RLS on every user table, LLM calls (keys stay server-side)
```

Key principles:
- `chess-core` never imports React or browser APIs, so the Expo app can reuse it unchanged.
- The engine talks through a `UciTransport` interface (`send`, `onLine`, `terminate`). Every platform supplies only the transport.
- The app checks every engine move against chess.js before playing it. Later, the same check applies to every LLM-suggested move.
- Analysis runs in the browser worker for the MVP. Server-side batch analysis and a job queue are added only if analysis gets too slow on mobile devices (see M2).

## 4. Data model (Supabase / Postgres — introduced in M3)

- `profiles` (id = auth.users.id, display_name, created_at, estimated_rating, rating_confidence)
- `games` (id, user_id, player_color, difficulty, start_fen, pgn, result, termination, status [in_progress|finished|abandoned], created_at, updated_at)
- `game_analyses` (id, game_id, user_id, engine_name, engine_version, depth/movetime settings, created_at)
- `move_evaluations` (analysis_id, ply, fen_before, played_uci, best_uci, eval_before_cp/mate, eval_after_cp/mate, win_prob_loss, classification, pv)
- `exercises` (id, user_id, source_game_id, source_ply, fen, solution_uci[], themes[], created_at)
- `exercise_attempts` (id, exercise_id, user_id, solved, hints_used, time_ms, attempted_at)
- `theme_stats` (user_id, theme, attempts, successes, last_seen_at, next_due_at) — or a view computed from attempts
- `coach_explanations` (id, move_evaluation_id, provider, model, prompt_version, text, validated, created_at) — cache

RLS: every table has `user_id = auth.uid()` policies for select/insert/update/delete. No service-role key in the client. Migrations live in `supabase/migrations`.

## 5. Technical risks

1. **Stockfish licensing (GPL-3).** Shipping the Stockfish WASM to browsers counts as distribution. Obligations: include the GPL text, give credit, and offer the corresponding source (a link to the exact upstream release is the usual approach). Running Stockfish as a separate program that the app only talks to over the UCI text protocol is widely treated as "mere aggregation". That is why the app's own code can stay non-GPL. *This is not legal advice.* M1 ships `/licenses`, the GPL text at `/engine/Copying.txt`, and source links. **App stores:** Apple's terms are widely considered incompatible with GPL-3. Shipping a GPL engine inside an iOS app needs a decision (see section 7).
2. **Mobile engine.** WASM workers aren't available in React Native. Options: (a) a native Stockfish module (C++ via Expo Modules, which brings the same GPL/App Store question), (b) server-side analysis via API (simple and licence-friendly for the app binary, but costs server CPU), or (c) a WebView-hosted WASM engine. Recommendation: (b) for analysis, plus (a) or (c) for offline play. Decide in M6.
3. **Engine strength calibration.** Stockfish `Skill Level` and depth limits don't map cleanly to human ratings. Difficulty labels stay descriptive ("Beginner", "Club"), and the app never claims an Elo for an opponent level.
4. **Analysis accuracy vs speed.** Lite WASM at short depth will misclassify some moves. Mitigations: classify on win-probability loss rather than raw centipawns, use thresholds that ignore small changes in decided positions, show analysis settings, and label results as estimates.
5. **LLM hallucination.** The LLM only gets engine-verified facts (best move, eval, PV, detected motifs) and may only rephrase them. Output is post-validated: every move it mentions must be legal and appear in the provided facts. Otherwise the app falls back to a templated explanation.
6. **Board accessibility.** Drag-only boards exclude keyboard and screen-reader users. M1 adds click-to-move and a typed-move input (SAN/UCI).

## 6. Milestones & acceptance criteria

**M1 — Foundation & play vs computer (done)**
- Monorepo, shared `chess-core`, Next.js app, lint/typecheck/test/CI.
- Interactive board with drag and click-to-move, legal-target hints, last-move and check highlights.
- All rules handled via chess.js: castling, en passant, promotion (piece picker), checkmate, stalemate, threefold, fifty-move, insufficient material.
- Stockfish in a Web Worker. Six difficulty levels. Colour choice. Engine errors are surfaced with a retry option.
- Undo (takes back your move and the engine reply), restart, resign, flip board, typed-move input, optional start-from-FEN.
- Acceptance: a user can finish a full game against the engine. The Playwright E2E test covers both a user-delivered mate and an engine-delivered mate. A Node integration test plays complete games against real Stockfish.

**M2 — Save/resume & game analysis (done)**
- Persist the in-progress game locally (resume after refresh). Export/import PGN.
- Analysis pipeline in `chess-core/analysis`: per-ply evals and win-probability-loss classification (inaccuracy/mistake/blunder/missed win). Thresholds ignore harmless changes.
- Analysis view: eval graph, move list with annotations, best-move arrows, a settings disclaimer.
- Acceptance: classification unit tests on curated positions. Analysis of a 40-move game completes in the browser without freezing the UI. Resume works after a reload.

**M3 — Accounts & persistence (Supabase)**
- Auth (email magic link), RLS policies, migrations, server-side storage of games and analyses, a games list.
- Acceptance: RLS tests show user A can't read or modify user B's rows. E2E: sign in → play → find the game in history.

**M4 — Coaching explanations**
- Motif detectors (hanging piece, fork, pin, discovered attack, king safety, missed defence) in `chess-core`.
- `CoachProvider` interface. Server-side LLM adapter fed only verified facts. Output validation and templated fallback.
- Acceptance: detector unit tests. Validator rejects an illegal or unverified move claim. The app works with the LLM disabled.

**M5 — Personalised practice & dashboard**
- Exercises extracted from analysed games, progressive hints, theme stats, spaced revisiting, recommendations, dashboard charts, and an estimated rating shown separately from observed stats.
- Acceptance: scheduler unit tests. E2E: a mistake in a game becomes an exercise, the user solves it with hints, and the stats update.

**M6 — Mobile (Expo)**
- Expo app reusing `chess-core`. Board library decision. Engine strategy per risk 2.

## 7. Decisions that need Nick's input

1. **Stockfish/GPL & app stores:** OK for the app's own code to stay closed-source while it distributes GPL Stockfish as a separate engine (with notices and source links)? Or would you rather open-source the whole app under GPL? This mostly matters for the iOS release.
2. **GitHub:** create an empty repo (e.g. `ncavey8-byte/adaptive-chess-coach`) so the code can be pushed and CI can run. CI is already configured.
3. **Before M3:** a Supabase project (the free tier is enough), plus where to host the web app (e.g. Vercel free tier).
4. **Before M4:** which LLM provider (OpenAI, Anthropic, …) and a monthly spending cap.
