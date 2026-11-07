# Hero Academy · ChessQuest

ChessQuest is a fully static, child-friendly chess adventure for the Hero Academy family.

## Play

Open `dist/adventure.html` to follow **The Royal Road**, or `dist/index.html` for a complete chess match. Both can run through any static web server. The computer runs entirely in a browser Web Worker, without an online opponent or API.

### The Royal Road — 100 missions

Ten colourful worlds, each with ten freely selectable missions:

1. Training Meadow — practise basic piece moves and collecting stars.
2. Pawn Valley — pawn steps, double moves, captures and reaching goals.
3. Knight Forest — L-shaped knight jumps and paths.
4. Bishop's Bridge — bishops, rooks, queens and treasure captures.
5. King's Castle — escape check using real chess positions.
6. Castle Gate — castling, en passant and all four promotions.
7. Tactics Trail — capture the queen with different pieces.
8. Checkmate Mountain — ten mate-in-one challenges.
9. Endgame Islands — promotions and checkmate finishes.
10. Champion's Road — ten short matches against the local computer.

Each activity uses large tap targets, highlighted destinations, optional spoken Pip tips, free hints, replay and undo. No timers, streak pressure or penalties. Completion earns three stars. Progress is stored per local child profile with JSON export/import, independently from the original chess arena save.

The Mini Games tab filters these missions by activity type (Star Hunt, Pawn Journey, King Rescue, Checkmate Quest and more). It does not require a separate account, server or AI subscription.

### Fifteen chess-opponent levels

1. **Little Pawn** – exploratory, mostly random legal moves.
2. **Brave Knight** – looks one move ahead, with straightforward tactics.
3. **Clever Bishop** – searches two plies deep.
4. **Castle Keeper** – searches three plies deep.
5. **Royal Champion** – up to four plies with move ordering and alpha-beta pruning.
6–15. **Star Explorer** through **Kingdom Legend** – gradually larger search budgets and up to five plies. These are friendly browser opponents rather than rated tournament engines, so adjacent levels can overlap in playing strength.

All levels can be chosen freely, and progress is rewarded with stars. Games are not timed and no loss removes earlier achievements. Existing five-level save files are expanded without discarding earned stars or unfinished games.

## Rules and features

- Standard legal chess, including check, checkmate, stalemate, castling, en passant, underpromotion, threefold repetition, insufficient material and the fifty-move rule.
- Play as white or black, flip the board, show legal moves, undo a turn, ask Pip for a hint, and review the move history.
- Touch, mouse, and keyboard support. Arrow keys move focus around the board; Enter or Space selects.
- Optional browser text-to-speech tips (prefer a British voice if installed), larger text and reduced-motion support.
- Browser-local saved match and achievements. JSON backup/export and validated restore. No account is required.
- Service Worker caches the static assets for subsequent offline play; the first visit needs a network connection.
- No advertising, analytics, tracking, login, paid services, runtime dependencies or online chess engine.

## Build and hosting

This is intentionally buildless: the `dist/` directory is the complete website. It can be deployed to any static host, including GitHub Pages, Cloudflare Pages and Sites. For project-root GitHub Pages hosting, place the contents of `dist/` at the published root (or publish `dist/` via a Pages action). Paths are relative so a project subpath works.

Run `npm test` (Node 20+) to execute the chess-rules and computer-opponent smoke tests. No `npm install` is necessary for users or tests.

## Chess rules attribution

The game vendors the MIT-licensed [chess.js](https://github.com/jhlywa/chess.js) 1.4.0 ESM build in `dist/vendor/chess.js` and retains its licence in `dist/vendor/LICENSE-chess.js`. It provides chess move legality; the browser opponent and child-friendly interface are written specifically for ChessQuest.

## Privacy and safety

All moves and progress are stored in the device's browser local storage. Backups are downloaded only when a player requests them. Backups may include game history, so families should store them appropriately. There is no cloud sync by default. Clearing browser storage removes local progress unless a backup exists.

## Shared family connection (7 November 2026)

Sign in at https://heroacademy.app/play/ with the existing ChoreQuest account. A parent grants each child access, then Play exchanges a single-use launch fragment for an origin/game/child-scoped capability. The vendored Academy SDK handles cloud revisions, explicit local/cloud conflict choices, disconnection, offline retries and minimal foreground usage summaries. Siblings and local backups remain local; only the selected learner is synced. Existing completed milestones are not back-credited. New stable zero-based milestones earn server-configured non-financial Hero XP once. Local game stars and the chore/money ledger remain separate. No parent cookies or credentials enter the game.

Production currently uses Cloudflare Pages direct upload (`hero-academy-chessquest`). Run `node scripts/build-connector-pages.mjs` to reproduce the text-only static adapter. Cloudflare Git installation for the heroacademy organisation failed; GitHub Pages workflows remain available after Pages is enabled in the repository. Verify the actual deployment after each release.
