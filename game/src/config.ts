// ============================================================
//  디펜스 배틀 (Defense Battle) - 게임 데이터/밸런스 테이블
//  (게임 기획서 기준. 숫자 하나만 바꿔도 밸런스가 조정되도록 이곳에 집중)
// ============================================================
import type { IconName } from './icons';
import type {
  Job, Race, Rarity, GradeKey, Grade, ResearchDef, DailyQuestDef, AchievementDef, ResearchKey, ItemKey, BaseJob,
} from './types';


import { tl } from './i18n';
// ---------- 유닛 (직업) ----------
// base: 투사체 형태 (+ sheet 가 없으면 스프라이트 시트), sheet: 전용 시트 이름 (public/sprites/{sheet}_{등급}.png)
// hue: 색조 회전(도) - 전용 아트가 없을 때의 임시 변형
// cooldown: 공격 간격(초), rangeMult: 사거리 배수
// unlock: 해금 조건 (캠페인 스테이지 첫 클리어) 또는 보석 구매
export interface UnitDef {
  id: Job;
  kr: string;
  base: BaseJob;      // 투사체 모양 (archer=화살, wizard=마법구, warrior=근접)
  sheet?: string;
  hue: number;
  cooldown: number;
  rangeMult: number;
  atkMult: number;
  role: string;
  rarity: Rarity;
  tint: string;       // 구역·투사체 색
  fav?: Race;         // 상성 유리 종족 (1.0, 나머지 0.9). 없으면 모두 0.9
  unlockStage?: string;
  unlockCrystals?: number; // 보석으로 바로 해금 (전설은 상자·뽑기로만)
}
// 등급은 '얻기 어려움'이다 (같은 레벨이면 비슷한 전력). 상자·뽑기에서 나오는 확률과 레벨업 카드 수가 다르다.
export const UNITS: UnitDef[] = [
  // ---- 일반 ----
  { id: 'archer',   kr: tl('궁수'),     base: 'archer',  hue: 0, cooldown: 1.0,  rangeMult: 1.0,  atkMult: 1.0,  role: tl('다중 사격'), rarity: 'common', tint: '#3fae4a', fav: 'orc' },
  { id: 'wizard',   kr: tl('마법사'),   base: 'wizard',  hue: 0, cooldown: 1.0,  rangeMult: 1.0,  atkMult: 1.0,  role: tl('범위 폭발'), rarity: 'common', tint: '#8e5bd8', fav: 'undead' },
  { id: 'warrior',  kr: tl('전사'),     base: 'warrior', hue: 0, cooldown: 1.0,  rangeMult: 1.0,  atkMult: 1.0,  role: tl('둔화'), rarity: 'common', tint: '#c9a13b', fav: 'troll' },
  { id: 'spearman', kr: tl('창병'),     base: 'warrior', sheet: 'Spearman', hue: 0, cooldown: 1.05, rangeMult: 1.05, atkMult: 0.95, role: tl('관통'), rarity: 'common', tint: '#b8864b', fav: 'troll', unlockCrystals: 200 },
  { id: 'slinger',  kr: tl('투석병'),   base: 'archer', sheet: 'Slinger',  hue: 0, cooldown: 1.1,  rangeMult: 1.0,  atkMult: 0.95, role: tl('넉백'), rarity: 'common', tint: '#9a8a6a', fav: 'orc', unlockCrystals: 200 },
  { id: 'monk',     kr: tl('수도승'),   base: 'warrior', sheet: 'Monk', hue: 0, cooldown: 0.6,  rangeMult: 0.9,  atkMult: 0.55, role: tl('연타'), rarity: 'common', tint: '#e0a050', fav: 'troll', unlockCrystals: 200 },
  { id: 'hunter',   kr: tl('사냥꾼'),   base: 'archer', sheet: 'Hunter',  hue: 0, cooldown: 1.0,  rangeMult: 1.1,  atkMult: 0.9,  role: tl('표식'), rarity: 'common', tint: '#6a9a3a', fav: 'orc', unlockCrystals: 200 },
  { id: 'acolyte',  kr: tl('견습 사제'), base: 'wizard', sheet: 'Acolyte', hue: 0, cooldown: 1.0,  rangeMult: 1.0,  atkMult: 0.9,  role: tl('언데드 특화'), rarity: 'common', tint: '#f0e0a0', unlockCrystals: 200 },
  // ---- 희귀 ----
  { id: 'ranger',   kr: tl('레인저'),   base: 'archer', sheet: 'Ranger',  hue: 0, cooldown: 1.25, rangeMult: 1.3,  atkMult: 1.15, role: tl('저격·치명타'), rarity: 'rare', tint: '#3fa7c9', fav: 'troll', unlockStage: '1-3', unlockCrystals: 300 },
  { id: 'frost',    kr: tl('빙결술사'), base: 'wizard', sheet: 'Frost',   hue: 0, cooldown: 1.1,  rangeMult: 1.0,  atkMult: 0.7,  role: tl('범위 빙결'), rarity: 'rare', tint: '#7fe0ff', unlockStage: '1-6', unlockCrystals: 500 },
  { id: 'poisoner', kr: tl('독술사'),   base: 'wizard', sheet: 'Poisoner',  hue: 0, cooldown: 1.1,  rangeMult: 1.0,  atkMult: 0.7,  role: tl('중독'), rarity: 'rare', tint: '#7ac943', fav: 'troll', unlockCrystals: 500 },
  { id: 'storm',    kr: tl('번개술사'), base: 'wizard', sheet: 'Storm',  hue: 0, cooldown: 1.2,  rangeMult: 1.0,  atkMult: 0.85, role: tl('연쇄 번개'), rarity: 'rare', tint: '#7fb0ff', fav: 'orc', unlockCrystals: 500 },
  { id: 'crossbow', kr: tl('석궁병'),   base: 'archer', sheet: 'Crossbow',  hue: 0, cooldown: 1.3,  rangeMult: 1.15, atkMult: 1.1,  role: tl('일직선 관통'), rarity: 'rare', tint: '#8a6a4a', fav: 'troll', unlockCrystals: 500 },
  { id: 'knight',   kr: tl('기사'),     base: 'warrior', sheet: 'Knight', hue: 0, cooldown: 1.1,  rangeMult: 0.95, atkMult: 1.0,  role: tl('단단한 몹 특화'), rarity: 'rare', tint: '#a0b0c0', fav: 'orc', unlockCrystals: 500 },
  { id: 'berserker', kr: tl('광전사'),  base: 'warrior', sheet: 'Berserker', hue: 0, cooldown: 0.9,  rangeMult: 0.9,  atkMult: 0.85, role: tl('몹 많을수록 강함'), rarity: 'rare', tint: '#d04a3a', fav: 'troll', unlockCrystals: 500 },
  { id: 'merchant', kr: tl('상인'),     base: 'archer', sheet: 'Merchant',  hue: 0, cooldown: 1.0,  rangeMult: 1.0,  atkMult: 0.65, role: tl('처치 골드 +'), rarity: 'rare', tint: '#ffcf3f', unlockCrystals: 500 },
  { id: 'drummer',  kr: tl('북치기'),   base: 'warrior', sheet: 'Drummer', hue: 0, cooldown: 1.1,  rangeMult: 0.95, atkMult: 0.6,  role: tl('아군 공속 +'), rarity: 'rare', tint: '#e07a3a', unlockCrystals: 500 },
  { id: 'houndmaster', kr: tl('조련사'), base: 'archer', sheet: 'Houndmaster', hue: 0, cooldown: 0.9,  rangeMult: 1.0,  atkMult: 0.85, role: tl('빠른 몹 특화'), rarity: 'rare', tint: '#9a6a3a', fav: 'orc', unlockCrystals: 500 },
  // ---- 영웅 ----
  { id: 'paladin',  kr: tl('성기사'),   base: 'warrior', sheet: 'Paladin', hue: 0, cooldown: 1.1, rangeMult: 1.0,  atkMult: 1.0,  role: tl('보스 특화'), rarity: 'epic', tint: '#ffd54f', fav: 'undead', unlockStage: '1-10', unlockCrystals: 800 },
  { id: 'bomber',   kr: tl('폭격수'),   base: 'wizard', sheet: 'Bomber',  hue: 0, cooldown: 1.7,  rangeMult: 1.05, atkMult: 1.25, role: tl('대형 폭발'), rarity: 'epic', tint: '#ff7a3d', fav: 'orc', unlockStage: '2-5', unlockCrystals: 1200 },
  { id: 'assassin', kr: tl('암살자'),   base: 'warrior', sheet: 'Assassin', hue: 0, cooldown: 0.7, rangeMult: 0.9,  atkMult: 0.8,  role: tl('처형'), rarity: 'epic', tint: '#a35bd8', fav: 'orc', unlockStage: '3-1', unlockCrystals: 1800 },
  { id: 'pyro',     kr: tl('화염술사'), base: 'wizard', sheet: 'Pyro',  hue: 0, cooldown: 1.3,  rangeMult: 1.0,  atkMult: 0.85, role: tl('불 장판'), rarity: 'epic', tint: '#ff5a2a', fav: 'troll', unlockCrystals: 1500 },
  { id: 'reaper',   kr: tl('사신'),     base: 'warrior', sheet: 'Reaper', hue: 0, cooldown: 1.0,  rangeMult: 1.0,  atkMult: 0.95, role: tl('처치 시 강화'), rarity: 'epic', tint: '#5a4a7a', fav: 'undead', unlockCrystals: 1500 },
  { id: 'cleric',   kr: tl('성직자'),   base: 'wizard', sheet: 'Cleric',  hue: 0, cooldown: 1.0,  rangeMult: 1.0,  atkMult: 0.85, role: tl('회복·부활 차단'), rarity: 'epic', tint: '#fff0c0', fav: 'undead', unlockCrystals: 1500 },
  { id: 'cannoneer', kr: tl('대포병'),  base: 'wizard', sheet: 'Cannoneer',  hue: 0, cooldown: 2.2,  rangeMult: 1.1,  atkMult: 1.9,  role: tl('강타·기절'), rarity: 'epic', tint: '#6a6a6a', fav: 'troll', unlockCrystals: 1500 },
  { id: 'chrono',   kr: tl('시간술사'), base: 'wizard', sheet: 'Chrono',  hue: 0, cooldown: 1.6,  rangeMult: 1.0,  atkMult: 1.2,  role: tl('범위 정지'), rarity: 'epic', tint: '#c0a0ff', unlockCrystals: 1500 },
  // ---- 전설 (상자·뽑기로만) ----
  { id: 'dragoon',  kr: tl('용기사'),   base: 'warrior', sheet: 'Dragoon', hue: 0, cooldown: 1.4,  rangeMult: 1.1,  atkMult: 1.1,  role: tl('화염 숨결'), rarity: 'legendary', tint: '#ff4a2a', fav: 'troll' },
  { id: 'archmage', kr: tl('대마법사'), base: 'wizard', sheet: 'Archmage',  hue: 0, cooldown: 2.0,  rangeMult: 1.1,  atkMult: 1.3,  role: tl('운석'), rarity: 'legendary', tint: '#ff7ad8', fav: 'undead' },
  { id: 'shadow',   kr: tl('그림자 군주'), base: 'warrior', sheet: 'Shadow', hue: 0, cooldown: 0.9, rangeMult: 0.95, atkMult: 0.9, role: tl('분신'), rarity: 'legendary', tint: '#3a2a5a', fav: 'orc' },
  { id: 'angel',    kr: tl('천사'),     base: 'wizard', sheet: 'Angel',  hue: 0, cooldown: 1.0,  rangeMult: 1.05, atkMult: 0.85, role: tl('아군 공격력 +'), rarity: 'legendary', tint: '#fff8d0', fav: 'undead' },
  { id: 'stormking', kr: tl('폭풍왕'),  base: 'wizard', sheet: 'Stormking',  hue: 0, cooldown: 1.5,  rangeMult: 1.0,  atkMult: 1.0,  role: tl('맵 전체 번개'), rarity: 'legendary', tint: '#4fa0ff', fav: 'orc' },
  { id: 'alchemist', kr: tl('연금술사'), base: 'wizard', sheet: 'Alchemist', hue: 0, cooldown: 1.0,  rangeMult: 1.0,  atkMult: 0.8,  role: tl('합성 보너스'), rarity: 'legendary', tint: '#4adfa0' },
];
export const RARITY_KR: Record<Rarity, string> = { common: tl('일반'), rare: tl('희귀'), epic: tl('영웅'), legendary: tl('전설') };
export const RARITY_COLOR: Record<Rarity, string> = { common: '#9aa0a8', rare: '#4f9dff', epic: '#b06bff', legendary: '#ffb93f' };
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
// ---------- 유닛 카드 (중복으로 레벨업) ----------
// 카드 1장 = 해금, 그 뒤 카드는 레벨업 재료. 레벨업 = 카드 + 보석.
/** Lv n → n+1 에 필요한 카드 (일반 기준, 인덱스 0 = Lv1→2) */
export const CARD_NEED = [2, 4, 10, 20, 50, 100, 200, 400, 800];
/** 등급별 나눗수 - 희귀할수록 적게 필요 */
export const RARITY_DIV: Record<Rarity, number> = { common: 1, rare: 2, epic: 5, legendary: 10 };
export function cardsNeeded(rarity: Rarity, level: number): number {
  return Math.ceil(CARD_NEED[Math.max(0, Math.min(CARD_NEED.length - 1, level - 1))] / RARITY_DIV[rarity]);
}

