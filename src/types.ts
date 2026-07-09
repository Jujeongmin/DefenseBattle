export type TowerType = 'arrow' | 'cannon' | 'ice' | 'lightning' | 'fire';

export interface TowerDef {
  name: string;
  emoji: string;
  color: string;
  damage: number;
  range: number;
  fireRate: number;
  splash?: number;
  slow?: number;
  dot?: { damage: number; duration: number };
}

export interface Tower {
  id: number;
  type: TowerType;
  row: number;
  col: number;
  damage: number;
  range: number;
  fireRate: number;
  lastFireTime: number;
  level: number;
}

export interface Enemy {
  id: number;
  health: number;
  maxHealth: number;
  speed: number;
  waypointIndex: number;
  progress: number;
  reward: number;
  slowFactor: number;
  slowTimer: number;
  dotDamage: number;
  dotTimer: number;
}

export interface Projectile {
  id: number;
  targetId: number;
  x: number;
  y: number;
  speed: number;
  damage: number;
  splash?: number;
  slow?: number;
  dot?: { damage: number; duration: number };
  towerType: TowerType;
}

export type CellType = 'empty' | 'path' | 'tower';

export type GamePhase = 'prepare' | 'fighting' | 'gameover' | 'victory';

export interface GameState {
  grid: CellType[][];
  towers: Tower[];
  enemies: Enemy[];
  projectiles: Projectile[];
  gold: number;
  lives: number;
  wave: number;
  phase: GamePhase;
  hoveredCell: { row: number; col: number } | null;
  nextId: number;
  gameTime: number;
  waveTimer: number;
  enemySpawnQueue: number;
}

export type GameAction =
  | { type: 'PLACE_TOWER'; row: number; col: number }
  | { type: 'UPGRADE_TOWER'; towerId: number }
  | { type: 'SELL_TOWER'; towerId: number }
  | { type: 'START_WAVE' }
  | { type: 'TICK'; dt: number }
  | { type: 'HOVER'; row: number; col: number }
  | { type: 'UNHOVER' }
  | { type: 'RESET' };
