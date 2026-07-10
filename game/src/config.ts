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
  archer:  { troll: 0.9, orc: 1.0, undead: 0.8 },
  wizard:  { troll: 0.6, orc: 0.6, undead: 1.0 },
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
  // 50웨이브 클리어가 수학적으로 불가능. 하드코어 곡선을 위해 완화.
  // (연구소 제거 후 유일한 영구 성장 레버가 된 컬렉션 스타업 기준으로 재조정: +9%.
  //  tools/simulateCollection.ts 로 검증 - ★0 하드코어 유지, ★8+ 100% 클리어)
  hpGrowthPerWave: 0.09,
  mobSpeed: 1.2,
  cornerPause: 0.25,
  restBetween: 5.0,
  spawnInterval: 0.6,
  gameOverMobCount: 100,
  bossEvery: 10,
  bossTimeLimit: 100,
  bossHpMult: 25,
  bossSizeMult: 2,
} as const;

// ---------- 소환 확률 도우미 ----------
// 등급 확률 원본 테이블 (rollGrade 와 확률 고지 화면이 반드시 같은 값을 쓰도록 단일 소스로 분리)
function rawGradeRates(rareBonus: number): { key: GradeKey; rate: number }[] {
  const table = GRADES.map((g) => ({ key: g.key, rate: g.summonRate }));
  if (rareBonus > 0) {
    table[3].rate += rareBonus * 0.7;
    table[4].rate += rareBonus * 0.2;
    table[5].rate += rareBonus * 0.1;
  }
  return table;
}

export function rollGrade(rareBonus = 0): GradeKey {
  const table = rawGradeRates(rareBonus);
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

// ---------- 확률 고지 (확률형 아이템 표시 의무 대응) ----------
// 실제 rollGrade 가 사용하는 것과 동일한 원본 비율을 정규화해 %로 반환.
export function gradeProbabilities(rareBonus = 0): { key: GradeKey; pct: number }[] {
  const table = rawGradeRates(rareBonus);
  const total = table.reduce((s, t) => s + t.rate, 0);
  return table.map((t) => ({ key: t.key, pct: (t.rate / total) * 100 }));
}
export const JOB_PROBABILITY_PCT = 100 / JOBS.length; // 직업은 항상 균등 확률

// ---------- 가챠 전용 확률 (게임 내 20골드 소환과 분리) ----------
// 가챠는 크리스탈(과금 재화 VX 로 구매 가능)로 뽑는 컬렉션 시스템이라,
// 소환 확률표를 그대로 쓰면 고등급 중복 수집(스타업)이 사실상 불가능했다.
// 그래서 가챠는 별도의, 훨씬 후한 확률표를 사용한다.
export const GACHA_GRADE_RATES: Record<GradeKey, number> = {
  common: 35, rare: 30, elite: 20, legendary: 10, mythic: 4, eternal: 1,
}; // 합계 100

function weightedPickFrom(pool: GradeKey[]): GradeKey {
  const entries = pool.map((key) => ({ key, rate: GACHA_GRADE_RATES[key] }));
  const total = entries.reduce((s, e) => s + e.rate, 0);
  let r = Math.random() * total;
  for (const e of entries) {
    if (r < e.rate) return e.key;
    r -= e.rate;
  }
  return pool[pool.length - 1];
}

export function rollGachaGrade(): GradeKey {
  return weightedPickFrom(GRADES.map((g) => g.key));
}
// 천장(신화 이상 보장) 발동 시 신화/태초 중 비율대로 선택
export function rollGachaMythicPlus(): GradeKey {
  return weightedPickFrom(['mythic', 'eternal']);
}
// 10연 보장(전설 이상 최소 1개) 발동 시 전설/신화/태초 중 비율대로 선택
export function rollGachaLegendaryPlus(): GradeKey {
  return weightedPickFrom(['legendary', 'mythic', 'eternal']);
}

export function gachaGradeProbabilities(): { key: GradeKey; pct: number }[] {
  const total = GRADES.reduce((s, g) => s + GACHA_GRADE_RATES[g.key], 0);
  return GRADES.map((g) => ({ key: g.key, pct: (GACHA_GRADE_RATES[g.key] / total) * 100 }));
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

// ---------- 유닛 가챠 / 컬렉션 (크리스탈로 뽑기 → 스타업) ----------
export const GACHA = {
  singleCost: 20,     // 1회 뽑기 (크리스탈)
  tenCost: 180,       // 10연 (10% 할인)
  maxLevel: 10,       // 스타업 최대 레벨
  // 스타업 레벨당 해당 유닛 공격력 +8% (최대 ★10 = +80%).
  // tools/simulateCollection.ts 로 검증한 값 - 이보다 낮으면 최대 스타업으로도 50웨이브 클리어 불가.
  bonusPerLevel: 0.08,
  mythicPityCount: 50, // 이 횟수 동안 신화 이상이 안 나오면 다음 뽑기는 신화 이상 확정(천장)
} as const;

// 직업_등급 컬렉션 키
export function collectionKey(job: Job, grade: GradeKey): string {
  return `${job}_${grade}`;
}
// level → level+1 스타업에 필요한 보유 개수 (Lv0→1:5, 1→2:10, 2→3:15 ...)
export function starUpCost(level: number): number {
  return 5 * (level + 1);
}

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
