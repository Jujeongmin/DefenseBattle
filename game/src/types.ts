// ============================================================
//  공용 타입 정의
// ============================================================
// 유닛 종류 (기본 3종 + 해금 5종). 스프라이트는 base 3종 시트를 색조 변형해 사용
export type Job = 'archer' | 'wizard' | 'warrior' | 'ranger' | 'frost' | 'paladin' | 'assassin' | 'bomber'
  | 'spearman' | 'slinger' | 'monk' | 'hunter' | 'acolyte' | 'poisoner'
  | 'storm' | 'crossbow' | 'knight' | 'berserker' | 'merchant' | 'drummer'
  | 'houndmaster' | 'pyro' | 'reaper' | 'cleric' | 'cannoneer' | 'chrono'
  | 'dragoon' | 'archmage' | 'shadow' | 'angel' | 'stormking' | 'alchemist';
/** 유닛 등급 (얻기 어려움 - 상자·뽑기 확률, 레벨업에 필요한 카드 수) */
export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';
export type BaseJob = 'archer' | 'wizard' | 'warrior';
export type Race = 'troll' | 'orc' | 'undead';
import type { AttackKey } from './config';
export type GradeKey = 'common' | 'rare' | 'elite' | 'legendary' | 'mythic' | 'eternal';

export interface Grade {
  key: GradeKey;
  kr: string;
  spriteIndex: number;
  atk: [number, number];
  summonRate: number;
  sellGold: number;
  color: string;
}

export interface ResearchDef {
  key: ResearchKey;
  kr: string;
  max: number;
  desc: string;
  per: number;
}
export type ResearchKey = 'atk' | 'startGold' | 'goldGain' | 'rare' | 'boss';

export interface DailyQuestDef {
  key: string;
  kr: string;
  goal: number;
  stat: QuestStat;
  reward: number;
}
export type QuestStat = 'summons' | 'kills' | 'bestWave' | 'sells';

export interface AchievementDef {
  key: string;
  kr: string;
  reward: number;
}

export interface Unit {
  id: number;
  job: Job;
  grade: GradeKey;
  gradeIndex: number;
  baseAtk: number;
  zoneId: number;
  x: number;
  y: number;
  cooldown: number;
  flash: number;
  dir: number;                                  // 스프라이트 방향 행 (이동 중일 때만 사용)
  face: number;                                 // 서 있을 때 방향 행: 공격한 몹 쪽 (0=하 1=좌 2=우 3=상), 노릴 몹이 없으면 정면
  moveFrom: { x: number; y: number } | null;     // 걷기 트윈 시작점 (null 이면 정지 상태)
  moveTo: { x: number; y: number } | null;       // 걷기 트윈 목표점
  moveElapsed: number;
  moveDur: number;
  _newZone?: number;
  souls?: number;      // 사신: 모은 영혼 (다음 공격 강화)
}

export type MobKind = 'normal' | 'fast' | 'tank' | 'card';

export interface Mob {
  id: number;
  race: Race;
  variant: number;     // 종족 안의 그림 변형 (MOB_VARIANTS)
  kind: MobKind;       // fast=빠름/약함, tank=느림/단단함, card=PvP 상대가 던진 몹 카드
  card?: number;       // 몹 카드 번호 (ATTACKS) - 특수 능력
  tick?: number;       // 회복·소환 주기 타이머
  age?: number;        // 나온 뒤 지난 시간 (은신·점멸·번식 주기)
  hidden?: boolean;    // 그림자 도적: 숨은 중 (직접 노릴 수 없음)
  enraged?: boolean;   // 광폭 오크: 질주 중
  blinkT?: number;     // 점멸 마녀: 다음 순간이동까지
  gen?: number;        // 번식 유령: 몇 번째 복제인지 (0 = 원본)
  bred?: boolean;      // 번식 유령: 이미 복제함
  ghost?: boolean;     // 반투명 (유령)
  gold?: number;       // 처치 골드 덮어쓰기 (분열·졸개는 적게)
  markUntil?: number;  // 사냥꾼 표식 (받는 피해 +)
  poison?: { dps: number; until: number; stacks: number }; // 독술사 중독
  purifyUntil?: number; // 성직자 정화 (회복·부활 막음)
  noRevive?: boolean;  // 사신에게 처치됨 → 부활 못 함
  x: number;
  y: number;
  seg: number;
  pause: number;
  hp: number;
  maxHp: number;
  boss: boolean;
  size: number;
  dead: boolean;
  hitFlash: number;
  speedMult: number;   // 종류별 이동 속도 배율
  slow: number;        // 전사 둔화 남은 시간(초)
  slowPct: number;     // 둔화 비율 (0~1)
  dir: number; // 스프라이트 방향 행: 0=하 1=좌 2=우 3=상
}