// ---------- 상자 ----------
export type ChestKind = 'wood' | 'silver' | 'gold' | 'magic' | 'legend';
export interface ChestDef {
  kind: ChestKind;
  kr: string;
  hours: number;              // 열리는 데 걸리는 시간
  cards: number;              // 카드 장수 (아레나마다 + perArena)
  perArena: number;
  gems: [number, number];     // 보석 범위
  rare: number;               // 희귀 카드 장수 (cards 중)
  epic: number;               // 영웅 카드 기대 장수 (소수 = 확률)
  legendary: number;          // 전설 카드 확률
  color: string;
}
export const CHESTS: Record<ChestKind, ChestDef> = {
  wood:   { kind: 'wood',   kr: tl('나무 상자'), hours: 0.5, cards: 6,   perArena: 2,  gems: [8, 15],    rare: 1,  epic: 0.05, legendary: 0,    color: '#b8864b' },
  silver: { kind: 'silver', kr: tl('은 상자'),   hours: 3,   cards: 15,  perArena: 5,  gems: [25, 45],   rare: 3,  epic: 0.25, legendary: 0.01, color: '#c8d0d8' },
  gold:   { kind: 'gold',   kr: tl('금 상자'),   hours: 8,   cards: 40,  perArena: 10, gems: [70, 110],  rare: 8,  epic: 1,    legendary: 0.04, color: '#ffcf3f' },
  magic:  { kind: 'magic',  kr: tl('마법 상자'), hours: 12,  cards: 90,  perArena: 20, gems: [150, 220], rare: 20, epic: 4,    legendary: 0.2,  color: '#b06bff' },
  legend: { kind: 'legend', kr: tl('전설 상자'), hours: 24,  cards: 30,  perArena: 5,  gems: [200, 300], rare: 6,  epic: 2,    legendary: 1,    color: '#ffb93f' },
};
/** 대전 승리 시 받는 상자 순서 (반복) */
export const CHEST_CYCLE: ChestKind[] = ['wood', 'wood', 'silver', 'wood', 'silver', 'gold', 'wood', 'silver', 'silver', 'wood', 'gold', 'magic'];
/** 보석으로 바로 열기: 남은 3분마다 1 */
export function chestOpenCost(msLeft: number): number {
  return Math.max(1, Math.ceil(msLeft / (3 * 60 * 1000)));
}

