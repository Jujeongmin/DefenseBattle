// ============================================================
//  랜덤 디펜스 - 게임 데이터/밸런스 테이블
//  (게임 기획서 기준. 숫자 하나만 바꿔도 밸런스가 조정되도록 이곳에 집중)
// ============================================================
import type { IconName } from './icons';
import type {
  Job, Race, GradeKey, Grade, ResearchDef, DailyQuestDef, AchievementDef, ResearchKey, ItemKey, BaseJob,
} from './types';

// ---------- 유닛 (직업) ----------
// base: 투사체 형태 (+ sheet 가 없으면 스프라이트 시트), sheet: 전용 시트 이름 (public/sprites/{sheet}_{등급}.png)
// hue: 색조 회전(도) - 전용 아트가 없을 때의 임시 변형
// cooldown: 공격 간격(초), rangeMult: 사거리 배수
// unlock: 해금 조건 (캠페인 스테이지 첫 클리어) 또는 보석 구매
export interface UnitDef {
  id: Job;
  kr: string;
  base: BaseJob;
  sheet?: string;
  hue: number;
  cooldown: number;
  rangeMult: number;
  atkMult: number;
  role: string;
  unlockStage?: string;
  unlockCrystals?: number;
}
export const UNITS: UnitDef[] = [
  { id: 'archer',   kr: '궁수',     base: 'archer',  hue: 0,    cooldown: 1.0,  rangeMult: 1.0,  atkMult: 1.0,  role: '다중 사격' },
  { id: 'wizard',   kr: '마법사',   base: 'wizard',  hue: 0,    cooldown: 1.0,  rangeMult: 1.0,  atkMult: 1.0,  role: '범위 폭발' },
  { id: 'warrior',  kr: '전사',     base: 'warrior', hue: 0,    cooldown: 1.0,  rangeMult: 1.0,  atkMult: 1.0,  role: '둔화' },
  { id: 'ranger',   kr: '레인저',   base: 'archer', sheet: 'Ranger',  hue: 0,  cooldown: 1.25, rangeMult: 1.3,  atkMult: 1.15, role: '저격·치명타', unlockStage: '1-3', unlockCrystals: 300 },
  { id: 'frost',    kr: '빙결술사', base: 'wizard', sheet: 'Frost',  hue: 0,  cooldown: 1.1,  rangeMult: 1.0,  atkMult: 0.7,  role: '범위 빙결', unlockStage: '1-6', unlockCrystals: 500 },
  { id: 'paladin',  kr: '성기사',   base: 'warrior', sheet: 'Paladin', hue: 0,   cooldown: 1.1,  rangeMult: 1.0,  atkMult: 1.0,  role: '보스 특화', unlockStage: '1-10', unlockCrystals: 800 },
  { id: 'bomber',   kr: '폭격수',   base: 'wizard', sheet: 'Bomber',  hue: 0,  cooldown: 1.7,  rangeMult: 1.05, atkMult: 1.25, role: '대형 폭발', unlockStage: '2-5', unlockCrystals: 1200 },
  { id: 'assassin', kr: '암살자',   base: 'warrior', sheet: 'Assassin', hue: 0,  cooldown: 0.7,  rangeMult: 0.9,  atkMult: 0.8,  role: '처형', unlockStage: '3-1', unlockCrystals: 1800 },
];
export const UNIT_BY_ID: Record<Job, UnitDef> = Object.fromEntries(UNITS.map((u) => [u.id, u])) as Record<Job, UnitDef>;
export const JOBS: Job[] = UNITS.map((u) => u.id);
export const STARTER_UNITS: Job[] = ['archer', 'wizard', 'warrior'];
export const DECK_SIZE = 4;
export const JOB_KR: Record<Job, string> = Object.fromEntries(UNITS.map((u) => [u.id, u.kr])) as Record<Job, string>;
const BASE_SPRITE: Record<BaseJob, string> = { archer: 'Archer', wizard: 'Wizard', warrior: 'Warrior' };
export const JOB_SPRITE: Record<Job, string> = Object.fromEntries(UNITS.map((u) => [u.id, u.sheet ?? BASE_SPRITE[u.base]])) as Record<Job, string>;

