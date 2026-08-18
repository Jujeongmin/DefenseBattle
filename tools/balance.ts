// ============================================================
//  강화(업그레이드) 의존도 측정 시뮬레이터
//  - "강화를 안 하면 클리어할 수 없는가" 를 확인하는 것이 목적.
//  - noUpgrade  : 소환만 한다 (골드가 남아도 강화하지 않음)
//  - upgrade    : 기존 tools/simulate.ts 와 동일한 자동 플레이 정책
//  실행: npx tsx tools/balance.ts [runs]
//
//  meta.ts 가 @agent8/gameserver 를 끌어오고, 그 모듈이 로드 시점에
//  localStorage 를 건드리므로 import 보다 먼저 셤을 깐다.
// ============================================================
import './_shim';
import { Game } from '../game/src/engine';
import { meta } from '../game/src/meta';
import { JOBS, GRADES, GACHA, WAVE, collectionKey } from '../game/src/config';

function setStars(level: number): void {
  for (const job of JOBS) for (const g of GRADES) meta.collectionLevel[collectionKey(job, g.key)] = level;
}

function tryUpgrade(game: Game): boolean {
  const jobs = game.getJobStacks().sort((a, b) => b.count - a.count);
  for (const s of jobs) if (game.gold >= game.upgradeCost(s.job)) return game.upgrade(s.job);
  return false;
}

type Policy = 'upgrade' | 'noUpgrade';

function runOnce(level: number, policy: Policy, armyTarget = 18): number {
  setStars(level);
  const game = new Game();
  game.speed = 1;
  const dt = 1 / 20;
  let sinceAction = 0, t = 0;
  const maxT = 90 * 60;
  while (!game.over && t < maxT) {
    game.update(dt); t += dt; sinceAction += dt;
    if (sinceAction >= 0.2) {
      sinceAction = 0;
      if (game.units.length < armyTarget) { if (game.gold >= 20) game.summon(); }
      else if (policy === 'noUpgrade') { if (game.gold >= 20) game.summon(); }
      else if (!tryUpgrade(game)) { if (game.gold >= 20) game.summon(); }
    }
  }
  return game.wave;
}

function stats(xs: number[]) {
  const avg = xs.reduce((a, b) => a + b, 0) / xs.length;
  return { avg: Math.round(avg * 10) / 10, min: Math.min(...xs), max: Math.max(...xs),
           clear: Math.round((xs.filter((w) => w >= 50).length / xs.length) * 100) };
}

const runs = Number(process.argv[2]) || 8;
const accels = (process.argv[3] || String(WAVE.hpGrowthAccel)).split(',').map(Number);
const bonuses = (process.argv[4] || String(GACHA.bonusPerLevel)).split(',').map(Number);
const W = WAVE as { hpGrowthAccel: number };
const G = GACHA as { bonusPerLevel: number };

function hpAt(w: number, accel: number): number {
  const n = w - 1;
  return WAVE.hpBase * Math.pow(1 + WAVE.hpGrowthPerWave, n + accel * n * n);
}

console.log('accel   bonus/lv  w50HP     ' + [0, 4, 6, 8, 10].map((l) => ('*' + l).padStart(9)).join(''));
for (const accel of accels) {
  W.hpGrowthAccel = accel;
  for (const bonus of bonuses) {
    G.bonusPerLevel = bonus;
    const cells = [0, 4, 6, 8, 10].map((lv) => {
      const s = stats(Array.from({ length: runs }, () => runOnce(lv, 'noUpgrade')));
      return (s.avg + '/' + s.clear + '%').padStart(9);
    });
    console.log(String(accel).padEnd(7), String(bonus).padEnd(9),
      String(Math.round(hpAt(50, accel))).padStart(7), '  ' + cells.join(''));
  }
}
console.log('\n(값 = 평균도달웨이브 / 클리어율, noUpgrade 정책)');