export interface Zone {
  id: number;
  cx: number;
  cy: number;
  job: Job | null;
  tri: { x: number; y: number }[]; // 삼각형 꼭짓점 3개 (랜덤 배치용)
}

// 이펙트는 모두 시각 전용 (데미지 판정은 엔진에서 즉시 처리)
export type Effect =
  | { type: 'proj'; x1: number; y1: number; x2: number; y2: number; job: Job; grade: number; ttl: number; dur: number }
  | { type: 'pop'; x: number; y: number; ttl: number; boss: boolean; seed: number }
  | { type: 'dmg'; x: number; y: number; ttl: number; value: number; crit: boolean }
  | { type: 'gold'; x: number; y: number; ttl: number; value: number }
  | { type: 'splash'; x: number; y: number; ttl: number; r: number; color: string }
  | { type: 'slash'; x: number; y: number; ttl: number; seed: number }
  | { type: 'merge'; x: number; y: number; ttl: number; color: string }
  | { type: 'summon'; x: number; y: number; ttl: number; color: string; big: boolean }
  | { type: 'burst'; x: number; y: number; ttl: number; seed: number } // 태초 등급 타격 연출
  | { type: 'drop'; x: number; y: number; ttl: number; dur: number; card: number; seed: number } // 상대가 던진 몹이 떨어지는 중 (착지 지점 경고)
  | { type: 'beam'; x1: number; y1: number; x2: number; y2: number; ttl: number; dur: number; color: string; w: number }; // 직선 공격·번개

export interface LogEntry {
  text: string;
  ttl: number;
}

export interface Banner {
  text: string;
  ttl: number;
}

export interface Stack {
  job: Job;
  grade: GradeKey;
  gradeIndex: number;
  count: number;
  level: number;
  key: string;
}

// 하단 패널용 - 직업 단위 집계 (강화가 직업 단위이므로)
export interface JobStack {
  job: Job;
  count: number;
  level: number;
  topGrade: GradeKey;      // 보유 최고 등급 (대표 스프라이트)
  topGradeIndex: number;
}

export type WaveState = 'spawning' | 'waiting_boss' | 'rest';

// 구역 교환 드래그 상태 (UI 가 갱신, 렌더러가 표시)
export interface DragState {
  from: number;          // 출발 구역 id
  to: number | null;     // 현재 가리키는 구역 id (없으면 null)
  x: number;             // 현재 포인터 논리 좌표
  y: number;
}

export interface GameOverData {
  wave: number;
  reason: string;
  cleared: boolean;
  pvp?: { won: boolean };
  /** 판 도중 필드 몹 최대치 (별 판정) */
  peakMobs: number;
}

// 게임 모드/옵션 - solo(일반) 와 pvp(실시간 1:1) 가 같은 엔진을 공유한다
export type GameMode = 'solo' | 'pvp';
export interface GameOptions {
  mode: GameMode;
  /** 웨이브 구성(종족/몹 종류) 시드. PvP 에서는 두 플레이어가 같은 시드를 쓴다 */
  seed: number;
  /** 연구소 효과 적용 여부 */
  useResearch: boolean;
  /** 연구 레벨을 직접 지정 (봇전의 봇). 없으면 내 저장본의 연구 레벨 */
  research?: Partial<Record<ResearchKey, number>>;
  /** 시작 골드 배수 (골드 부스터) */
  startGoldMult: number;
  /** 퀘스트/업적/최고기록 반영 여부 (AI 상대의 헤드리스 게임은 false) */
  track: boolean;
  /** 출전 덱 - 소환 시 이 중에서 랜덤 */
  deck: Job[];
  /** 덱에 넣을 수 있는 최대 유닛 수 (보유 유닛 수와 덱 칸 중 작은 값). 덱이 이보다 적으면 소환이 비싸진다. 없으면 페널티 없음 */
  deckMin?: number;
  /** PvP 공격 덱 (몹 카드 4장) */
  attackDeck: AttackKey[];
  /** 유닛 영구 레벨 (컬렉션 성장) */
  unitLevels: Partial<Record<Job, number>>;
  /** 웨이브 수 (0 = 기본 50, PvP 는 무한) */
  waves: number;
  /** 몹 체력 배수 (스테이지 난이도) */
  /** 유닛 공격력 배수 (봇 핸디캡 - 사람보다 손이 정확한 봇을 공정하게) */
  atkMult: number;
  hpMult: number;
  /** 등장 종족 제한 (없으면 전체) */
  races?: Race[];
  /** 캠페인 스테이지 id (없으면 무한/PvP) */
  stageId?: string;
}

