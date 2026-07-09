import { CellType, Enemy, Tower } from './types';
import { GRID_COLS, GRID_ROWS, PATH_WAYPOINTS } from './constants';

export function buildPathGrid(): CellType[][] {
  const grid: CellType[][] = Array.from({ length: GRID_ROWS }, () =>
    Array.from({ length: GRID_COLS }, () => 'empty' as CellType)
  );

  for (let i = 0; i < PATH_WAYPOINTS.length - 1; i++) {
    const from = PATH_WAYPOINTS[i];
    const to = PATH_WAYPOINTS[i + 1];
    const dr = Math.sign(to.row - from.row);
    const dc = Math.sign(to.col - from.col);
    let r = from.row;
    let c = from.col;
    while (r !== to.row || c !== to.col) {
      if (r >= 0 && r < GRID_ROWS && c >= 0 && c < GRID_COLS) {
        grid[r][c] = 'path';
      }
      r += dr;
      c += dc;
    }
  }

  const last = PATH_WAYPOINTS[PATH_WAYPOINTS.length - 1];
  if (last.row >= 0 && last.row < GRID_ROWS && last.col >= 0 && last.col < GRID_COLS) {
    grid[last.row][last.col] = 'path';
  }

  return grid;
}

export function getEnemyPosition(enemy: Enemy): { x: number; y: number } {
  const idx = Math.min(enemy.waypointIndex, PATH_WAYPOINTS.length - 2);
  const from = PATH_WAYPOINTS[idx];
  const to = PATH_WAYPOINTS[idx + 1];
  const x = from.col + (to.col - from.col) * enemy.progress;
  const y = from.row + (to.row - from.row) * enemy.progress;
  return { x, y };
}

export function findTarget(tower: Tower, enemies: Enemy[]): Enemy | null {
  let best: Enemy | null = null;
  let bestProgress = -1;

  for (const enemy of enemies) {
    const pos = getEnemyPosition(enemy);
    const dx = pos.x - (tower.col + 0.5);
    const dy = pos.y - (tower.row + 0.5);
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist <= tower.range) {
      const ep = enemy.waypointIndex * 1000 + enemy.progress;
      if (ep > bestProgress) {
        bestProgress = ep;
        best = enemy;
      }
    }
  }

  return best;
}

export function estimatePathDistance(waypointIndex: number, progress: number): number {
  let dist = (1 - progress);
  for (let i = waypointIndex + 1; i < PATH_WAYPOINTS.length - 1; i++) {
    const a = PATH_WAYPOINTS[i];
    const b = PATH_WAYPOINTS[i + 1];
    dist += Math.sqrt((b.row - a.row) ** 2 + (b.col - a.col) ** 2);
  }
  return dist;
}
