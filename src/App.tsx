import { useReducer, useEffect, useCallback, useRef, useMemo } from 'react';
import { CellType, Enemy, GameAction, GamePhase, GameState, Projectile, Tower, TowerType } from './types';
import {
  GRID_COLS, GRID_ROWS, PATH_WAYPOINTS, TOWER_COST, TOWER_DEFS, TOWER_TYPES,
  STARTING_GOLD, STARTING_LIVES, MAX_WAVES, ENEMY_BASE_HEALTH, ENEMY_BASE_SPEED,
  ENEMY_BASE_REWARD, ENEMY_SPAWN_INTERVAL, WAVE_BONUS_BASE, WAVE_BONUS_PER_WAVE,
} from './constants';
import { buildPathGrid, getEnemyPosition, findTarget } from './gameLogic';
import './App.css';

const initialGrid = buildPathGrid();

const initialState: GameState = {
  grid: initialGrid,
  towers: [],
  enemies: [],
  projectiles: [],
  gold: STARTING_GOLD,
  lives: STARTING_LIVES,
  wave: 0,
  phase: 'prepare',
  hoveredCell: null,
  nextId: 1,
  gameTime: 0,
  waveTimer: 0,
  enemySpawnQueue: 0,
};

function processTick(state: GameState, dt: number): Partial<GameState> {
  const newGameTime = state.gameTime + dt;
  let newWaveTimer = state.waveTimer + dt;
  let { enemies, gold, lives, enemySpawnQueue } = state;

  const fireEvents: { towerId: number }[] = [];
  let newProjectiles: Projectile[] = [...state.projectiles];

  // spawn enemies
  let queue = enemySpawnQueue;
  while (queue > 0 && newWaveTimer >= ENEMY_SPAWN_INTERVAL) {
    newWaveTimer -= ENEMY_SPAWN_INTERVAL;
    queue--;
    const healthMult = 1 + (state.wave - 1) * 0.35;
    const hp = Math.floor(ENEMY_BASE_HEALTH * healthMult);
    const newEnemy: Enemy = {
      id: state.nextId + enemies.length + Math.floor(Math.random() * 100000),
      health: hp,
      maxHealth: hp,
      speed: ENEMY_BASE_SPEED + (state.wave - 1) * 0.12,
      waypointIndex: 0,
      progress: 0,
      reward: ENEMY_BASE_REWARD + Math.floor(state.wave * 2.5),
      slowFactor: 1,
      slowTimer: 0,
      dotDamage: 0,
      dotTimer: 0,
    };
    enemies = [...enemies, newEnemy];
  }

  // move enemies & apply effects
  let leaked = 0;
  let gainedGold = 0;
  const movedEnemies: Enemy[] = [];

  for (const e of enemies) {
    const slowFactor = e.slowTimer > 0 ? e.slowFactor : 1;
    const spd = e.speed * slowFactor * dt;
    let progress = e.progress + spd;
    let wpi = e.waypointIndex;

    while (progress >= 1 && wpi < PATH_WAYPOINTS.length - 2) {
      progress -= 1;
      wpi++;
    }
    if (wpi >= PATH_WAYPOINTS.length - 2 && progress >= 1) {
      leaked++;
      continue;
    }

    let hp = e.health;
    let slowT = Math.max(0, e.slowTimer - dt);
    let dotT = Math.max(0, e.dotTimer - dt);

    if (e.dotTimer > 0) {
      hp -= e.dotDamage * dt;
    }
    if (hp <= 0) {
      gainedGold += e.reward;
      continue;
    }

    movedEnemies.push({
      ...e,
      progress,
      waypointIndex: wpi,
      health: hp,
      slowTimer: slowT,
      dotTimer: dotT,
      slowFactor: slowT <= 0 ? 1 : e.slowFactor,
    });
  }
  enemies = movedEnemies;
  gold += gainedGold;
  lives -= leaked;

  // tower firing
  for (const tower of state.towers) {
    const cooldown = 1 / tower.fireRate;
    if (newGameTime - tower.lastFireTime < cooldown) continue;

    const target = findTarget(tower, enemies);
    if (!target) continue;

    fireEvents.push({ towerId: tower.id });

    const def = TOWER_DEFS[tower.type];
    newProjectiles.push({
      id: state.nextId + 100000 + Math.floor(Math.random() * 100000),
      targetId: target.id,
      x: tower.col + 0.5,
      y: tower.row + 0.5,
      speed: 10,
      damage: tower.damage,
      splash: def.splash,
      slow: def.slow,
      dot: def.dot,
      towerType: tower.type,
    });
  }

  // projectile movement & collision
  const remainingProjectiles: Projectile[] = [];
  for (const p of newProjectiles) {
    const target = enemies.find(e => e.id === p.targetId);
    if (!target) continue;

    const tpos = getEnemyPosition(target);
    const dx = tpos.x - p.x;
    const dy = tpos.y - p.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 0.35) {
      // hit - damage primary target
      const tIdx = enemies.findIndex(e => e.id === p.targetId);
      if (tIdx === -1) continue;

      let enemy = { ...enemies[tIdx] };
      enemy.health -= p.damage;

      if (p.slow) { enemy.slowFactor = p.slow; enemy.slowTimer = 2.5; }
      if (p.dot) { enemy.dotDamage = p.dot.damage; enemy.dotTimer = p.dot.duration; }

      // splash damage
      if (p.splash) {
        for (let i = 0; i < enemies.length; i++) {
          if (i === tIdx) continue;
          const e = enemies[i];
          const epos = getEnemyPosition(e);
          const sdx = epos.x - tpos.x;
          const sdy = epos.y - tpos.y;
          if (Math.sqrt(sdx * sdx + sdy * sdy) <= p.splash) {
            enemies[i] = { ...enemies[i], health: enemies[i].health - p.damage * 0.5 };
          }
        }
      }

      if (enemy.health <= 0) {
        gold += enemy.reward;
        enemies.splice(tIdx, 1);
      } else {
        enemies[tIdx] = enemy;
      }

      // clean up splash-killed enemies
      enemies = enemies.filter(e => {
        if (e.health <= 0) { gold += e.reward; return false; }
        return true;
      });
    } else {
      const move = Math.min(p.speed * dt, dist);
      remainingProjectiles.push({
        ...p,
        x: p.x + (dx / dist) * move,
        y: p.y + (dy / dist) * move,
      });
    }
  }

  // update tower lastFireTime
  const firedIds = new Set(fireEvents.map(f => f.towerId));
  const updatedTowers = state.towers.map(t =>
    firedIds.has(t.id) ? { ...t, lastFireTime: newGameTime } : t
  );

  // check wave complete
  let phase: GamePhase = state.phase;
  if (enemies.length === 0 && queue === 0) {
    phase = 'prepare';
    gold += WAVE_BONUS_BASE + state.wave * WAVE_BONUS_PER_WAVE;

    if (state.wave >= MAX_WAVES) {
      phase = 'victory';
    }
  }

  if (lives < 0) lives = 0;
  if (lives <= 0) {
    phase = 'gameover';
  }

  return {
    gameTime: newGameTime,
    waveTimer: newWaveTimer,
    enemies,
    projectiles: remainingProjectiles,
    gold,
    lives,
    enemySpawnQueue: queue,
    phase,
    towers: updatedTowers,
  };
}

function reducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'PLACE_TOWER': {
      const { row, col } = action;
      if (state.grid[row][col] !== 'empty') return state;
      if (state.gold < TOWER_COST) return state;

      const type = TOWER_TYPES[Math.floor(Math.random() * TOWER_TYPES.length)];
      const def = TOWER_DEFS[type];
      const tower: Tower = {
        id: state.nextId,
        type,
        row,
        col,
        damage: def.damage,
        range: def.range,
        fireRate: def.fireRate,
        lastFireTime: 0,
        level: 1,
      };

      const newGrid = state.grid.map(r => [...r]);
      newGrid[row][col] = 'tower';

      return {
        ...state,
        grid: newGrid,
        towers: [...state.towers, tower],
        gold: state.gold - TOWER_COST,
        nextId: state.nextId + 1,
      };
    }
    case 'UPGRADE_TOWER': {
      const tower = state.towers.find(t => t.id === action.towerId);
      if (!tower) return state;
      const cost = Math.floor(TOWER_COST * (1 + (tower.level - 1) * 0.6));
      if (state.gold < cost) return state;

      return {
        ...state,
        towers: state.towers.map(t =>
          t.id === action.towerId
            ? {
                ...t,
                level: t.level + 1,
                damage: Math.floor(t.damage * 1.5),
                range: Math.min(t.range + 0.25, 6),
                fireRate: Math.min(t.fireRate * 1.1, 5),
              }
            : t
        ),
        gold: state.gold - cost,
      };
    }
    case 'SELL_TOWER': {
      const tower = state.towers.find(t => t.id === action.towerId);
      if (!tower) return state;
      const refund = Math.floor(TOWER_COST * 0.5 * tower.level);

      const newGrid = state.grid.map(r => [...r]);
      newGrid[tower.row][tower.col] = 'empty';

      return {
        ...state,
        grid: newGrid,
        towers: state.towers.filter(t => t.id !== action.towerId),
        gold: state.gold + refund,
      };
    }
    case 'START_WAVE': {
      if (state.phase !== 'prepare') return state;
      const wave = state.wave + 1;
      const count = 5 + wave * 3;

      return {
        ...state,
        wave,
        phase: 'fighting',
        enemies: [],
        projectiles: [],
        enemySpawnQueue: count,
        waveTimer: 0,
        gameTime: 0,
        towers: state.towers.map(t => ({ ...t, lastFireTime: 0 })),
      };
    }
    case 'HOVER':
      return { ...state, hoveredCell: { row: action.row, col: action.col } };
    case 'UNHOVER':
      return { ...state, hoveredCell: null };
    case 'RESET':
      return { ...initialState, grid: buildPathGrid() };
    case 'TICK': {
      if (state.phase !== 'fighting') return state;
      return { ...state, ...processTick(state, Math.min(action.dt, 0.1)) };
    }
    default:
      return state;
  }
}