// 유닛 영구 레벨 (컬렉션): 레벨당 공격력 +8%, Lv5/Lv10 에 스킬 강화(퍽)
export const UNIT_MAX_LEVEL = 10;
export const UNIT_LEVEL_ATK = 0.08;
export const UNIT_PERK_LEVELS = [5, 10];
export function unitUpgradeCost(level: number): number {
  return 40 + (level - 1) * 40; // Lv1→2: 40, ... Lv9→10: 360
}
/** 퍽 개수에 따른 스킬 위력 배수 */
export function perkMult(level: number): number {
  return 1 + UNIT_PERK_LEVELS.filter((l) => level >= l).length * 0.3;
}

// ---------- 몹 종족 ----------
export const RACES: Race[] = ['troll', 'orc', 'undead'];
export const RACE_KR: Record<Race, string> = { troll: '트롤', orc: '오크', undead: '언데드' };
export const RACE_SPRITE: Record<Race, string> = { troll: 'Mob_Troll', orc: 'Mob_Orc', undead: 'Mob_Undead' };

// ---------- 직업 x 종족 데미지 배율 ----------
// 상성: 유리 1.0 / 불리 0.9. 차이를 작게 둬서 상성을 몰라도 크게 손해 보지 않게 한다 (화면엔 ▲/▼ 만 표시).
export const DMG_MULT: Record<Job, Record<Race, number>> = {
  archer:   { troll: 0.9, orc: 1.0, undead: 0.9 },
  wizard:   { troll: 0.9, orc: 0.9, undead: 1.0 },
  warrior:  { troll: 1.0, orc: 0.9, undead: 0.9 },
  ranger:   { troll: 1.0, orc: 0.9, undead: 0.9 },
  frost:    { troll: 0.9, orc: 0.9, undead: 0.9 },
  paladin:  { troll: 0.9, orc: 0.9, undead: 1.0 },
  bomber:   { troll: 0.9, orc: 1.0, undead: 0.9 },
  assassin: { troll: 0.9, orc: 1.0, undead: 0.9 },
};

// ---------- 등급 ----------
// 공격력은 등급마다 3배: 같은 등급 3마리 합성 = 합친 공격력 그대로 + 사거리·스킬 보너스.
// (2배였을 땐 합성할수록 전력이 33% 줄어 합성이 손해였다)
export const GRADES: Grade[] = [
  { key: 'common',    kr: '일반',   spriteIndex: 0, atk: [10, 15],   summonRate: 50,  sellGold: 10,   color: '#b8b8b8' },
  { key: 'rare',      kr: '고급',   spriteIndex: 1, atk: [30, 45],   summonRate: 33,  sellGold: 25,   color: '#4caf50' },
  { key: 'elite',     kr: '정예',   spriteIndex: 2, atk: [90, 135],  summonRate: 10,  sellGold: 60,   color: '#2196f3' },
  { key: 'legendary', kr: '전설',   spriteIndex: 3, atk: [270, 405], summonRate: 6.5, sellGold: 150,  color: '#9c27b0' },
  { key: 'mythic',    kr: '신화',   spriteIndex: 4, atk: [810, 1215], summonRate: 0.4, sellGold: 400,  color: '#ff9800' },
  { key: 'eternal',   kr: '태초',   spriteIndex: 5, atk: [2430, 3645], summonRate: 0.1, sellGold: 1000, color: '#f44336' },
];
export const GRADE_BY_KEY: Record<GradeKey, Grade> =
  Object.fromEntries(GRADES.map((g) => [g.key, g])) as Record<GradeKey, Grade>;
export const GRADE_INDEX: Record<GradeKey, number> =
  Object.fromEntries(GRADES.map((g, i) => [g.key, i])) as Record<GradeKey, number>;

// 전설(index 3) 이상은 맵 전체 사거리
export const FULL_RANGE_FROM_INDEX = 3;

// 등급별 사거리(픽셀). 전설 이상은 Infinity 로 처리.
// 구역 중심에서 길 대부분이 닿게 넉넉히 준다. 예전 값(215/270/330)은 소환이 몇 직업에 몰려
// 빈 구역이 생기면 그쪽 길이 통째로 사거리 밖이라, 실력과 상관없이 초반에 무너지는 판이 많았다.
export const GRADE_RANGE: number[] = [320, 380, 440, Infinity, Infinity, Infinity];