// PvP: 상대에게 보내는 공격 묶음
export interface AttackPayload {
  card: number;        // ATTACKS 번호 (몹 카드 16종)
  wave: number;        // 보낸 쪽 웨이브 (체력 기준)
  pos?: number;        // 던진 위치: 길(사각 링) 둘레 비율 0~1 (출발점=0, 반시계)
}

// 소모성/영구 아이템 인벤토리 (결제·보상으로 획득)
// gachaTicket: 상점 유닛 뽑기 1회. (예전 판 안 아이템 summonTicket·mythicTicket 은 econ/rules.ts convertLegacyItems 가 바꿔 준다)
export type ItemKey = 'gachaTicket' | 'goldBooster';

// meta.ts
export interface MetaData {
  crystals: number;
  research: Record<ResearchKey, number>;
  achievements: Record<string, boolean>;
  daily: {
    date: string;
    progress: Record<string, number>;
    claimed: Record<string, boolean>;
  };
  bestWave: number;
  items: Record<ItemKey, number>;
  /** PvP 시즌 패스 */
  season: { id: string; xp: number; premium: boolean; claimedFree: number[]; claimedPremium: number[] };
  /** 월정액: 만료 시각(ms)과 마지막 일일 수령 날짜 */
  monthly: { expires: number; lastClaim: string };
  /** 결제 처리 완료된 구매 id (중복 지급 방지) */
  grantedPurchases: string[];
  /** 1회 한정 상품 구매 여부 */
  oneTime: Record<string, boolean | number>;
  pvp: { trophies: number; wins: number; losses: number; streak: number; lossStreak?: number };
  /** 해금한 유닛과 영구 레벨 (없으면 미해금) */
  units: Partial<Record<Job, number>>;
  /** 레벨업용으로 모은 카드 (해금에 쓴 1장 제외) */
  cards: Partial<Record<Job, number>>;
  /** 상자 칸 (null = 빈 칸). openAt = 열리는 시각 (열기 시작 전엔 없음) */
  chests: ({ kind: 'wood' | 'silver' | 'gold' | 'magic' | 'legend'; openAt?: number } | null)[];
  /** 다음 승리 상자 순서 번호 (CHEST_CYCLE) */
  chestCycle: number;
  /** 출전 덱 (최대 4 = 배치 구역 수) */
  deck: Job[];
  /** PvP 공격 덱 (몹 카드 4장) */
  attackDeck: AttackKey[];
  /** 캠페인 스테이지별 별 개수 ("1-3": 2) */
  stages: Record<string, number>;
  /** 튜토리얼 완료 단계 */
  tutorial: number;
  /** 로비에서 이미 확인한(NEW 표시를 지운) 기능 */
  seenFeatures: string[];
  /** 받은 트로피 로드 보상 (트로피 값) */
  roadClaimed: number[];
  /** 떠 있는 한정 상품 (상품 id → 끝나는 시각 ms) */
  offers: Record<string, number>;
  /** 한정 상품 팝업을 마지막으로 띄운 시각 (같은 상품은 하루 한 번) */
  offerShownAt: Record<string, number>;
  /** 지금까지 오른 가장 높은 아레나 (승급 팝업용, PVP_TIERS 번호) */
  arenaMax: number;
  /** 캠페인 연속 실패 수 (다시 일어서기 팝업용) */
  stageFailStreak: number;
  nick: string;
  adRemoved: boolean;
}

// ============================================================
//  플랫폼 추상화 (Verse8 SDK 교체 지점)
//  - LocalPlatform: localStorage + 데모 VX (개발/오프라인)
//  - Verse8Platform: 게임서버(계정 저장) + VX Shop 결제
// ============================================================
/** 결제 완료되어 지급 대기 중인 구매 */
export interface PurchaseRecord {
  purchaseId: string;
  productId: string;
  quantity: number;
}

export interface PlatformAdapter {
  readonly kind: 'local' | 'verse8';
  /** 비동기 초기화 (서버 저장 데이터 로드 등) */
  init(): Promise<void>;
  /** 저장된 메타 로드 (없으면 null) */
  loadMeta(): Partial<MetaData> | null;
  /** 메타 영구 저장 */
  saveMeta(m: MetaData): void;
  /** 보유 VX (로컬 데모만 알 수 있음, Verse8 은 null → 결제창에서 확인) */
  getVX(): number | null;
  /** 상품 가격 (VX Shop 에 등록된 가격, 모르면 null) */
  priceOf(productId: string): number | null;
  /** 결제 시작. 결제창이 닫힐 때 결제 여부를 resolve */
  buy(productId: string): Promise<boolean>;
  /** 결제 완료됐지만 아직 지급하지 않은 구매 목록을 가져오고 비운다 */
  claimPurchases(): Promise<PurchaseRecord[]>;
  /** 계정 식별자 (로컬은 null) */
  accountId(): string | null;
}
