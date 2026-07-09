# Context — RandomDefense

## Project Overview

RandomDefense is a tower defense game built with React + TypeScript + Vite. Players place towers along a winding path to stop waves of enemies. The twist: when you place a tower, you get a **random type** — adding strategy and unpredictability.

## Tech Stack

- **Framework**: React 18, React DOM
- **Build / Lang**: Vite, TypeScript
- **Styling**: Tailwind CSS + custom CSS
- **State**: useReducer for game state, requestAnimationFrame for game loop

## Game Features

- 5 random tower types (Arrow, Cannon, Ice, Lightning, Fire) with unique abilities
- Tower upgrade system (click existing tower)
- Tower selling (right-click)
- 15 waves of increasing difficulty
- Splash damage, slow effects, and damage-over-time (burn)
- Real-time projectile animation
- HUD with gold, lives, wave counter
