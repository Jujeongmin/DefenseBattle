# Status — RandomDefense

## Implemented
- Game board with 16×9 grid and winding path
- 5 tower types with random placement
- Tower upgrade (click tower) and sell (right-click)
- Enemy spawning, movement along path, health system
- Projectile animation with homing behavior
- Splash damage (Cannon), slow effect (Ice), burn DOT (Fire)
- 50 waves with scaling difficulty (vanilla game)
- HUD: gold, lives, wave counter
- Range indicator on tower hover
- Tower info tooltip
- Victory/Game Over screens with restart
- **Vite/CSS absolute pathing fix** for correct asset loading in compiled production builds
- **GAME_SIZE_RESPONSE integration** inside `game/index.html` to prevent mobile-unsupported warnings on Verse8
- **TypeScript GameServer integration (`server/`)** with unit tests for real-time leaderboards
- **Best Wave Leaderboard** with score submission on Game Over (and local nickname caching)
- **🏆 랭킹 (Leaderboard) button and panel** on the Main Menu, complete with nickname setting and automatic server updating on change

## Active Work
- Server and client ranking integration complete and fully tested!

## Next Steps
- Sound effects / music
- More tower types
- Multiple paths / random path generation
- Mobile touch support
