import { TowerDef, TowerType } from './types';

export const GRID_COLS = 16;
export const GRID_ROWS = 9;

export const PATH_WAYPOINTS: { row: number; col: number }[] = [
  { row: 0, col: 0 },
  { row: 0, col: 5 },
  { row: 3, col: 5 },
  { row: 3, col: 2 },
  { row: 6, col: 2 },
  { row: 6, col: 8 },
  { row: 3, col: 8 },
  { row: 3, col: 13 },
  { row: 6, col: 13 },
  { row: 6, col: 10 },
  { row: 8, col: 10 },
  { row: 8, col: 15 },
];

export const TOWER_DEFS: Record<TowerType, TowerDef> = {
  arrow: {
    name: 'Arrow', emoji: '🏹', color: '#4CAF50',
    damage: 15, range: 3, fireRate: 1.2,
  },
  cannon: {
    name: 'Cannon', emoji: '💣', color: '#F44336',
    damage: 40, range: 2.5, fireRate: 0.5, splash: 1.5,
  },
  ice: {
    name: 'Ice', emoji: '🧊', color: '#42A5F5',
    damage: 8, range: 3, fireRate: 1, slow: 0.4,
  },
  lightning: {
    name: 'Lightning', emoji: '⚡', color: '#FDD835',
    damage: 12, range: 3.5, fireRate: 2,
  },
  fire: {
    name: 'Fire', emoji: '🔥', color: '#FF7043',
    damage: 20, range: 2.5, fireRate: 0.8,
    dot: { damage: 6, duration: 2.5 },
  },
};

export const TOWER_TYPES: TowerType[] = ['arrow', 'cannon', 'ice', 'lightning', 'fire'];

export const TOWER_COST = 50;
export const STARTING_GOLD = 250;
export const STARTING_LIVES = 20;
export const MAX_WAVES = 15;

export const ENEMY_BASE_HEALTH = 60;
export const ENEMY_BASE_SPEED = 1.8;
export const ENEMY_BASE_REWARD = 12;
export const ENEMY_SPAWN_INTERVAL = 0.8;
export const WAVE_BONUS_BASE = 50;
export const WAVE_BONUS_PER_WAVE = 15;