// ---------- 뽑기 (보석) ----------
export const GACHA = {
  one: 100, ten: 900,
  rates: { common: 0.7, rare: 0.22, epic: 0.07, legendary: 0.01 } as Record<Rarity, number>,
  /** 한 번 뽑을 때 나오는 카드 장수 (등급별) */
  count: { common: 6, rare: 3, epic: 1, legendary: 1 } as Record<Rarity, number>,
};

/** 퍽 개수에 따른 스킬 위력 배수 */
export function perkMult(level: number): number {
  return 1 + UNIT_PERK_LEVELS.filter((l) => level >= l).length * 0.3;
}

// ---------- 몹 종족 ----------
export const RACES: Race[] = ['troll', 'orc', 'undead'];
export const RACE_KR: Record<Race, string> = { troll: tl('트롤'), orc: tl('오크'), undead: tl('언데드') };
export const RACE_SPRITE: Record<Race, string> = { troll: 'Mob_Troll', orc: 'Mob_Orc', undead: 'Mob_Undead' };
/** 종족별 몹 그림 변형 개수 (sprites/Mob_{종족}_{0..n-1}.png) - 몹 종류마다 다른 그림을 쓴다 */
export const MOB_VARIANTS: Record<Race, number> = { troll: 3, orc: 6, undead: 4 };

// ---------- 직업 x 종족 데미지 배율 ----------
// 상성: 유리 1.0 / 불리 0.9. 차이를 작게 둬서 상성을 몰라도 크게 손해 보지 않게 한다 (화면엔 ▲/▼ 만 표시).
export const DMG_MULT: Record<Job, Record<Race, number>> = Object.fromEntries(UNITS.map((u) => [u.id,
  Object.fromEntries((['troll', 'orc', 'undead'] as Race[]).map((r) => [r, u.fav === r ? 1.0 : 0.9])),
])) as Record<Job, Record<Race, number>>;
// 언데드 특화: 견습 사제·성직자는 언데드에 큰 피해
DMG_MULT.acolyte.undead = 1.4;
DMG_MULT.cleric.undead = 1.25;

// ---------- 등급 ----------
// 공격력은 등급마다 3배: 같은 등급 3마리 합성 = 합친 공격력 그대로 + 사거리·스킬 보너스.
// (2배였을 땐 합성할수록 전력이 33% 줄어 합성이 손해였다)
export const GRADES: Grade[] = [
  { key: 'common',    kr: tl('일반'),   spriteIndex: 0, atk: [10, 15],   summonRate: 50,  sellGold: 10,   color: '#b8b8b8' },
  { key: 'rare',      kr: tl('고급'),   spriteIndex: 1, atk: [30, 45],   summonRate: 33,  sellGold: 25,   color: '#4caf50' },
  { key: 'elite',     kr: tl('정예'),   spriteIndex: 2, atk: [90, 135],  summonRate: 10,  sellGold: 60,   color: '#2196f3' },
  { key: 'legendary', kr: tl('전설'),   spriteIndex: 3, atk: [270, 405], summonRate: 6.5, sellGold: 150,  color: '#9c27b0' },
  { key: 'mythic',    kr: tl('신화'),   spriteIndex: 4, atk: [810, 1215], summonRate: 0.4, sellGold: 400,  color: '#ff9800' },
  { key: 'eternal',   kr: tl('태초'),   spriteIndex: 5, atk: [2430, 3645], summonRate: 0.1, sellGold: 1000, color: '#f44336' },
];
export const GRADE_BY_KEY: Record<GradeKey, Grade> =
  Object.fromEntries(GRADES.map((g) => [g.key, g])) as Record<GradeKey, Grade>;
export const GRADE_INDEX: Record<GradeKey, number> =
  Object.fromEntries(GRADES.map((g, i) => [g.key, i])) as Record<GradeKey, number>;

// 전설(index 3) 이상은 맵 전체 사거리
export const FULL_RANGE_FROM_INDEX = 3;

// 등급별 사거리(픽셀, 전장 720). 유닛은 자기 구역 앞 변과 양쪽 모서리 근처만 지킨다 →
// 어느 직업을 어느 구역에 둘지, 상대가 던지는 쪽에 맞춰 구역을 바꾸는 게 전략이 된다.
// 빈 구역이 생겨도 이웃 구역 바깥쪽 유닛이 그 변의 모서리 쪽 절반 정도는 닿는다. 태초만 맵 전체.
export const GRADE_RANGE: number[] = [220, 240, 260, 290, 320, Infinity];
/** 이 등급부터 맵 전체 사거리 (태초) */
export const GLOBAL_RANGE_FROM_INDEX = 5;

