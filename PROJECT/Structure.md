# Structure — RandomDefense

## `src/main.tsx`
Entry point. Mounts `<App />` into `#root` via `createRoot`, wrapped in `StrictMode`.

## `src/App.tsx`
Root game component. Contains:
- `reducer` — all game state management via `useReducer`
- `processTick()` — game loop logic (spawning, movement, combat, effects)
- JSX rendering — board, cells, towers, enemies, projectiles, HUD, overlays

## `src/types.ts`
TypeScript type definitions for Tower, Enemy, Projectile, GameState, and actions.

## `src/constants.ts`
Game constants: grid size, path waypoints, tower definitions with stats, wave/scoring parameters.

## `src/gameLogic.ts`
Pure utility functions: grid building, enemy position calculation, target finding, path distance estimation.

## `src/App.css`
Full game styling: board layout, cell backgrounds, tower sprites, enemy bodies, projectiles, HUD, tooltips, overlays.

## `src/index.css`
Tailwind directives + global html/body reset.
