# Structure — RandomDefense

## `game/src/main.ts`
Entry point. Handles main menu navigation, game loop, static text translation, and binds main menu buttons including `menu-rank`.

## `game/src/ui.ts`
DOM UI layer. Manages game view interfaces (upgrades, sales, settings) and contains the `showGameOver` dialog, which now includes the **실시간 랭킹 등록 (Real-time Leaderboard Registration)** form.

## `game/src/rankPanel.ts`
Handles the 🏆 랭킹 modal UI, fetching ranking data from the GameServer, local nickname caching, and nickname change triggers that update records on the server.

## `game/src/types.ts`
TypeScript type definitions for characters, zones, levels, and metadata.

## `game/src/style.css`
Core game style sheet. Pre-configured with absolute `/ui/...` references to prevent relative asset resolution bugs inside bundled CSS.

## `server/src/server.ts`
TypeScript-based GameServer backend. Exposes `submitWave`, `getTopRankings`, and `getMyBestRank` APIs to handle 1-record-per-user best wave leaderboard submissions.

## `server/test/server.test.ts`
Comprehensive unit tests for the GameServer backend.
