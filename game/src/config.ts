// ============================================================
//  랜덤 디펜스 - 게임 데이터/밸런스 테이블
//  (게임 기획서 기준. 숫자 하나만 바꿔도 밸런스가 조정되도록 이곳에 집중)
// ============================================================
import type {
  Job, Race, GradeKey, Grade, ResearchDef, DailyQuestDef, AchievementDef, ResearchKey,
} from './types';

// ---------- 직업 ----------
export const JOBS: Job[] = ['archer', 'wizard', 'warrior'];
export const JOB_KR: Record<Job, string> = { archer: '궁수', wizard: '마법사', warrior: '전사' };
export const JOB_SPRITE: Record<Job, string> = { archer: 'Archer', wizard: 'Wizard', warrior: 'Warrior' };

// ---------- 몹 종족 ----------
export const RACES: Race[] = ['troll', 'orc', 'undead'];
export const RACE_KR: Record<Race, string> = { troll: '트롤', orc: '오크', undead: '언데드' };
export const RACE_SPRITE: Record<Race, string> = { troll: 'Mob_Troll', orc: 'Mob_Orc', undead: 'Mob_Undead' };

// ---------- 직업 x 종족 데미지 배율 ----------
export const DMG_MULT: Record<Job, Record<Race, number>> = {
  archer:  { troll: 0.8, orc: 1.0, undead: 0.8 },
  wizard:  { troll: 0.6, orc: 0.8, undead: 1.0 },
  warrior: { troll: 1.0, orc: 0.8, undead: 0.6 },
};

// ---------- 등급 ----------
export const GRADES: Grade[] = [
  { key: 'common',    kr: '일반',   spriteIndex: 0, atk: [10, 15],   summonRate: 50,  sellGold: 10,   color: '#b8b8b8' },
  { key: 'rare',      kr: '고급',   spriteIndex: 1, atk: [20, 30],   summonRate: 33,  sellGold: 25,   color: '#4caf50' },
  { key: 'elite',     kr: '정예',   spriteIndex: 2, atk: [40, 60],   summonRate: 10,  sellGold: 60,   color: '#2196f3' },
  { key: 'legendary', kr: '전설',   spriteIndex: 3, atk: [80, 120],  summonRate: 6.5, sellGold: 150,  color: '#9c27b0' },
  { key: 'mythic',    kr: '신화',   spriteIndex: 4, atk: [160, 240], summonRate: 0.4, sellGold: 400,  color: '#ff9800' },
  { key: 'eternal',   kr: '태초',   spriteIndex: 5, atk: [320, 480], summonRate: 0.1, sellGold: 1000, color: '#f44336' },
];
export const GRADE_BY_KEY: Record<GradeKey, Grade> =
  Object.fromEntries(GRADES.map((g) => [g.key, g])) as Record<GradeKey, Grade>;
export const GRADE_INDEX: Record<GradeKey, number> =
  Object.fromEntries(GRADES.map((g, i) => [g.key, i])) as Record<GradeKey, number>;

// 전설(index 3) 이상은 맵 전체 사거리
export const FULL_RANGE_FROM_INDEX = 3;

// 등급별 사거리(픽셀). 전설 이상은 Infinity 로 처리
// (유닛/몹 크기 확대에 맞춰 상향 - 각 구역이 자기 경로 변을 넉넉히 커버)
export const GRADE_RANGE: number[] = [215, 270, 330, Infinity, Infinity, Infinity];

// ---------- 경제 ----------
export const ECONOMY = {
  startGold: 100,
  summonCost: 20,
  killGold: 2,
  bossGold: 100,
  upgradeBase: 20,
  upgradeStep: 20,
  upgradePerLevel: 0.10,
} as const;

// ---------- 웨이브 ----------
export const WAVE = {
  total: 50,
  mobsPerWave: 40,
  hpBase: 100,
  // 기획서 원안은 +20%(지수)였으나, 그 값으로는 유닛 파워(선형)가 따라잡지 못해
  // 50웨이브 클리어가 수학적으로 불가능. 하드코어(연구 필수) 곡선을 위해 +11% 로 완화.
  hpGrowthPerWave: 0.11,
  mobSpeed: 1.2,
  cornerPause: 0.25,
  restBetween: 5.0,
  spawnInterval: 0.6,
  gameOverMobCount: 100,
  bossEvery: 10,
  bossTimeLimit: 120,
  bossHpMult: 25,
  bossSizeMult: 2,
} as const;