function App() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const lastTimeRef = useRef<number>(0);
  const animFrameRef = useRef<number>(0);

  // game loop
  useEffect(() => {
    const loop = (time: number) => {
      if (lastTimeRef.current !== 0) {
        const dt = (time - lastTimeRef.current) / 1000;
        dispatch({ type: 'TICK', dt });
      }
      lastTimeRef.current = time;
      animFrameRef.current = requestAnimationFrame(loop);
    };
    animFrameRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, []);

  const handleCellClick = useCallback((row: number, col: number) => {
    const cell = state.grid[row][col];
    if (cell === 'empty') {
      dispatch({ type: 'PLACE_TOWER', row, col });
    } else if (cell === 'tower') {
      const tower = state.towers.find(t => t.row === row && t.col === col);
      if (tower) {
        dispatch({ type: 'UPGRADE_TOWER', towerId: tower.id });
      }
    }
  }, [state.grid, state.towers]);

  const handleCellRightClick = useCallback((e: React.MouseEvent, row: number, col: number) => {
    e.preventDefault();
    const tower = state.towers.find(t => t.row === row && t.col === col);
    if (tower) {
      dispatch({ type: 'SELL_TOWER', towerId: tower.id });
    }
  }, [state.towers]);

  const handleStartWave = useCallback(() => {
    dispatch({ type: 'START_WAVE' });
  }, []);

  const handleReset = useCallback(() => {
    dispatch({ type: 'RESET' });
  }, []);

  // compute tower being hovered for range display
  const hoveredTower = useMemo(() => {
    if (!state.hoveredCell) return null;
    return state.towers.find(
      t => t.row === state.hoveredCell!.row && t.col === state.hoveredCell!.col
    ) || null;
  }, [state.hoveredCell, state.towers]);

  const cellSizePx = 52;

  return (
    <div className="game-wrapper">
      {/* HUD */}
      <div className="hud">
        <div className="hud-item">
          <span className="hud-label">Gold</span>
          <span className="hud-value gold">{state.gold}</span>
        </div>
        <div className="hud-item">
          <span className="hud-label">Lives</span>
          <span className="hud-value lives">{state.lives}</span>
        </div>
        <div className="hud-item">
          <span className="hud-label">Wave</span>
          <span className="hud-value wave">{state.wave}/{MAX_WAVES}</span>
        </div>
        <div className="hud-spacer" />
        <span className="hud-hint">
          {state.phase === 'prepare'
            ? state.wave === 0
              ? 'Click empty cells to place random towers (50g). Click towers to upgrade.'
              : 'Place/upgrade towers, then start the next wave.'
            : state.phase === 'fighting'
              ? `Enemies remaining: ${state.enemies.length + state.enemySpawnQueue}`
              : ''}
        </span>
        {state.phase === 'prepare' && (
          <button className="btn-start" onClick={handleStartWave}>
            {state.wave === 0 ? 'Start Game' : 'Start Wave'}
          </button>
        )}
      </div>

      {/* Game Board */}
      <div className="board-wrapper">
        <div
          className="board"
          style={{
            width: GRID_COLS * cellSizePx,
            height: GRID_ROWS * cellSizePx,
          }}
        >
          {/* grid cells */}
          {state.grid.map((row, ri) =>
            row.map((cell, ci) => {
              const isPath = cell === 'path';
              const isTowerCell = cell === 'tower';
              const tower = isTowerCell
                ? state.towers.find(t => t.row === ri && t.col === ci)
                : null;
              const isHovered = state.hoveredCell?.row === ri && state.hoveredCell?.col === ci;
              const canPlace = state.phase === 'prepare' && cell === 'empty' && state.gold >= TOWER_COST;

              return (
                <div
                  key={`${ri}-${ci}`}
                  className={`cell ${isPath ? 'cell-path' : ''} ${isTowerCell ? 'cell-tower' : ''} ${canPlace ? 'cell-placeable' : ''} ${isHovered ? 'cell-hovered' : ''}`}
                  style={{
                    width: cellSizePx,
                    height: cellSizePx,
                    left: ci * cellSizePx,
                    top: ri * cellSizePx,
                  }}
                  onClick={() => handleCellClick(ri, ci)}
                  onContextMenu={(e) => handleCellRightClick(e, ri, ci)}
                  onMouseEnter={() => dispatch({ type: 'HOVER', row: ri, col: ci })}
                  onMouseLeave={() => dispatch({ type: 'UNHOVER' })}
                >
                  {tower && (
                    <div
                      className="tower-sprite"
                      style={{ background: TOWER_DEFS[tower.type].color }}
                    >
                      <span className="tower-emoji">{TOWER_DEFS[tower.type].emoji}</span>
                      <span className="tower-level">{tower.level}</span>
                      <div className="tower-progress-bar">
                        <div
                          className="tower-progress-fill"
                          style={{
                            width: `${Math.min(
                              100,
                              ((state.gameTime - (tower.lastFireTime || 0)) / (1 / tower.fireRate)) * 100
                            )}%`,
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}

          {/* range indicator */}
          {hoveredTower && (
            <div
              className="range-indicator"
              style={{
                left: (hoveredTower.col + 0.5) * cellSizePx - hoveredTower.range * cellSizePx,
                top: (hoveredTower.row + 0.5) * cellSizePx - hoveredTower.range * cellSizePx,
                width: hoveredTower.range * 2 * cellSizePx,
                height: hoveredTower.range * 2 * cellSizePx,
              }}
            />
          )}

          {/* enemies overlay */}
          {state.enemies.map(enemy => {
            const pos = getEnemyPosition(enemy);
            const hpPct = (enemy.health / enemy.maxHealth) * 100;
            const isSlowed = enemy.slowTimer > 0;
            const isBurning = enemy.dotTimer > 0;

            return (
              <div
                key={enemy.id}
                className={`enemy ${isSlowed ? 'enemy-slowed' : ''} ${isBurning ? 'enemy-burning' : ''}`}
                style={{
                  left: pos.x * cellSizePx - 10,
                  top: pos.y * cellSizePx - 10,
                }}
              >
                <div className="enemy-body">
                  <div className="enemy-hp-bar">
                    <div className="enemy-hp-fill" style={{ width: `${hpPct}%` }} />
                  </div>
                </div>
              </div>
            );
          })}

          {/* projectiles overlay */}
          {state.projectiles.map(p => (
            <div
              key={p.id}
              className="projectile"
              style={{
                left: p.x * cellSizePx - 3,
                top: p.y * cellSizePx - 3,
                background: TOWER_DEFS[p.towerType].color,
              }}
            />
          ))}
        </div>
      </div>

      {/* overlay for game over / victory */}
      {(state.phase === 'gameover' || state.phase === 'victory') && (
        <div className="overlay">
          <div className="overlay-card">
            <h2>{state.phase === 'victory' ? 'Victory!' : 'Game Over'}</h2>
            <p>
              {state.phase === 'victory'
                ? 'You defended against all waves!'
                : 'Your defenses have fallen.'}
            </p>
            <p>Wave reached: {state.wave}/{MAX_WAVES}</p>
            <button className="btn-start" onClick={handleReset}>Play Again</button>
          </div>
        </div>
      )}

      {/* tower info tooltip */}
      {hoveredTower && (
        <div className="tooltip">
          <div className="tooltip-title">
            {TOWER_DEFS[hoveredTower.type].emoji} {TOWER_DEFS[hoveredTower.type].name} Tower Lv.{hoveredTower.level}
          </div>
          <div>Damage: {hoveredTower.damage}</div>
          <div>Range: {hoveredTower.range.toFixed(1)}</div>
          <div>Speed: {hoveredTower.fireRate.toFixed(1)}/s</div>
          {TOWER_DEFS[hoveredTower.type].splash && <div>Splash radius: {TOWER_DEFS[hoveredTower.type].splash}</div>}
          {TOWER_DEFS[hoveredTower.type].slow && <div>Slow: {Math.round((1 - TOWER_DEFS[hoveredTower.type].slow!) * 100)}%</div>}
          {TOWER_DEFS[hoveredTower.type].dot && <div>Burn: {TOWER_DEFS[hoveredTower.type].dot!.damage}/s</div>}
          <div className="tooltip-hint">Click to upgrade | Right-click to sell</div>
        </div>
      )}
    </div>
  );
}

export default App;