// ---------- 경제 ----------
// 시작 골드/처치 골드는 넉넉하게: 초반 화력이 모자라면 처치→골드→소환이 막혀 운으로 무너진다 (tools/simulate.ts)
export const ECONOMY = {
  startGold: 200,
  summonCost: 20,
  /** 덱을 덜 채운 만큼 소환 비용 증가 (빈 칸 1개당 +N배). 한 유닛만 넣고 그 유닛만 합성하는 전략 견제 - tools/decksim.ts */
  deckGapPenalty: 0.5,
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
  // PvP 웨이브당 HP 성장 - 빠르게 올려 한 판을 4분 안팎으로 (tools/pvpsim.ts)
  pvpHpGrowth: 0.25,
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
  // ---- 새 유닛 (정예+ 발동, 전설+ 강화) ----
  spearman: { pierce: 1, pierceHigh: 2, ratio: 0.6 },          // 대상 뒤 일직선 n명 관통
  slinger: { push: 26, pushHigh: 40 },                          // 길 뒤로 밀어냄(px)
  monk: { hits: 2, hitsHigh: 3, ratio: 0.45 },                  // 연타 추가 타수
  hunter: { markDur: 3, markDurHigh: 4.5, markMult: 1.2 },      // 표식: 모든 피해 +20%
  acolyte: { radius: 60, radiusHigh: 80, ratio: 0.4 },          // 언데드에게만 성광 범위 피해
  poisoner: { dps: 0.35, dpsHigh: 0.5, dur: 4, maxStack: 3 },   // 공격력 대비 초당 피해, 중첩
  storm: { bounces: 2, bouncesHigh: 3, range: 110, ratio: 0.6 }, // 연쇄 번개
  crossbow: { length: 260, width: 26, ratio: 0.7, ratioHigh: 0.9 }, // 일직선 관통
  knight: { armoredMult: 1.6, armoredMultHigh: 2.0 },           // 단단한 몹(방패병·거인·킹·마왕·탱커)
  berserker: { perMob: 0.012, cap: 0.8 },                       // 필드 몹 1마리당 +1.2% (최대 +80%)
  merchant: { gold: 1, goldHigh: 2 },                           // 막타 시 골드 추가
  drummer: { radius: 170, haste: 0.15, hasteHigh: 0.22 },       // 주변 아군 공격 간격 감소
  houndmaster: { fastMult: 1.7, fastMultHigh: 2.1 },            // 빠른 몹(질주 엘프·빠른 몹) 특화
  pyro: { radius: 55, radiusHigh: 75, dps: 0.4, dur: 2.5 },     // 불 장판
  reaper: { soulMult: 2.0, maxSouls: 3 },                       // 처치마다 영혼 → 다음 공격 강화, 부활 차단
  cleric: { purifyDur: 3, purifyDurHigh: 5 },                   // 정화: 회복·부활 막음
  cannoneer: { stun: 0.5, stunHigh: 0.8, radius: 45, ratio: 0.5 }, // 강타 + 기절 + 작은 폭발
  chrono: { radius: 85, radiusHigh: 110, stop: 0.7, stopHigh: 1.0 }, // 범위 정지
  dragoon: { length: 240, width: 34, ratio: 0.6, ratioHigh: 0.85 }, // 화염 숨결 직선
  archmage: { radius: 115, radiusHigh: 150, ratio: 0.8 },       // 운석
  shadow: { cloneRatio: 0.6, cloneRatioHigh: 0.9 },              // 분신 추가 타격 (다른 대상 우선)
  angel: { aura: 0.08, auraHigh: 0.12, cap: 0.3 },               // 아군 전체 공격력 + (천사 여럿이면 합, 최대 30%)
  stormking: { strikes: 3, strikesHigh: 5, ratio: 0.45 },        // 맵 어디든 무작위 번개
  alchemist: { chance: 0.06, chanceHigh: 0.1, cap: 0.3 },        // 합성 시 한 등급 더 (여럿이면 합)
  // 공통 치명타
  critChance: 0.1,
  critMult: 2,
} as const;
export const SKILL_KR: Record<Job, string> = {
  archer: tl('다중 사격'), wizard: tl('마력 폭발'), warrior: tl('둔화 강타'),
  ranger: tl('저격'), frost: tl('눈보라'), paladin: tl('심판'), bomber: tl('대폭발'), assassin: tl('처형'),
  spearman: tl('관통 찌르기'), slinger: tl('넉백'), monk: tl('연타'), hunter: tl('표식'), acolyte: tl('성광'),
  poisoner: tl('맹독'), storm: tl('연쇄 번개'), crossbow: tl('관통 화살'), knight: tl('방패 부수기'), berserker: tl('광폭화'),
  merchant: tl('전리품'), drummer: tl('진군 북소리'), houndmaster: tl('사냥개'),
  pyro: tl('불바다'), reaper: tl('영혼 수확'), cleric: tl('정화'), cannoneer: tl('포격'), chrono: tl('시간 정지'),
  dragoon: tl('화염 숨결'), archmage: tl('운석'), shadow: tl('분신'), angel: tl('축복'), stormking: tl('폭풍'), alchemist: tl('연성'),
};
export const SKILL_DESC: Record<Job, string> = {
  archer: tl('정예부터: 주변 적 1명(전설부터 2명)에게 50% 추가 피해'),
  wizard: tl('정예부터: 대상 주변 범위에 35% 폭발 피해'),
  warrior: tl('정예부터: 대상 이동속도 25%(전설부터 38%) 감소'),
  ranger: tl('긴 사거리. 정예부터: 치명타 확률 30%(전설부터 45%)'),
  frost: tl('공격력 낮음. 정예부터: 주변 적 모두 30%(전설부터 45%) 둔화'),
  paladin: tl('정예부터: 보스·정예 몹에게 1.6배(전설부터 2배) 피해'),
  bomber: tl('느린 공격. 정예부터: 넓은 범위에 60% 폭발 피해'),
  assassin: tl('빠른 공격. 정예부터: 체력 12%(전설부터 20%) 이하 적 즉시 처치'),
  spearman: tl('정예부터: 대상 뒤 일직선 1명(전설부터 2명) 관통 60%'),
  slinger: tl('정예부터: 맞은 적을 길 뒤로 밀어냄'),
  monk: tl('아주 빠른 약공. 정예부터: 2연타(전설부터 3연타)'),
  hunter: tl('정예부터: 표식 - 그 적이 받는 모든 피해 +20%'),
  acolyte: tl('언데드에 강함. 정예부터: 주변 언데드에 성광 피해'),
  poisoner: tl('정예부터: 중독 - 4초간 지속 피해, 3번까지 겹침'),
  storm: tl('정예부터: 번개가 주변 적 2명(전설부터 3명)에게 튐'),
  crossbow: tl('정예부터: 화살이 일직선의 적을 모두 관통'),
  knight: tl('정예부터: 방패병·거인·킹·마왕·탱커에게 1.6배(전설부터 2배)'),
  berserker: tl('정예부터: 필드 몹이 많을수록 강해짐 (최대 +80%)'),
  merchant: tl('공격력 낮음. 정예부터: 막타마다 골드 +1(전설부터 +2)'),
  drummer: tl('공격력 낮음. 정예부터: 주변 아군 공격 속도 +15%(전설부터 +22%)'),
  houndmaster: tl('정예부터: 빠른 몹(질주 엘프 등)에게 1.7배(전설부터 2.1배)'),
  pyro: tl('정예부터: 맞은 자리에 불 장판 - 지나가는 적에게 지속 피해'),
  reaper: tl('정예부터: 처치하면 영혼 - 다음 공격 2배, 망령 부활 막음'),
  cleric: tl('언데드에 강함. 정예부터: 정화 - 신관 회복·망령 부활 막음'),
  cannoneer: tl('느린 강타. 정예부터: 기절 + 작은 폭발'),
  chrono: tl('정예부터: 주변 적의 시간을 잠깐 멈춤'),
  dragoon: tl('정예부터: 일직선 화염 숨결로 줄지어 오는 적을 태움'),
  archmage: tl('느린 공격. 정예부터: 넓은 운석 폭발 80%'),
  shadow: tl('정예부터: 분신이 다른 적을 한 번 더 공격'),
  angel: tl('정예부터: 모든 아군 공격력 +8%(전설부터 +12%), 여럿이면 합산'),
  stormking: tl('정예부터: 공격마다 맵 어디든 번개 3개(전설부터 5개)'),
  alchemist: tl('정예부터: 합성할 때 6%(전설부터 10%) 확률로 한 등급 더'),
};