// ---------- 경제 ----------
// 시작 골드/처치 골드는 넉넉하게: 초반 화력이 모자라면 처치→골드→소환이 막혀 운으로 무너진다 (tools/simulate.ts)
export const ECONOMY = {
  startGold: 200,
  summonCost: 20,
  killGold: 3,
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
  // 50웨이브 클리어가 수학적으로 불가능. 하드코어(연구 필수) 곡선을 위해 완화.
  // 합성/직업 스킬 추가로 유닛 파워가 오른 만큼 +11% → +11.5% 로 재조정 (tools/simulate.ts).
  // 무한 모드/PvP 웨이브당 HP 성장. 합성 공격력 3배 이후 연구 0 평균 ~38웨이브, 연구 MAX ~50웨이브.
  hpGrowthPerWave: 0.17,
  // 캠페인 스테이지 웨이브당 HP 성장 (스테이지 난이도는 STAGE_HP_BASE/STEP 으로 맞춘다)
  stageHpGrowth: 0.115,
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

// 실시간 1초 = 게임 시간 PLAY_SPEED 초 (메인 루프 / AI 연습전 루프에서 곱한다).
// 배속 버튼(1x/2x/3x)은 이 위에 곱해진다. 밸런스 수치(스폰 간격, 휴식, 보스 제한 시간 등)는
// 게임 시간 기준이라 그대로이고, 실제 플레이 시간만 1/PLAY_SPEED 로 줄어든다.
// 엔진(Game.update)에는 곱하지 않는다 - tools/simulate.ts 결과가 바뀌지 않게.
export const PLAY_SPEED = 2;

// ---------- 몹 종류 (웨이브 구성 다양화) ----------
// fast: 빠르고 약함 / tank: 느리고 단단함. 등장 시작 웨이브와 간격(n번째 몹마다)
export const MOB_KINDS = {
  fast: { hpMult: 0.6, speedMult: 1.6, sizeMult: 0.85, fromWave: 4, every: 5 },
  tank: { hpMult: 2.6, speedMult: 0.72, sizeMult: 1.25, fromWave: 11, every: 9 },
} as const;

// ---------- 직업 스킬 (정예 등급 이상에서 발동) ----------
export const SKILL_FROM_INDEX = 2; // 정예(index 2) 이상
export const SKILLS = {
  // 궁수: 다중 사격 - 추가 대상 n명에게 비율 피해 (전설 이상 +1명)
  archer: { extraTargets: 1, extraTargetsHigh: 2, ratio: 0.5 },
  // 마법사: 폭발 - 대상 주변 반경 피해
  wizard: { radius: 62, radiusHigh: 86, ratio: 0.35 },
  // 전사: 둔화 - 대상 이동 속도 감소
  warrior: { slowPct: 0.25, slowPctHigh: 0.38, dur: 1.1 },
  // 레인저: 저격 - 치명타 확률 증가
  ranger: { critChance: 0.3, critChanceHigh: 0.45 },
  // 빙결술사: 범위 빙결 - 반경 내 모두 둔화
  frost: { radius: 70, radiusHigh: 95, slowPct: 0.3, slowPctHigh: 0.45, dur: 1.4 },
  // 성기사: 보스/정예 특화
  paladin: { bossMult: 1.6, bossMultHigh: 2.0 },
  // 폭격수: 대형 폭발
  bomber: { radius: 95, radiusHigh: 125, ratio: 0.6 },
  // 암살자: 처형 - 체력 비율 이하면 즉사 (보스 제외)
  assassin: { execute: 0.12, executeHigh: 0.2 },
  // 공통 치명타
  critChance: 0.1,
  critMult: 2,
} as const;
export const SKILL_KR: Record<Job, string> = {
  archer: '다중 사격', wizard: '마력 폭발', warrior: '둔화 강타',
  ranger: '저격', frost: '눈보라', paladin: '심판', bomber: '대폭발', assassin: '처형',
};
export const SKILL_DESC: Record<Job, string> = {
  archer: '정예+: 주변 적 1명(전설+ 2명)에게 50% 추가 피해',
  wizard: '정예+: 대상 주변 범위에 35% 폭발 피해',
  warrior: '정예+: 대상 이동속도 25%(전설+ 38%) 감소',
  ranger: '긴 사거리. 정예+: 치명타 확률 30%(전설+ 45%)',
  frost: '공격력 낮음. 정예+: 주변 적 모두 30%(전설+ 45%) 둔화',
  paladin: '정예+: 보스·정예 몹에게 1.6배(전설+ 2배) 피해',
  bomber: '느린 공격. 정예+: 넓은 범위에 60% 폭발 피해',
  assassin: '빠른 공격. 정예+: 체력 12%(전설+ 20%) 이하 적 즉시 처치',
};

// ---------- 합성 (같은 직업·등급 3개 → 상위 등급 1개) ----------
export const MERGE_COUNT = 3;

// ---------- PvP ----------
export const PVP = {
  // 몹 보내기: [몹 무리, 정예 몹]
  attacks: [
    { kr: '몹 무리', cost: 40, count: 6, hpMult: 0.9 },
    { kr: '정예 몹', cost: 160, count: 1, hpMult: 14 },
  ],
  reportInterval: 0.5,   // 상태 보고 주기(초)
  matchTimeout: 25,      // 매칭 대기 최대(초) → 초과 시 AI 대전 제안
  trophyWin: 30,
  trophyLoss: 20,
  rewardWin: 40,         // 크리스탈
  rewardLoss: 10,
  seasonXpWin: 100,
  seasonXpLoss: 40,
} as const;

// ---------- 시드 RNG (PvP 양쪽이 같은 웨이브를 보도록) ----------
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

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

export function rollJob(deck: Job[] = STARTER_UNITS): Job {
  return deck[Math.floor(Math.random() * deck.length)];
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

// ---------- 상점 (VX 결제 상품) ----------
// id 는 Verse8 VX Shop 에 등록하는 productId 와 동일해야 한다 (README 참고).
// 지급은 결제 완료 후 서버($onItemPurchased) → 클라이언트 claim 으로 처리.
export interface ProductGrant {
  crystals?: number;
  items?: Partial<Record<ItemKey, number>>;
  adRemove?: boolean;
  monthlyDays?: number;     // 월정액 기간(일)
  seasonPremium?: boolean;  // 현재 시즌 패스 프리미엄
}
export type ProductCategory = 'crystal' | 'package' | 'booster' | 'pass';
export interface ProductDef {
  id: string;
  kr: string;
  desc: string;
  vx: number;               // 기본 가격 (VX Shop 등록 가격이 있으면 그 값을 표시)
  category: ProductCategory;
  oneTime?: boolean;        // 계정당 1회 한정
  badge?: string;
  icon: IconName;
  grant: ProductGrant;
}
export const AD_REMOVE_VX = 500; // 광고제거 패키지 가격(VX)
export const MONTHLY_DAILY_CRYSTALS = 40;
// 가격: 100 VX = 1달러. 모바일 표준 가격대($0.99/1.99/4.99/9.99/19.99/49.99/99.99)에 맞춘다.
// 가성비(효율) 계산 기준: 1 VX = 보석 1. 아이템은 보석 가치로 환산한다.
// 상점에 '효율 300%' 처럼 보여 줘 패키지 구매를 유도한다 (가격은 VX Shop 등록 가격 기준으로 계산).
export const GEM_PER_VX = 1;
export const ITEM_GEM_VALUE: Record<ItemKey, number> = { summonTicket: 10, mythicTicket: 600, goldBooster: 50 };
/** 상품의 보석 환산 가치 (광고 제거·시즌 패스처럼 환산이 안 되는 혜택은 빼고) */
export function productGemValue(p: ProductDef): number {
  const g = p.grant;
  let v = g.crystals ?? 0;
  for (const [k, n] of Object.entries(g.items ?? {})) v += (n ?? 0) * ITEM_GEM_VALUE[k as ItemKey];
  if (g.monthlyDays) v += g.monthlyDays * MONTHLY_DAILY_CRYSTALS;
  return v;
}
/** 효율(%) - 기본 보석 상품(100 VX = 보석 100) 대비. 표시할 가치가 없으면 0 */
export function productEfficiency(p: ProductDef, price = p.vx): number {
  if (!price || p.grant.adRemove || p.grant.seasonPremium) return 0;
  return Math.round((productGemValue(p) / (price * GEM_PER_VX)) * 100);
}
// 보석 상품은 비쌀수록 보너스(110~150%), 패키지는 효율을 크게 줘서(300%) 첫 결제와 월정액을 유도.
export const PRODUCTS: ProductDef[] = [
  // 패키지
  { id: 'starter_pack', kr: '스타터 패키지', icon: 'chest', category: 'package', vx: 100, oneTime: true, badge: '1회 한정',
    desc: '보석 150 + 소환권 10 + 골드 부스터 1',
    grant: { crystals: 150, items: { summonTicket: 10, goldBooster: 1 } } },
  { id: 'monthly_pass', kr: '월정액 (30일)', icon: 'calendar', category: 'package', vx: 500, badge: '추천',
    desc: `즉시 보석 300 + 30일간 매일 보석 ${MONTHLY_DAILY_CRYSTALS}`,
    grant: { crystals: 300, monthlyDays: 30 } },
  { id: 'ad_remove', kr: '광고 제거 패키지', icon: 'bolt', category: 'package', vx: AD_REMOVE_VX, oneTime: true, badge: '1회 한정',
    desc: '광고 제거 + 3배속 해금 + 보석 500',
    grant: { adRemove: true, crystals: 500 } },
  // 시즌 패스
  { id: 'season_premium', kr: 'PvP 시즌 패스', icon: 'trophy', category: 'pass', vx: 1000,
    desc: '이번 시즌 프리미엄 보상 트랙 해금 (지난 단계 보상도 수령 가능)',
    grant: { seasonPremium: true } },
  // 부스터 (일반 모드 전용 - PvP 에서는 사용 불가)
  { id: 'summon_ticket_pack', kr: '소환권 24장', icon: 'ticket', category: 'booster', vx: 200,
    desc: '골드 없이 소환 24회 (일반 모드)', grant: { items: { summonTicket: 24 } } },
  { id: 'mythic_ticket', kr: '신화 확정 소환권', icon: 'star', category: 'booster', vx: 500,
    desc: '신화 등급 유닛 1회 확정 소환 (일반 모드)', grant: { items: { mythicTicket: 1 } } },
  { id: 'gold_booster_pack', kr: '골드 부스터 5개', icon: 'bag', category: 'booster', vx: 200,
    desc: '사용한 판의 시작 골드 2배 (일반 모드)', grant: { items: { goldBooster: 5 } } },
  // 보석
  { id: 'crystal_100', kr: '보석 100', icon: 'gem', category: 'crystal', vx: 100, desc: '', grant: { crystals: 100 } },
  { id: 'crystal_550', kr: '보석 550', icon: 'gem', category: 'crystal', vx: 500, desc: '', grant: { crystals: 550 } },
  { id: 'crystal_1200', kr: '보석 1,200', icon: 'gem', category: 'crystal', vx: 1000, desc: '', grant: { crystals: 1200 } },
  { id: 'crystal_2600', kr: '보석 2,600', icon: 'gem', category: 'crystal', vx: 2000, desc: '', grant: { crystals: 2600 } },
  { id: 'crystal_7000', kr: '보석 7,000', icon: 'gem', category: 'crystal', vx: 5000, desc: '', grant: { crystals: 7000 } },
  { id: 'crystal_15000', kr: '보석 15,000', icon: 'gem', category: 'crystal', vx: 10000, desc: '', grant: { crystals: 15000 } },
];
export const PRODUCT_BY_ID: Record<string, ProductDef> = Object.fromEntries(PRODUCTS.map((p) => [p.id, p]));

export const ITEM_KR: Record<ItemKey, { kr: string; icon: IconName }> = {
  summonTicket: { kr: '소환권', icon: 'ticket' },
  mythicTicket: { kr: '신화 확정권', icon: 'star' },
  goldBooster: { kr: '골드 부스터', icon: 'bag' },
};

// ---------- PvP 시즌 패스 ----------
export interface SeasonReward { crystals?: number; items?: Partial<Record<ItemKey, number>> }
export const SEASON_XP_PER_TIER = 200;
export const SEASON_TIERS: { free: SeasonReward; premium: SeasonReward }[] = Array.from({ length: 20 }, (_, i) => {
  const tier = i + 1;
  const free: SeasonReward = tier % 5 === 0 ? { items: { summonTicket: 5 } } : { crystals: 20 + tier * 2 };
  const premium: SeasonReward =
    tier % 10 === 0 ? { items: { mythicTicket: 1 }, crystals: 200 }
      : tier % 5 === 0 ? { items: { goldBooster: 2, summonTicket: 10 } }
        : { crystals: 60 + tier * 5 };
  return { free, premium };
});

// PvP 트로피 → 티어
export const PVP_TIERS = [
  { min: 0, kr: '브론즈', color: '#cd7f32' },
  { min: 200, kr: '실버', color: '#c0c0c0' },
  { min: 500, kr: '골드', color: '#ffcf3f' },
  { min: 900, kr: '플래티넘', color: '#6fe0d0' },
  { min: 1400, kr: '다이아', color: '#6fb6ff' },
  { min: 2000, kr: '마스터', color: '#ff6bd5' },
];
export function pvpTier(trophies: number): { kr: string; color: string } {
  let t = PVP_TIERS[0];
  for (const x of PVP_TIERS) if (trophies >= x.min) t = x;
  return t;
}

// ---------- 캠페인 (챕터 x 스테이지) ----------
// 짧은 판(5~12분) 단위 진행. 첫 클리어 보상·유닛 해금·별 3개 도전으로 반복 플레이 유도.
export interface StageDef {
  id: string;          // "1-3"
  chapter: number;
  index: number;       // 전체 순번 (0~)
  waves: number;
  hpMult: number;
  races?: Race[];      // 등장 종족 제한 (초반은 1종 → 상성 학습)
  firstReward: number; // 첫 클리어 보석
  replayReward: number;
  unlocks?: Job;       // 첫 클리어 시 해금 유닛
}
export const CHAPTERS = [
  { n: 1, kr: '초원의 관문', waves: 10, desc: '기본기를 익히는 첫 전장' },
  { n: 2, kr: '어둠의 숲', waves: 15, desc: '빠른 몹과 탱커가 몰려온다' },
  { n: 3, kr: '망자의 성채', waves: 20, desc: '연구와 유닛 성장이 필요한 최종 전장' },
] as const;
export const STAGES_PER_CHAPTER = 10;
// 난이도 곡선: 챕터 내에서 점진 상승, 챕터 시작 시 웨이브 수 증가로 한 번 더 상승
// (tools/simulate.ts stages 로 연구 진척별 클리어율 검증)
export const STAGE_HP_BASE = [0.55, 1.4, 2.6];
export const STAGE_HP_STEP = [0.08, 0.14, 0.16];
export const STAGES: StageDef[] = CHAPTERS.flatMap((ch, ci) =>
  Array.from({ length: STAGES_PER_CHAPTER }, (_, si): StageDef => {
    const id = `${ch.n}-${si + 1}`;
    const index = ci * STAGES_PER_CHAPTER + si;
    return {
      id,
      chapter: ch.n,
      index,
      waves: ch.waves,
      hpMult: Math.round((STAGE_HP_BASE[ci] + si * STAGE_HP_STEP[ci]) * 100) / 100,
      // 1-1~1-3 은 종족 1종으로 상성 학습, 이후 전 종족
      races: index === 0 ? ['orc'] : index === 1 ? ['undead'] : index === 2 ? ['troll'] : undefined,
      firstReward: 40 + index * 12,
      replayReward: 10 + index * 3,
      unlocks: UNITS.find((u) => u.unlockStage === id)?.id,
    };
  }),
);
export const STAGE_BY_ID: Record<string, StageDef> = Object.fromEntries(STAGES.map((s) => [s.id, s]));
// 별 기준: 판 도중 필드 몹 최대치 (적을수록 안정적인 방어)
export const STAR_PEAK = { three: 40, two: 70 };
export function starsFor(peakMobs: number): number {
  return peakMobs <= STAR_PEAK.three ? 3 : peakMobs <= STAR_PEAK.two ? 2 : 1;
}
// 기능 해금 스테이지 - 로비 메뉴는 해금 전엔 보이지 않고, 해금되면 NEW 로 하나씩 등장한다
export const FEATURE_UNLOCK = { units: '1-1', research: '1-2', quests: '1-3', pvp: '1-5', endless: '1-10' } as const;
export const FEATURE_KR: Record<keyof typeof FEATURE_UNLOCK, string> = {
  units: '유닛', research: '연구', quests: '퀘스트', pvp: 'PvP 대전', endless: '무한 모드',
};

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
