// ============================================================
//  스프라이트 로더
//  public/sprites/*.png 를 미리 로드해 캐시한다.
// ============================================================
import { JOB_SPRITE, GRADES, RACE_SPRITE } from './config';
import type { Job, Race, GradeKey } from './types';

export interface SpriteEntry {
  img: HTMLImageElement;
  ready: boolean;
  error?: boolean;
}

const cache = new Map<string, SpriteEntry>();

function loadImage(name: string): SpriteEntry {
  const cached = cache.get(name);
  if (cached) return cached;
  const img = new Image();
  img.src = `sprites/${name}.png`;
  const entry: SpriteEntry = { img, ready: false };
  img.onload = () => { entry.ready = true; };
  img.onerror = () => { entry.error = true; };
  cache.set(name, entry);
  return entry;
}

export function unitSprite(job: Job, gradeKey: GradeKey): SpriteEntry {
  const base = JOB_SPRITE[job];
  const g = GRADES.find((x) => x.key === gradeKey)!;
  return loadImage(`${base}_${g.spriteIndex}`);
}

export function mobSprite(race: Race): SpriteEntry {
  return loadImage(`${RACE_SPRITE[race]}_0`);
}

// 맵 타일 (public/tiles/*.png)
export function tileSprite(name: string): SpriteEntry {
  const key = `tile:${name}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const img = new Image();
  img.src = `tiles/${name}.png`;
  const entry: SpriteEntry = { img, ready: false };
  img.onload = () => { entry.ready = true; };
  img.onerror = () => { entry.error = true; };
  cache.set(key, entry);
  return entry;
}

export function mobPortraitSrc(race: Race): string {
  return `sprites/${RACE_SPRITE[race]}_0.png`;
}

export function preloadAll(): void {
  for (const job of Object.keys(JOB_SPRITE) as Job[]) {
    for (const g of GRADES) loadImage(`${JOB_SPRITE[job]}_${g.spriteIndex}`);
  }
  for (const race of Object.keys(RACE_SPRITE) as Race[]) loadImage(`${RACE_SPRITE[race]}_0`);
  tileSprite('grass');
  tileSprite('dirt');
}
