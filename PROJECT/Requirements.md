# Requirements — RandomDefense

## Coding Patterns
- Function components with hooks (React app) or pure ES6 TypeScript classes (vanilla game).
- State managed via `useReducer` (React) or internal engine loop (vanilla game).
- Game loop uses `requestAnimationFrame` with delta-time.

## Leaderboard Server API (`server/src/server.ts`)
- `submitWave(wave: number, nickname: string)`: Submits a wave record. If it's a first record or higher than the current best, existing records for that account are deleted and a new best record is saved.
- `getTopRankings()`: Returns the top 20 rankings sorted by wave reached (descending).
- `getMyBestRank()`: Returns the current user's best rank and score.

## Viewports & Platforms (Verse8 / Agent8)
- Uses `<meta name="viewport" content="width=device-width, initial-scale=1.5, ...">` for fit-to-screen mobile scaling.
- Communicates window size via `GAME_SIZE_RESPONSE` postMessages on load and resize, preventing parent frame mobile-unsupported fallbacks.