// ---------- 합성 (같은 직업·등급 3개 → 상위 등급 1개) ----------
export const MERGE_COUNT = 3;

// ---------- PvP ----------
// ---------- PvP 몹 카드 (공격 덱) ----------
// 10종 중 4장을 골라 덱을 짠다. 카드마다 잘 막는 유닛(counters)이 달라 상대 덱을 보고 고르는 판단이 생긴다.
//   그림은 카드마다 고정된 종족·변형 (종족 상성도 그대로 적용)
export type AttackKey = 'swarm' | 'rush' | 'giant' | 'ghost' | 'shield' | 'priest' | 'egg' | 'wraith' | 'king' | 'demon'
  | 'thief' | 'golem' | 'berserk' | 'witch' | 'shaman' | 'slime';
export interface AttackDef {
  key: AttackKey;
  kr: string;
  desc: string;          // 카드 한 줄 설명 (짧게)
  race: Race;            // 그림·상성 종족
  variant: number;       // 종족 안 그림 번호
  cost: number;
  count: number;
  hpMult: number;        // 보낸 쪽 웨이브 기본 체력 대비
  speed: number;         // 이동 속도 배율
  size: number;          // 그리기 크기 배율
  cooldown: number;      // 게임 시간(초)
  counters: Job[];       // 이 카드를 잘 막는 유닛 (봇 판단·카드 설명)
  resist?: Job[];        // 이 유닛들의 피해 -60%
  heal?: number;         // 초당 주변 몹 회복 (최대 체력 비율)
  split?: number;        // 죽으면 작은 몹 n 마리로 갈라짐
  revive?: boolean;      // 한 번 되살아남 (체력 50%)
  spawn?: number;        // 4초마다 졸개 n 마리 소환
  stealth?: number;      // 4초마다 n초 동안 숨음 (직접 노릴 수 없음 - 범위 공격엔 맞음)
  enrage?: number;       // 체력 50% 아래면 이동 속도 배율
  blink?: number;        // 3초마다 길을 따라 n px 순간이동
  guard?: number;        // 주변(130px) 다른 몹이 받는 피해 감소 비율
  breed?: boolean;       // 5초 뒤 한 번 복제 (복제는 2대까지)
  gold?: number;         // 처치 골드 (기본 ECONOMY.killGold)
}
export const RESIST_MULT = 0.4;
export const ATTACKS: AttackDef[] = [
  { key: 'swarm', kr: tl('고블린 무리'), desc: tl('약한 몹 8마리'), race: 'orc', variant: 0, cost: 40, count: 8, hpMult: 0.55, speed: 1.1, size: 0.85, cooldown: 0,
    counters: ['wizard', 'bomber'] },
  { key: 'rush', kr: tl('질주 엘프'), desc: tl('아주 빠른 몹 4마리'), race: 'troll', variant: 1, cost: 50, count: 4, hpMult: 0.6, speed: 1.9, size: 0.85, cooldown: 0,
    counters: ['frost', 'warrior'] },
  { key: 'giant', kr: tl('거인'), desc: tl('느리고 단단한 1마리'), race: 'troll', variant: 0, cost: 80, count: 1, hpMult: 7, speed: 0.55, size: 1.7, cooldown: 0,
    counters: ['assassin', 'paladin'], gold: 12 },
  { key: 'ghost', kr: tl('유령'), desc: tl('물리 공격에 강함'), race: 'undead', variant: 1, cost: 60, count: 3, hpMult: 1.05, speed: 1, size: 1, cooldown: 0,
    counters: ['wizard', 'frost'], resist: ['warrior', 'archer', 'ranger', 'assassin'] },
  { key: 'shield', kr: tl('방패병'), desc: tl('화살에 강함'), race: 'troll', variant: 2, cost: 65, count: 3, hpMult: 1.9, speed: 0.85, size: 1.05, cooldown: 0,
    counters: ['wizard', 'bomber', 'warrior'], resist: ['archer', 'ranger'] },
  { key: 'priest', kr: tl('어둠 신관'), desc: tl('주변 몹을 회복'), race: 'orc', variant: 3, cost: 90, count: 1, hpMult: 3.5, speed: 0.9, size: 1.1, cooldown: 0,
    counters: ['assassin', 'ranger'], heal: 0.06, gold: 8 },
  { key: 'egg', kr: tl('분열 알'), desc: tl('죽으면 3마리로'), race: 'undead', variant: 3, cost: 70, count: 2, hpMult: 2.2, speed: 0.9, size: 1.15, cooldown: 0,
    counters: ['bomber', 'wizard'], split: 3 },
  { key: 'wraith', kr: tl('망령'), desc: tl('한 번 되살아남'), race: 'undead', variant: 2, cost: 60, count: 5, hpMult: 0.5, speed: 1.05, size: 0.95, cooldown: 0,
    counters: ['bomber', 'archer'], revive: true },
  { key: 'king', kr: tl('고블린 킹'), desc: tl('졸개를 계속 부름'), race: 'orc', variant: 4, cost: 120, count: 1, hpMult: 7, speed: 0.7, size: 1.45, cooldown: 0,
    counters: ['ranger', 'paladin'], spawn: 3, gold: 16 },
  { key: 'demon', kr: tl('마왕'), desc: tl('아주 강함 · 긴 쿨타임'), race: 'orc', variant: 5, cost: 140, count: 1, hpMult: 26, speed: 0.55, size: 1.9, cooldown: 30,
    counters: ['paladin', 'assassin'], gold: 30 },
  { key: 'thief', kr: tl('그림자 도적'), desc: tl('잠깐씩 숨어 노릴 수 없음'), race: 'orc', variant: 8, cost: 60, count: 4, hpMult: 0.9, speed: 1.15, size: 0.95, cooldown: 0,
    counters: ['wizard', 'bomber', 'pyro'], stealth: 1.8 },
  { key: 'golem', kr: tl('돌 골렘'), desc: tl('마법에 강하고 단단함'), race: 'troll', variant: 3, cost: 85, count: 1, hpMult: 6, speed: 0.55, size: 1.6, cooldown: 0,
    counters: ['knight', 'spearman', 'assassin'], resist: ['wizard', 'storm', 'bomber', 'pyro', 'archmage', 'stormking'], gold: 12 },
  { key: 'berserk', kr: tl('광폭 오크'), desc: tl('체력 절반 아래면 질주'), race: 'orc', variant: 7, cost: 70, count: 3, hpMult: 1.6, speed: 0.85, size: 1.05, cooldown: 0,
    counters: ['frost', 'chrono', 'assassin'], enrage: 1.9 },
  { key: 'witch', kr: tl('점멸 마녀'), desc: tl('3초마다 앞으로 순간이동'), race: 'undead', variant: 0, cost: 65, count: 3, hpMult: 1.1, speed: 0.9, size: 1, cooldown: 0,
    counters: ['frost', 'chrono', 'storm'], blink: 110 },
  { key: 'shaman', kr: tl('수호 주술사'), desc: tl('주변 몹 받는 피해 -35%'), race: 'orc', variant: 6, cost: 95, count: 1, hpMult: 3.2, speed: 0.9, size: 1.1, cooldown: 0,
    counters: ['ranger', 'crossbow', 'assassin'], guard: 0.35, gold: 8 },
  { key: 'slime', kr: tl('번식 유령'), desc: tl('5초 뒤 한 마리씩 불어남'), race: 'undead', variant: 4, cost: 75, count: 2, hpMult: 1.5, speed: 0.9, size: 1.05, cooldown: 0,
    counters: ['ranger', 'cannoneer', 'reaper'], breed: true },
];
/** 몹 카드 전용 그림 (웨이브 몹 그림 변형 MOB_VARIANTS 밖의 번호) - 미리 받기용 */
export const CARD_ONLY_VARIANTS = ATTACKS.filter((a) => a.variant >= MOB_VARIANTS[a.race]).map((a) => ({ race: a.race, variant: a.variant }));
/** 추천 덱 (덱 화면 '추천 덱') - 없는 카드가 있으면 잠금으로 보인다 */
export interface DeckPreset<K> { name: string; desc: string; cards: K[] }
export const UNIT_PRESETS: DeckPreset<Job>[] = [
  { name: tl('기본기'), desc: tl('처음 시작하기 좋은 골고루 덱'), cards: ['archer', 'wizard', 'warrior', 'ranger'] },
  { name: tl('물량 정리'), desc: tl('몰려오는 몹을 범위 공격으로 쓸어 담아요 · 고블린 무리·분열 알·도적'), cards: ['wizard', 'bomber', 'pyro', 'frost'] },
  { name: tl('거대 몹 사냥'), desc: tl('거인·골렘·마왕처럼 큰 몹을 빨리 녹여요'), cards: ['paladin', 'knight', 'assassin', 'ranger'] },
  { name: tl('발 묶기'), desc: tl('빠른 몹·점멸 마녀·광폭 오크를 붙잡아 둬요'), cards: ['frost', 'warrior', 'chrono', 'storm'] },
  { name: tl('저격 처형'), desc: tl('신관·주술사 같은 핵심 몹을 먼저 끊어요'), cards: ['ranger', 'crossbow', 'assassin', 'hunter'] },
  { name: tl('전설 조합'), desc: tl('전설 유닛만으로 끝까지 버텨요'), cards: ['archmage', 'angel', 'dragoon', 'stormking'] },
];
export const ATTACK_PRESETS: DeckPreset<AttackKey>[] = [
  { name: tl('물량 공세'), desc: tl('몹 수로 밀어붙여요 · 범위 공격이 약한 상대에게'), cards: ['swarm', 'egg', 'slime', 'king'] },
  { name: tl('철벽 행진'), desc: tl('단단한 몹을 회복시키며 버텨요 · 한 방이 약한 상대에게'), cards: ['giant', 'golem', 'shield', 'priest'] },
  { name: tl('기습'), desc: tl('빠르고 잡기 까다로운 몹 · 둔화가 없는 상대에게'), cards: ['rush', 'thief', 'witch', 'berserk'] },
  { name: tl('마왕 강림'), desc: tl('주술사 보호막 아래 마왕을 보내요'), cards: ['demon', 'shaman', 'priest', 'wraith'] },
];
export const ATTACK_BY_KEY = Object.fromEntries(ATTACKS.map((a) => [a.key, a])) as Record<AttackKey, AttackDef>;
export const STARTER_ATTACKS: AttackKey[] = ['swarm', 'rush', 'giant', 'egg'];
export const ATTACK_DECK_SIZE = 4;