// ---------- 소환 확률 도우미 ----------
export function rollGrade(rareBonus = 0): GradeKey {
  const table = GRADES.map((g) => ({ key: g.key, rate: g.summonRate }));
  const bonus = rareBonus;
  if (bonus > 0) {
    table[3].rate += bonus * 0.7;
    table[4].rate += bonus * 0.2;
    table[5].rate += bonus * 0.1;
  }
  const total = table.reduce((s, t) => s + t.rate, 0);
  let r = Math.random() * total;
  for (const t of table) {
    if (r < t.rate) return t.key;
    r -= t.rate;
  }
  return 'common';
}

export function rollJob(): Job {
  return JOBS[Math.floor(Math.random() * JOBS.length)];
}

// ---------- 연구소 ----------
// 하드코어 곡선을 위해 기획서 원안(+2%/레벨 등)보다 강화된 값 사용.
// 연구 성장이 지수 HP 벽을 넘게 해주는 핵심 진행 요소.
export const RESEARCH: ResearchDef[] = [
  { key: 'atk',       kr: '공격력 연구',   max: 20, desc: '레벨 당 공격력 +4%',        per: 0.04 },
  { key: 'startGold', kr: '시작 골드 연구', max: 20, desc: '레벨 당 시작 골드 +10',      per: 10 },
  { key: 'goldGain',  kr: '골드 획득 연구', max: 20, desc: '몬스터 처치 골드 +4%',       per: 0.04 },
  { key: 'rare',      kr: '희귀 소환 연구', max: 10, desc: '전설 이상 등장 확률 소폭 증가', per: 0.5 },
  { key: 'boss',      kr: '보스 피해 연구', max: 20, desc: '보스 대상 공격력 +4%',        per: 0.04 },
];
export function researchCost(level: number): number {
  return 5 + level * 5;
}

// 연구 레벨당 효과 크기 (엔진이 참조하는 단일 소스). RESEARCH.per 와 동기화.
export const RESEARCH_PER: Record<ResearchKey, number> =
  Object.fromEntries(RESEARCH.map((r) => [r.key, r.per])) as Record<ResearchKey, number>;

// ---------- 상점 (VX 로 구매) ----------
export const AD_REMOVE_VX = 300; // 광고제거 패키지 가격(VX)
export interface CrystalPackage { crystals: number; vx: number; bonus?: number }
export const CRYSTAL_PACKAGES: CrystalPackage[] = [
  { crystals: 100,  vx: 10 },
  { crystals: 550,  vx: 50,  bonus: 10 },
  { crystals: 1200, vx: 100, bonus: 20 },
];

// ---------- 게임 종료 시 크리스탈 보상 ----------
export function crystalReward(wave: number): number {
  let c = wave * 2;
  c += Math.floor(wave / 10) * 10;
  return c;
}

// ---------- 퀘스트 ----------
export const DAILY_QUESTS: DailyQuestDef[] = [
  { key: 'summon30',  kr: '유닛 30회 소환',   goal: 30, stat: 'summons',  reward: 20 },
  { key: 'kill200',   kr: '몬스터 200마리 처치', goal: 200, stat: 'kills',  reward: 20 },
  { key: 'wave20',    kr: '20웨이브 도달',    goal: 20, stat: 'bestWave', reward: 30 },
  { key: 'sell20',    kr: '유닛 20회 판매',   goal: 20, stat: 'sells',    reward: 15 },
];

export const ACHIEVEMENTS: AchievementDef[] = [
  { key: 'firstLegendary', kr: '전설 유닛 최초 획득', reward: 50 },
  { key: 'firstMythic',    kr: '신화 유닛 최초 획득', reward: 100 },
  { key: 'firstEternal',   kr: '태초 유닛 최초 획득', reward: 300 },
  { key: 'clear10',        kr: '10웨이브 클리어',     reward: 30 },
  { key: 'clear20',        kr: '20웨이브 클리어',     reward: 60 },
  { key: 'clear30',        kr: '30웨이브 클리어',     reward: 100 },
  { key: 'clear40',        kr: '40웨이브 클리어',     reward: 200 },
  { key: 'clear50',        kr: '50웨이브 클리어',     reward: 500 },
];
