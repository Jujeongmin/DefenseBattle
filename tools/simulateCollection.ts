// ============================================================
//  컬렉션 스타업 기반 밸런스 시뮬레이터
//  연구소(연구) 탭이 제거된 이후, 유일하게 살아있는 영구 성장 수단은
//  가챠 컬렉션 스타업(collectionBonus)이다. 이 스크립트는 "모든 직업×등급을
//  균일하게 레벨 L까지 스타업했다"는 이상화된 시나리오로 도달 웨이브를 측정한다.
//  실행: npx tsx tools/simulateCollection.ts
// ============================================================
import { Game } from '../game/src/engine';
import { meta } from '../game/src/meta';
import { JOBS, GRADES, GACHA, WAVE, collectionKey } from '../game/src/config';

// 실험용 런타임 오버라이드
const G = GACHA as { bonusPerLevel: number };
const W = WAVE as { hpGrowthPerWave: number };
const BASE_BONUS = GACHA.bonusPerLevel;
const BASE_HP_GROWTH = WAVE.hpGrowthPerWave;

// 18종(3직업×6등급) 컬렉션 레벨을 균일하게 세팅
function setCollectionLevel(level: number): void {
  for (const job of JOBS) {
    for (const grade of GRADES) {
      meta.collectionLevel[collectionKey(job, grade.key)] = level;
    }
  }
}

// ---- 자동 플레이어 정책 (tools/simulate.ts 와 동일) ----
function tryUpgrade(game: Game): boolean {
  const jobs = game.getJobStacks().sort((a, b) => b.count - a.count);
  for (const s of jobs) {
    const cost = game.upgradeCost(s.job);
    if (game.gold >= cost) return game.upgrade(s.job);
  }
  return false;
}

function autoPlay(game: Game, armyTarget: number): void {
  const SUMMON = 20;
  if (game.units.length < armyTarget) {
    if (game.gold >= SUMMON) game.summon();
    return;
  }
  if (!tryUpgrade(game)) {
    if (game.gold >= SUMMON) game.summon();
  }
}

function runOnce(level: number, armyTarget = 18): number {
  setCollectionLevel(level);
  const game = new Game();
  game.speed = 1;
  const dt = 1 / 20;
  const actionEvery = 0.2;
  let sinceAction = 0;
  let t = 0;
  const maxT = 90 * 60;
  while (!game.over && t < maxT) {
    game.update(dt);
    t += dt;
    sinceAction += dt;
    if (sinceAction >= actionEvery) {
      sinceAction = 0;
      autoPlay(game, armyTarget);
    }
  }
  return game.wave;
}

function stats(xs: number[]): { avg: number; min: number; max: number; clearRate: number } {
  const avg = xs.reduce((a, b) => a + b, 0) / xs.length;
  return {
    avg: Math.round(avg * 10) / 10,
    min: Math.min(...xs),
    max: Math.max(...xs),
    clearRate: Math.round((xs.filter((w) => w >= 50).length / xs.length) * 100),
  };
}

function sweep(runs = 30): void {
  const levels = [0, 2, 4, 6, 8, GACHA.maxLevel];
  console.log(`\n=== 컬렉션 스타업 레벨별 도달 웨이브 (각 ${runs}회, armyTarget=18) ===`);
  console.log(`(★ 레벨당 데미지 +${Math.round(GACHA.bonusPerLevel * 100)}%, 최대 ★${GACHA.maxLevel} = +${Math.round(GACHA.bonusPerLevel * GACHA.maxLevel * 100)}%. 모든 18종을 동일 레벨로 가정한 이상화 시나리오)`);
  console.log('★레벨'.padEnd(10), 'avgWave', ' min', ' max', ' clear%');
  for (const lv of levels) {
    const waves = Array.from({ length: runs }, () => runOnce(lv));
    const s = stats(waves);
    console.log(
      String(lv).padEnd(10),
      String(s.avg).padStart(6),
      String(s.min).padStart(4),
      String(s.max).padStart(4),
      String(s.clearRate).padStart(6) + '%',
    );
  }
  console.log('');
}

// bonusPerLevel(★당 데미지%) × HP성장률 그리드 탐색: 어디서 max★=클리어 가능해지는지
function tune(runs = 20): void {
  console.log(`\n=== ★당보너스 × HP성장률 튜닝 (각 ${runs}회, ★0/★${GACHA.maxLevel} 비교) ===`);
  console.log('bonus/lv  hpGrow  none_avg  max_avg  max_clear%');
  for (const bonus of [0.05, 0.08, 0.10, 0.13]) {
    for (const hpg of [0.11, 0.09, 0.07]) {
      G.bonusPerLevel = bonus;
      W.hpGrowthPerWave = hpg;
      setCollectionLevel(0);
      const noneWaves = Array.from({ length: runs }, () => runOnce(0));
      const maxWaves = Array.from({ length: runs }, () => runOnce(GACHA.maxLevel));
      const n = stats(noneWaves), m = stats(maxWaves);
      console.log(
        String(bonus).padEnd(9),
        String(hpg).padEnd(7),
        String(n.avg).padStart(9),
        String(m.avg).padStart(8),
        (String(m.clearRate) + '%').padStart(11),
      );
    }
  }
  G.bonusPerLevel = BASE_BONUS;
  W.hpGrowthPerWave = BASE_HP_GROWTH;
  console.log('');
}

// 튜닝 후보(bonus=0.08, hpGrow=0.09) 적용 상태로 전체 ★0~10 곡선 확인
function curve(runs = 30): void {
  G.bonusPerLevel = 0.08;
  W.hpGrowthPerWave = 0.09;
  console.log('\n(bonusPerLevel=0.08, hpGrowthPerWave=0.09 적용 후)');
  sweep(runs);
  G.bonusPerLevel = BASE_BONUS;
  W.hpGrowthPerWave = BASE_HP_GROWTH;
}

const mode = process.argv[2] || 'sweep';
if (mode === 'tune') tune(Number(process.argv[3]) || 20);
else if (mode === 'curve') curve(Number(process.argv[3]) || 30);
else sweep(Number(process.argv[2]) || 30);