export const PVP = {
  hpMult: 3,            // PvP 몹 시작 체력 배율 - pvpHpGrowth 와 함께 한 판 ~4분 (tools/pvpsim.ts)
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
  { key: 'atk',       kr: tl('공격력 연구'),   max: 20, desc: tl('레벨 당 공격력 +4%'),        per: 0.04 },
  { key: 'startGold', kr: tl('시작 골드 연구'), max: 20, desc: tl('레벨 당 시작 골드 +10'),      per: 10 },
  { key: 'goldGain',  kr: tl('골드 획득 연구'), max: 20, desc: tl('몬스터 처치 골드 +4%'),       per: 0.04 },
  { key: 'rare',      kr: tl('희귀 소환 연구'), max: 10, desc: tl('전설 이상 등장 확률 소폭 증가'), per: 0.5 },
  { key: 'boss',      kr: tl('보스 피해 연구'), max: 20, desc: tl('보스 대상 공격력 +4%'),        per: 0.04 },
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
  units?: Partial<Record<Job, number>>; // 유닛 즉시 해금 + 이 레벨까지 (이미 더 높으면 그대로)
  chest?: ChestKind;        // 상자 바로 열기
}
// offer = 팝업으로 뜨는 24시간 한정 상품 (뜬 동안만 상점에도 보임), unit = 유닛 패키지
export type ProductCategory = 'crystal' | 'package' | 'booster' | 'pass' | 'offer' | 'unit' | 'chest';
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
  // 유닛: 보석 해금 가격 + 그 레벨까지 강화 비용
  for (const [j, lv] of Object.entries(g.units ?? {})) {
    v += UNIT_BY_ID[j as Job].unlockCrystals ?? 0;
    for (let l = 1; l < (lv ?? 1); l++) v += unitUpgradeCost(l);
  }
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
  { id: 'starter_pack', kr: tl('스타터 패키지'), icon: 'chest', category: 'package', vx: 100, oneTime: true, badge: tl('1회 한정'),
    desc: tl('보석 150 + 소환권 10 + 골드 부스터 1'),
    grant: { crystals: 150, items: { summonTicket: 10, goldBooster: 1 } } },
  { id: 'monthly_pass', kr: tl('월정액 (30일)'), icon: 'calendar', category: 'package', vx: 500, badge: tl('추천'),
    desc: tl('즉시 보석 300 + 30일간 매일 보석 {0}', MONTHLY_DAILY_CRYSTALS),
    grant: { crystals: 300, monthlyDays: 30 } },
  { id: 'ad_remove', kr: tl('광고 제거 패키지'), icon: 'bolt', category: 'package', vx: AD_REMOVE_VX, oneTime: true, badge: tl('1회 한정'),
    desc: tl('광고 시청 없이 바로 보상 + 3배속 해금 + 보석 500'),
    grant: { adRemove: true, crystals: 500 } },
  // 시즌 패스
  { id: 'season_premium', kr: tl('PvP 시즌 패스'), icon: 'trophy', category: 'pass', vx: 1000,
    desc: tl('이번 시즌 프리미엄 보상 트랙 해금 (지난 단계 보상도 수령 가능)'),
    grant: { seasonPremium: true } },
  // 부스터 (일반 모드 전용 - PvP 에서는 사용 불가)
  { id: 'summon_ticket_pack', kr: tl('소환권 24장'), icon: 'ticket', category: 'booster', vx: 200,
    desc: tl('골드 없이 소환 24회 (일반 모드)'), grant: { items: { summonTicket: 24 } } },
  { id: 'mythic_ticket', kr: tl('신화 확정 소환권'), icon: 'star', category: 'booster', vx: 500,
    desc: tl('신화 등급 유닛 1회 확정 소환 (일반 모드)'), grant: { items: { mythicTicket: 1 } } },
  { id: 'gold_booster_pack', kr: tl('골드 부스터 5개'), icon: 'bag', category: 'booster', vx: 200,
    desc: tl('사용한 판의 시작 골드 2배 (일반 모드)'), grant: { items: { goldBooster: 5 } } },
  // 팝업 한정 패키지 (24시간) - 패배 연속 / 새 아레나 / 새 챕터 때 뜬다 (offers.ts)
  { id: 'offer_comeback', kr: tl('다시 일어서기 패키지'), icon: 'chest', category: 'offer', vx: 200, badge: tl('24시간 한정'),
    desc: tl('보석 300 + 소환권 10 + 골드 부스터 2'), grant: { crystals: 300, items: { summonTicket: 10, goldBooster: 2 } } },
  { id: 'offer_arena', kr: tl('승급 축하 패키지'), icon: 'crown', category: 'offer', vx: 500, badge: tl('24시간 한정'),
    desc: tl('보석 1,000 + 신화 확정 소환권 1'), grant: { crystals: 1000, items: { mythicTicket: 1 } } },
  { id: 'offer_chapter', kr: tl('새 챕터 패키지'), icon: 'map', category: 'offer', vx: 500, badge: tl('24시간 한정'),
    desc: tl('보석 800 + 소환권 30 + 골드 부스터 4'), grant: { crystals: 800, items: { summonTicket: 30, goldBooster: 4 } } },
  // 유닛 패키지 - 바로 해금 + Lv5 (계정당 1회)
  { id: 'unit_ranger', kr: tl('레인저 패키지'), icon: 'helmet', category: 'unit', vx: 300, oneTime: true,
    desc: tl('레인저 즉시 해금 + Lv5 + 보석 200'), grant: { units: { ranger: 5 }, crystals: 200 } },
  { id: 'unit_frost', kr: tl('빙결술사 패키지'), icon: 'helmet', category: 'unit', vx: 300, oneTime: true,
    desc: tl('빙결술사 즉시 해금 + Lv5'), grant: { units: { frost: 5 } } },
  { id: 'unit_paladin', kr: tl('성기사 패키지'), icon: 'helmet', category: 'unit', vx: 500, oneTime: true,
    desc: tl('성기사 즉시 해금 + Lv5 + 보석 300'), grant: { units: { paladin: 5 }, crystals: 300 } },
  { id: 'unit_bomber', kr: tl('폭격수 패키지'), icon: 'helmet', category: 'unit', vx: 500, oneTime: true,
    desc: tl('폭격수 즉시 해금 + Lv5'), grant: { units: { bomber: 5 } } },
  { id: 'unit_assassin', kr: tl('암살자 패키지'), icon: 'helmet', category: 'unit', vx: 700, oneTime: true,
    desc: tl('암살자 즉시 해금 + Lv5'), grant: { units: { assassin: 5 } } },
  // 상자 (사면 바로 열림)
  { id: 'chest_gold', kr: tl('금 상자'), icon: 'chest', category: 'chest', vx: 300,
    desc: tl('카드 40장+ · 영웅 1장'), grant: { chest: 'gold' } },
  { id: 'chest_magic', kr: tl('마법 상자'), icon: 'chest', category: 'chest', vx: 700,
    desc: tl('카드 90장+ · 영웅 4장'), grant: { chest: 'magic' } },
  { id: 'chest_legend', kr: tl('전설 상자'), icon: 'crown', category: 'chest', vx: 1000,
    desc: tl('전설 카드 1장 보장'), grant: { chest: 'legend' } },
  // 보석
  { id: 'crystal_100', kr: tl('보석 100'), icon: 'gem', category: 'crystal', vx: 100, desc: '', grant: { crystals: 100 } },
  { id: 'crystal_550', kr: tl('보석 550'), icon: 'gem', category: 'crystal', vx: 500, desc: '', grant: { crystals: 550 } },
  { id: 'crystal_1200', kr: tl('보석 1,200'), icon: 'gem', category: 'crystal', vx: 1000, desc: '', grant: { crystals: 1200 } },
  { id: 'crystal_2600', kr: tl('보석 2,600'), icon: 'gem', category: 'crystal', vx: 2000, desc: '', grant: { crystals: 2600 } },
  { id: 'crystal_7000', kr: tl('보석 7,000'), icon: 'gem', category: 'crystal', vx: 5000, desc: '', grant: { crystals: 7000 } },
  { id: 'crystal_15000', kr: tl('보석 15,000'), icon: 'gem', category: 'crystal', vx: 10000, desc: '', grant: { crystals: 15000 } },
];
/** 팝업 한정 상품: 어떤 순간에 뜨는지 → 상품 id */
export type OfferKind = 'comeback' | 'arena' | 'chapter';
export const OFFER_PRODUCT: Record<OfferKind, string> = { comeback: 'offer_comeback', arena: 'offer_arena', chapter: 'offer_chapter' };
export const OFFER_HOURS = 24;
/** 유닛 → 그 유닛 패키지 id */
export const UNIT_PACK: Partial<Record<Job, string>> = {
  ranger: 'unit_ranger', frost: 'unit_frost', paladin: 'unit_paladin', bomber: 'unit_bomber', assassin: 'unit_assassin',
};
export const PRODUCT_BY_ID: Record<string, ProductDef> = Object.fromEntries(PRODUCTS.map((p) => [p.id, p]));

