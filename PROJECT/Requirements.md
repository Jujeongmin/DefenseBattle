# Requirements — RandomDefense

## Coding Patterns
- Function components with hooks; no class components.
- State managed via `useReducer` for predictable game state transitions.
- Game loop uses `requestAnimationFrame` with delta-time.
- Pure game logic extracted into `gameLogic.ts`.

## Tower Types (random on placement)
| Type | Emoji | Damage | Range | Speed | Special |
|------|-------|--------|-------|-------|---------|
| Arrow | 🏹 | 15 | 3.0 | 1.2/s | — |
| Cannon | 💣 | 40 | 2.5 | 0.5/s | Splash 1.5 |
| Ice | 🧊 | 8 | 3.0 | 1.0/s | Slow 60% |
| Lightning | ⚡ | 12 | 3.5 | 2.0/s | — |
| Fire | 🔥 | 20 | 2.5 | 0.8/s | Burn 6/s |

## Game Flow
1. Prepare phase: place/upgrade/sell towers
2. Fighting phase: enemies spawn, towers auto-fire, projectiles animate
3. Victory (wave 15 cleared) or Game Over (lives = 0)

## Known Constraints
- No 3D — pure 2D CSS/React rendering
- Single fixed path
- No sound/music
- No mobile touch optimizations yet