export const ITEM_KR: Record<ItemKey, { kr: string; icon: IconName; desc: string }> = {
  summonTicket: { kr: tl('소환권'), icon: 'ticket', desc: tl('판 안에서 골드 없이 유닛 1회 소환') },
  mythicTicket: { kr: tl('신화 확정권'), icon: 'star', desc: tl('판 안에서 신화 등급 유닛을 바로 소환') },
  goldBooster: { kr: tl('골드 부스터'), icon: 'bag', desc: tl('켜고 시작하면 그 판 시작 골드 2배 (일반 모드)') },
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
// 아레나(티어) - 트로피 로드와 같은 축 (v1: 약 3시간에 플래티넘 근처)
export const PVP_TIERS = [
  { min: 0, kr: tl('브론즈'), color: '#cd7f32' },
  { min: 80, kr: tl('실버'), color: '#c0c0c0' },
  { min: 200, kr: tl('골드'), color: '#ffcf3f' },
  { min: 320, kr: tl('플래티넘'), color: '#6fe0d0' },
  { min: 500, kr: tl('다이아'), color: '#6fb6ff' },
  { min: 800, kr: tl('마스터'), color: '#ff6bd5' },
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
  { n: 1, kr: tl('초원의 관문'), waves: 10, desc: tl('기본기를 익히는 첫 전장') },
  { n: 2, kr: tl('어둠의 숲'), waves: 15, desc: tl('빠른 몹과 탱커가 몰려온다') },
  { n: 3, kr: tl('망자의 성채'), waves: 20, desc: tl('연구와 유닛 성장이 필요한 최종 전장') },
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
      unlocks: UNITS.find((u) => u.unlockStage === id)?.id, // 트로피 로드에서도 열린다 (먼저 닿는 쪽)
    };
  }),
);
/** 플레이할 수 있는 캠페인 스테이지 */
export const CAMPAIGN: StageDef[] = STAGES;

// ---------- 트로피 로드 (v1 의 진행 축) - 트로피가 오르면 보석과 유닛 해금 ----------
export interface RoadStep { at: number; crystals?: number; unit?: Job; attack?: AttackKey; chest?: ChestKind }
// 대전만 하는 사람(시뮬 실력 0.35, 승률 ~60%, 시간당 ~200 트로피) 기준 유닛 5종 약 4시간, 몹 카드 12종 약 7시간.
// 몹 카드는 트로피가 오를 때마다 하나씩 (기본 4장 + 로드 12장 = 16장).
// 캠페인을 같이 하면 스테이지 클리어로 유닛이 더 일찍 열린다 (둘 다 하는 보상). 급하면 상점의 유닛 패키지.
// (tools/progsim.ts 로 검증)
export const TROPHY_ROAD: RoadStep[] = [
  { at: 15, crystals: 50 },
  { at: 30, unit: 'ranger' },
  { at: 60, attack: 'ghost' },
  { at: 90, crystals: 80 },
  { at: 120, unit: 'frost' },
  { at: 150, crystals: 100 },
  { at: 180, attack: 'shield' },
  { at: 220, crystals: 120 },
  { at: 240, attack: 'berserk' },
  { at: 260, chest: 'silver' },
  { at: 300, unit: 'paladin' },
  { at: 350, crystals: 160 },
  { at: 400, attack: 'wraith' },
  { at: 450, crystals: 180 },
  { at: 470, attack: 'thief' },
  { at: 500, chest: 'gold' },
  { at: 550, unit: 'bomber' },
  { at: 600, crystals: 220 },
  { at: 650, attack: 'priest' },
  { at: 690, attack: 'witch' },
  { at: 720, crystals: 250 },
  { at: 800, chest: 'magic' },
  { at: 850, unit: 'assassin' },
  { at: 900, attack: 'golem' },
  { at: 950, attack: 'king' },
  { at: 1000, crystals: 400 },
  { at: 1050, attack: 'shaman' },
  { at: 1100, crystals: 450 },
  { at: 1200, attack: 'demon' },
  { at: 1300, attack: 'slime' },
  { at: 1350, chest: 'legend' },
  { at: 1500, crystals: 600 },
  { at: 1700, crystals: 700 },
  { at: 2000, chest: 'legend' },
];

/** 챕터 별 개수 목표 → 보석 보상 */
export const CHAPTER_STAR_GOALS = [10, 20, 30];
export function chapterStarReward(goalIdx: number): number {
  return [100, 200, 400][goalIdx];
}

export const STAGE_BY_ID: Record<string, StageDef> = Object.fromEntries(STAGES.map((s) => [s.id, s]));
// 별 기준: 판 도중 필드 몹 최대치 (적을수록 안정적인 방어)
export const STAR_PEAK = { three: 40, two: 70 };
export function starsFor(peakMobs: number): number {
  return peakMobs <= STAR_PEAK.three ? 3 : peakMobs <= STAR_PEAK.two ? 2 : 1;
}
// 기능 해금 스테이지 - 로비 메뉴는 해금 전엔 보이지 않고, 해금되면 NEW 로 하나씩 등장한다
// 대전 중심: 1-1 튜토리얼을 마치면 바로 대전·덱, 이후 캠페인을 하며 연구·퀘스트·무한 모드가 열린다
export const FEATURE_UNLOCK: Record<'units' | 'research' | 'quests' | 'pvp' | 'endless', string> =
  { units: '1-1', research: '1-2', quests: '1-3', pvp: '1-1', endless: '1-10' };
export const FEATURE_KR: Record<keyof typeof FEATURE_UNLOCK, string> = {
  units: tl('유닛'), research: tl('연구'), quests: tl('퀘스트'), pvp: tl('PvP 대전'), endless: tl('무한 모드'),
};

// ---------- 게임 종료 시 크리스탈 보상 ----------
export function crystalReward(wave: number): number {
  let c = wave * 2;
  c += Math.floor(wave / 10) * 10;
  return c;
}

// ---------- 퀘스트 ----------
export const DAILY_QUESTS: DailyQuestDef[] = [
  { key: 'summon30',  kr: tl('유닛 30회 소환'),   goal: 30, stat: 'summons',  reward: 20 },
  { key: 'kill200',   kr: tl('몬스터 200마리 처치'), goal: 200, stat: 'kills',  reward: 20 },
  { key: 'wave20',    kr: tl('20웨이브 도달'),    goal: 20, stat: 'bestWave', reward: 30 },
  { key: 'sell20',    kr: tl('유닛 20회 판매'),   goal: 20, stat: 'sells',    reward: 15 },
];

export const ACHIEVEMENTS: AchievementDef[] = [
  { key: 'firstLegendary', kr: tl('전설 유닛 최초 획득'), reward: 50 },
  { key: 'firstMythic',    kr: tl('신화 유닛 최초 획득'), reward: 100 },
  { key: 'firstEternal',   kr: tl('태초 유닛 최초 획득'), reward: 300 },
  { key: 'clear10',        kr: tl('10웨이브 클리어'),     reward: 30 },
  { key: 'clear20',        kr: tl('20웨이브 클리어'),     reward: 60 },
  { key: 'clear30',        kr: tl('30웨이브 클리어'),     reward: 100 },
  { key: 'clear40',        kr: tl('40웨이브 클리어'),     reward: 200 },
  { key: 'clear50',        kr: tl('50웨이브 클리어'),     reward: 500 },
];
