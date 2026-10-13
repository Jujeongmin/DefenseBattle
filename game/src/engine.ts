// ============================================================
//  게임 엔진 - 맵/경로/웨이브/전투/경제 로직
//  (렌더링/DOM 은 여기서 다루지 않음)
// ============================================================
import {
  ECONOMY, WAVE, GRADES, GRADE_BY_KEY, GRADE_INDEX, GRADE_RANGE,
  DMG_MULT, RACES, JOB_KR, FULL_RANGE_FROM_INDEX, GLOBAL_RANGE_FROM_INDEX, RESEARCH_PER,
  MOB_KINDS, SKILLS, SKILL_FROM_INDEX, MERGE_COUNT, PVP, UNIT_BY_ID, STARTER_UNITS,
  UNIT_LEVEL_ATK, perkMult,
  rollGrade, rollJob, makeRng, JOBS, MOB_VARIANTS, ATTACKS, STARTER_ATTACKS, RESIST_MULT,
} from './config';
import {
  meta, researchLevel, addDailyProgress, setDailyBestWave, unlockAchievement,
} from './meta';
import type {
  Job, Race, GradeKey, Unit, Mob, MobKind, Zone, Effect, LogEntry, Banner, Stack, JobStack,
  WaveState, GameOverData, AchievementDef, DragState, GameOptions, AttackPayload, ResearchKey,
} from './types';
import { icon } from './icons';

// ---- 맵 기하 (논리 좌표: 720 x 720) ----
export const MAP = { size: 720 } as const;
const P = 70; // 경로 바깥 여백
export const PATH = {
  // 좌상(시작) → 좌하 → 우하 → 우상 : 반시계방향 순환
  corners: [
    { x: P, y: P },                        // 좌상 (스폰)
    { x: P, y: MAP.size - P },             // 좌하
    { x: MAP.size - P, y: MAP.size - P },  // 우하
    { x: MAP.size - P, y: P },             // 우상
  ] as { x: number; y: number }[],
  width: 44,
};
/** 길 둘레 비율(0~1) → 좌표와 다음 목표 모서리. 0=출발점(좌상), 반시계 순서로 한 바퀴 */
export function pathAt(pos: number): { x: number; y: number; next: number } {
  const c = PATH.corners;
  const d = (((pos % 1) + 1) % 1) * c.length;
  const seg = Math.floor(d) % c.length;
  const t = d - Math.floor(d);
  const a = c[seg], b = c[(seg + 1) % c.length];
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, next: (seg + 1) % c.length };
}
/** 전장 좌표에서 가장 가까운 길 위치(둘레 비율) - 몹을 던진 지점을 길에 붙인다 */
export function pathPosNear(x: number, y: number): number {
  const c = PATH.corners;
  let best = 0, bestD = Infinity;
  for (let i = 0; i < c.length; i++) {
    const a = c[i], b = c[(i + 1) % c.length];
    const vx = b.x - a.x, vy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((x - a.x) * vx + (y - a.y) * vy) / (vx * vx + vy * vy)));
    const d = Math.hypot(a.x + vx * t - x, a.y + vy * t - y);
    if (d < bestD) { bestD = d; best = (i + t) / c.length; }
  }
  return best;
}
/** 길의 각 변(seg) 앞에 있는 유닛 구역: 0=좌변→좌(3), 1=하변→하(2), 2=우변→우(1), 3=상변→상(0) */
export const SEG_ZONE = [3, 2, 1, 0] as const;

const INNER = 118; // 유닛 배치 사각형 여백
const O = MAP.size / 2;

function makeZones(): Zone[] {
  const a = INNER, b = MAP.size - INNER;
  const A = { x: a, y: a }, B = { x: b, y: a }, C = { x: b, y: b }, D = { x: a, y: b };
  const o = { x: O, y: O };
  const tris = [[A, B, o], [B, C, o], [C, D, o], [D, A, o]]; // 상/우/하/좌
  return tris.map((t, i) => ({
    id: i,
    cx: (t[0].x + t[1].x + t[2].x) / 3,
    cy: (t[0].y + t[1].y + t[2].y) / 3,
    job: null,
    tri: t,
  }));
}

let nextId = 1;

const MAX_EFFECTS = 240; // 이펙트 상한 (성능)

export const DEFAULT_OPTIONS: GameOptions = {
  mode: 'solo',
  seed: 0,
  useResearch: true,
  startGoldMult: 1,
  track: true,
  deck: STARTER_UNITS,
  attackDeck: STARTER_ATTACKS,
  unitLevels: {},
  waves: 0,
  hpMult: 1,
  atkMult: 1,
};

// PvP 상대 화면 미니맵용 상태 요약
export interface BoardSnapshot {
  wave: number;
  mobCount: number;
  unitCount: number;
  topGrade: number;
  gold: number;
  /** 몹 [id, x, y, code, size] 평탄화. x,y 는 0~255 양자화, code = 종족 | 종류<<2 | 방향<<4 | 그림변형<<6 */
  mobs: number[];
  /** 유닛 [직업 index, 등급 index, x, y] 평탄화 (x,y 는 0~255 양자화) */
  units: number[];
  bossHp: number; // 보스 체력 비율 (없으면 -1)
  /** 유닛 덱 (JOBS 번호) - 상대가 무엇으로 막는지 보고 카드를 고른다 */
  deck?: number[];
  /** 몹 카드 덱 (ATTACKS 번호) - 무엇이 날아올지 */
  atk?: number[];
  /** 형식 버전 - 2 부터 상대 전장을 스프라이트로 그릴 수 있다 */
  v?: number;
}

/** 상대가 던진 몹이 떨어지는 시간(게임 초) - 착지 지점을 미리 보여 대비할 틈을 준다 */
export const DROP_WARN = 1.6;

/** 스냅샷 몹 code 의 종류 값 */
export const SNAP_KIND = { normal: 0, sent: 1, boss: 2 } as const;

// 이벤트 페이로드 타입
interface EventMap {
  wave: number;
  roster: void;
  achievement: AchievementDef;
  gameover: GameOverData;
  shoot: Job;          // 유닛이 공격 발동
  kill: boolean;       // 몹 처치 (보스면 true)
  bossSpawn: void;     // 보스 등장
  merge: Unit;         // 합성 성공 (결과 유닛)
  attack: AttackPayload;   // PvP: 내가 상대에게 몹을 보냄
  incoming: AttackPayload; // PvP: 상대가 보낸 몹 도착
}
type EventName = keyof EventMap;
type Listener<K extends EventName> = (data: EventMap[K]) => void;

/** 수호 주술사 보호 반경 (px) */
const GUARD_RADIUS = 130;

export class Game {
  readonly opts: GameOptions;
  gold = 0;
  wave = 0;
  mobs: Mob[] = [];
  units: Unit[] = [];
  effects: Effect[] = [];
  levels: Record<string, number> = {}; // 직업별 강화 레벨 (job 을 키로 사용)
  zones: Zone[] = [];
  kills = 0;
  summons = 0;
  sells = 0;
  speed = 1;
  paused = false;
  over = false;
  cleared = false;
  currentRace: Race = RACES[0];
  waveState: WaveState = 'rest';
  restTimer = 1.0;
  spawnTimer = 0;
  spawnedCount = 0;
  spawnGoal = 0;
  isBossWave = false;
  bossTimer = 0;
  log: LogEntry[] = [];
  mythicBanner: Banner | null = null;
  drag: DragState | null = null; // 구역 교환 드래그 중 시각 피드백용
  shake = 0;                      // 화면 흔들림 세기 (렌더러가 감쇠 표시)
  time = 0;                       // 게임 경과 시간(배속 반영)
  sentCount = 0;                  // PvP: 보낸 공격 수
  peakMobs = 0;                   // 필드 몹 최대치 (별 판정)
  private pending: { card: number; hp: number; delay: number; pos: number }[] = []; // PvP: 도착 대기 몹
  /** 화염술사 불 장판 */
  burns: { x: number; y: number; r: number; dps: number; until: number }[] = [];
  /** 지금 공격 중인 유닛 (처치 보상·부활 차단 판정용) */
  private hitter: Unit | null = null;
  /** 프레임마다 다시 계산하는 오라: 천사 공격력 배수, 북치기 위치 */
  private angelMult = 1;
  private drummers: Unit[] = [];
  private rng: () => number = Math.random;
  private _listeners: { [K in EventName]?: Listener<K>[] } = {};

  constructor(opts: Partial<GameOptions> = {}) {
    this.opts = { ...DEFAULT_OPTIONS, ...opts };
    if (!opts.seed) this.opts.seed = Math.floor(Math.random() * 2 ** 31);
    this.reset();
  }

  get isPvp(): boolean { return this.opts.mode === 'pvp'; }
  /** 이 판의 총 웨이브 수 (PvP 는 무한 → Infinity) */
  get totalWaves(): number { return this.isPvp ? Infinity : this.opts.waves || WAVE.total; }

  /** 연구 레벨 (PvP 등 연구 미적용 모드에서는 0) */
  res(key: ResearchKey): number {
    if (!this.opts.useResearch) return 0;
    return this.opts.research ? (this.opts.research[key] ?? 0) : researchLevel(key);
  }

  reset(): void {
    this.rng = makeRng(this.opts.seed);
    this.gold = Math.round(
      (ECONOMY.startGold + this.res('startGold') * RESEARCH_PER.startGold) * this.opts.startGoldMult,
    );
    this.wave = 0;
    this.mobs = [];
    this.units = [];
    this.effects = [];
    this.levels = {};
    this.zones = makeZones();
    this.kills = 0;
    this.summons = 0;
    this.sells = 0;
    this.speed = 1;
    this.paused = false;
    this.over = false;
    this.cleared = false;
    this.currentRace = RACES[0];
    this.waveState = 'rest';
    this.restTimer = 1.0;
    this.spawnTimer = 0;
    this.spawnedCount = 0;
    this.spawnGoal = 0;
    this.isBossWave = false;
    this.bossTimer = 0;
    this.log = [];
    this.mythicBanner = null;
    this.drag = null;
    this.shake = 0;
    this.time = 0;
    this.sentCount = 0;
    this.peakMobs = 0;
    this.pending = [];
    this.burns = [];
    this.attackReadyAt = {};
    this._listeners = {};
  }

  on<K extends EventName>(evt: K, fn: Listener<K>): void {
    ((this._listeners[evt] ??= []) as Listener<K>[]).push(fn);
  }
  emit<K extends EventName>(evt: K, data: EventMap[K]): void {
    (this._listeners[evt] as Listener<K>[] | undefined)?.forEach((f) => f(data));
  }

  // ---------------- 웨이브 ----------------
  startNextWave(): void {
    this.wave += 1;
    if (this.wave > this.totalWaves) { this.win(); return; } // PvP 는 무한 웨이브
    const pool = this.opts.races?.length ? this.opts.races : RACES;
    this.currentRace = pool[Math.floor(this.rng() * pool.length)];
    // 10웨이브마다 + 스테이지 마지막 웨이브는 보스
    this.isBossWave = this.wave % WAVE.bossEvery === 0 || this.wave === this.totalWaves;
    this.spawnedCount = 0;
    this.spawnTimer = 0;
    this.waveState = 'spawning';
    this.spawnGoal = this.isBossWave ? 1 : WAVE.mobsPerWave;
    if (this.isBossWave) this.bossTimer = WAVE.bossTimeLimit;
    if (this.opts.track && !this.isPvp) {
      setDailyBestWave(this.wave);
      if (this.wave > meta.bestWave) meta.bestWave = this.wave;
    }
    this.emit('wave', this.wave);
  }

  baseHp(wave = this.wave): number {
    const pvp = this.opts.mode === 'pvp';
    const growth = this.opts.stageId ? WAVE.stageHpGrowth : pvp ? WAVE.pvpHpGrowth : WAVE.hpGrowthPerWave;
    return WAVE.hpBase * this.opts.hpMult * (pvp ? PVP.hpMult : 1) * Math.pow(1 + growth, Math.max(0, wave - 1));
  }

  waveHp(): number {
    const base = this.baseHp();
    return this.isBossWave ? base * WAVE.bossHpMult : base;
  }

  // 웨이브 안에서 index 번째 몹의 종류 (결정적 → PvP 양쪽 동일)
  private kindFor(index: number): MobKind {
    const n = index + 1;
    if (this.wave >= MOB_KINDS.tank.fromWave && n % MOB_KINDS.tank.every === 0) return 'tank';
    if (this.wave >= MOB_KINDS.fast.fromWave && n % MOB_KINDS.fast.every === 0) return 'fast';
    return 'normal';
  }

  spawnMob(): void {
    const boss = this.isBossWave;
    if (boss) {
      this.addMob('normal', this.waveHp(), true);
      this.shake = Math.max(this.shake, 10);
      this.emit('bossSpawn', undefined);
      return;
    }
    const kind = this.kindFor(this.spawnedCount);
    const k = kind === 'fast' || kind === 'tank' ? MOB_KINDS[kind] : null;
    this.addMob(kind, this.waveHp() * (k ? k.hpMult : 1), false);
  }

  private addMob(kind: MobKind, hp: number, boss: boolean, pos = 0, card?: number): Mob {
    let size = 60; // 그리기 크기 (판정에는 쓰지 않음) - 작은 화면에서도 알아보게 44 → 60
    let speedMult = 1;
    const def = card !== undefined ? ATTACKS[card] : null;
    if (boss) size = 44 * WAVE.bossSizeMult;
    else if (def) {
      size *= def.size;
      speedMult = def.speed;
    } else if (kind === 'fast' || kind === 'tank') {
      size *= MOB_KINDS[kind].sizeMult;
      speedMult = MOB_KINDS[kind].speedMult;
    }
    const start = pathAt(pos);
    // 몹 카드는 카드마다 정해진 그림·종족, 웨이브 몹은 이번 웨이브 종족
    const race = def ? def.race : this.currentRace;
    const n = MOB_VARIANTS[race];
    // 그림 변형: 보스는 가장 강해 보이는 마지막, 탱커는 그 앞, 빠른 몹은 1번, 보통 몹은 앞쪽 두 가지를 섞는다
    const variant = def ? def.variant : boss ? n - 1 : kind === 'tank' ? Math.max(0, n - 2)
      : kind === 'fast' ? Math.min(1, n - 1) : Math.floor(Math.random() * Math.min(2, n));
    const m: Mob = {
      id: nextId++,
      race,
      variant,
      kind,
      card,
      tick: 0,
      ghost: def?.key === 'ghost',
      x: start.x,
      y: start.y,
      seg: start.next,
      pause: 0,
      hp, maxHp: hp,
      boss,
      size,
      dead: false,
      hitFlash: 0,
      speedMult,
      slow: 0,
      slowPct: 0,
      dir: 0,
    };
    this.mobs.push(m);
    return m;
  }

  // ---------------- PvP: 몹 보내기 / 받기 ----------------
  /** 내 공격 덱의 카드 번호들 (ATTACKS 번호) */
  get attackCards(): number[] {
    return this.opts.attackDeck.map((k) => ATTACKS.findIndex((a) => a.key === k)).filter((i) => i >= 0);
  }
  attackCost(card: number): number { return ATTACKS[card].cost; }
  /** 남은 쿨타임(초, 게임 시간) - 마왕처럼 쿨타임이 있는 카드 */
  attackCooldown(card: number): number { return Math.max(0, (this.attackReadyAt[card] ?? 0) - this.time); }
  /** 이번 프레임 살아 있는 수호 주술사 (hit 에서 피해 감소) */
  private guards: Mob[] = [];
  private attackReadyAt: Record<number, number> = {};

  /** 몹 던지기 (덱에 있는 카드만). pos = 상대 길 위치(둘레 비율 0~1) */
  sendAttack(card: number, pos = 0): boolean {
    if (!this.isPvp || this.over || !this.attackCards.includes(card)) return false;
    const def = ATTACKS[card];
    if (this.gold < def.cost || this.attackCooldown(card) > 0) return false;
    this.gold -= def.cost;
    this.attackReadyAt[card] = this.time + def.cooldown;
    this.sentCount += 1;
    const payload: AttackPayload = { card, wave: Math.max(1, this.wave), pos };
    this.pushLog(`${def.kr} 던짐!`);
    this.emit('attack', payload);
    return true;
  }

  receiveAttack(p: AttackPayload): void {
    if (this.over) return;
    const card = ATTACKS[p.card] ? p.card : 0;
    const def = ATTACKS[card];
    const hp = this.baseHp(p.wave) * def.hpMult;
    const pos = Number.isFinite(p.pos) ? (p.pos as number) : 0;
    const at = pathAt(pos);
    for (let i = 0; i < def.count; i++) {
      const delay = DROP_WARN + i * 0.25;
      this.pending.push({ card, hp, delay, pos });
      this.effects.push({ type: 'drop', x: at.x + (Math.random() - 0.5) * 36, y: at.y + (Math.random() - 0.5) * 36, ttl: delay, dur: delay, card, seed: Math.random() });
    }
    this.pushLog(`${icon('warning')} 상대의 ${def.kr}!`);
    if (def.cost >= 80) this.shake = Math.max(this.shake, 6);
    this.emit('incoming', p);
  }

  /** 다른 몹 자리에서 새 몹 (분열·졸개) */
  private spawnFrom(src: Mob, card: number, hp: number, gold: number, sizeMult = 1): Mob {
    const m = this.addMob('card', hp, false, 0, card);
    m.x = src.x + (Math.random() - 0.5) * 30;
    m.y = src.y + (Math.random() - 0.5) * 30;
    m.seg = src.seg;
    m.size *= sizeMult;
    m.gold = gold;
    return m;
  }
  /** 길을 따라 dist 만큼 앞으로 (점멸 마녀) */
  private advance(m: Mob, dist: number): void {
    const c = PATH.corners;
    for (let i = 0; i < 8 && dist > 0; i++) {
      const t = c[m.seg];
      const d = Math.hypot(t.x - m.x, t.y - m.y);
      if (d > dist) { m.x += ((t.x - m.x) / d) * dist; m.y += ((t.y - m.y) / d) * dist; return; }
      m.x = t.x; m.y = t.y; dist -= d;
      m.seg = (m.seg + 1) % c.length;
    }
  }

  private updatePending(dt: number): void {
    if (!this.pending.length) return;
    for (const p of this.pending) p.delay -= dt;
    const ready = this.pending.filter((p) => p.delay <= 0);
    if (!ready.length) return;
    this.pending = this.pending.filter((p) => p.delay > 0);
    for (const p of ready) this.addMob('card', p.hp, false, p.pos, p.card);
    this.shake = Math.max(this.shake, ATTACKS[ready[0].card].cost >= 80 ? 7 : 3); // 착지 쿵
  }

  // PvP 상대 미니맵/상태 보고용 요약
  snapshot(): BoardSnapshot {
    const q = (v: number) => Math.max(0, Math.min(255, Math.round((v / MAP.size) * 255)));
    const mobs: number[] = [];
    for (const m of this.mobs.slice(0, 120)) {
      const kind = m.boss ? SNAP_KIND.boss : m.kind === 'card' ? SNAP_KIND.sent : SNAP_KIND.normal;
      mobs.push(m.id, q(m.x), q(m.y), RACES.indexOf(m.race) | (kind << 2) | (m.dir << 4) | (m.variant << 6), Math.round(m.size));
    }
    const units: number[] = [];
    for (const u of this.units.slice(0, 80)) units.push(JOBS.indexOf(u.job), u.gradeIndex, q(u.x), q(u.y));
    const boss = this.mobs.find((m) => m.boss);
    return {
      wave: this.wave,
      mobCount: this.mobs.length,
      unitCount: this.units.length,
      topGrade: this.units.reduce((g, u) => Math.max(g, u.gradeIndex), -1),
      gold: Math.floor(this.gold),
      mobs,
      units,
      bossHp: boss ? boss.hp / boss.maxHp : -1,
      deck: this.opts.deck.map((j) => JOBS.indexOf(j)),
      atk: this.attackCards,
      v: 2,
    };
  }

  // ---------------- 소환 / 강화 / 판매 ----------------
  /** 다음 소환들의 결과를 정해 둔다 (튜토리얼: 같은 유닛 3장으로 합성을 바로 배우게) */
  private scripted: { job: Job; grade: GradeKey }[] = [];
  scriptSummons(list: { job: Job; grade: GradeKey }[]): void { this.scripted.push(...list); }

  summon(): Unit | null {
    if (this.gold < ECONOMY.summonCost || this.over) return null;
    this.gold -= ECONOMY.summonCost;
    this.summons += 1;
    this.progress('summons');

    const forced = this.scripted.shift();
    if (forced) return this.createUnit(forced.job, forced.grade);
    const rareBonus = this.res('rare') * RESEARCH_PER.rare;
    const gradeKey = rollGrade(rareBonus);
    const job = rollJob(this.opts.deck);
    return this.createUnit(job, gradeKey);
  }

  // 골드 없이 소환 (소환권/신화 확정권, 개발 모드 디버그 버튼).
  // gradeKey 를 주면 해당 등급 확정, 없으면 일반 확률.
  summonFree(gradeKey?: GradeKey): Unit | null {
    if (this.over) return null;
    this.summons += 1;
    this.progress('summons');
    const g = gradeKey ?? rollGrade(this.res('rare') * RESEARCH_PER.rare);
    return this.createUnit(rollJob(this.opts.deck), g);
  }

  // ---------------- 합성 ----------------
  // 같은 직업·등급 3개 → 같은 직업 상위 등급 1개 (태초는 합성 불가)
  canMerge(job: Job, gradeKey: GradeKey): boolean {
    return GRADE_INDEX[gradeKey] < GRADES.length - 1 && this.countOf(job, gradeKey) >= MERGE_COUNT;
  }

  merge(job: Job, gradeKey: GradeKey): Unit | null {
    if (this.over || !this.canMerge(job, gradeKey)) return null;
    let removed = 0;
    let zoneId = 0;
    for (let i = this.units.length - 1; i >= 0 && removed < MERGE_COUNT; i--) {
      const u = this.units[i];
      if (u.job === job && u.grade === gradeKey) {
        zoneId = u.zoneId;
        this.units.splice(i, 1);
        removed += 1;
      }
    }
    let next = GRADES[GRADE_INDEX[gradeKey] + 1];
    // 연금술사: 확률로 한 등급 더 (여럿이면 합산)
    let alch = 0;
    for (const a of this.units) if (a.job === 'alchemist' && a.gradeIndex >= SKILL_FROM_INDEX) alch += a.gradeIndex >= FULL_RANGE_FROM_INDEX ? SKILLS.alchemist.chanceHigh : SKILLS.alchemist.chance;
    const skip = GRADES[GRADE_INDEX[next.key] + 1];
    if (skip && Math.random() < Math.min(SKILLS.alchemist.cap, alch)) { next = skip; this.pushLog(`연금술! ${GRADE_BY_KEY[skip.key].kr} 등급`); }
    const unit = this.createUnit(job, next.key, 'merge');
    const z = this.zones[zoneId];
    this.effects.push({ type: 'merge', x: unit.x, y: unit.y, ttl: 0.7, color: next.color });
    if (z && !this.units.some((u) => u.zoneId === z.id)) z.job = null;
    this.emit('merge', unit);
    return unit;
  }

  /** 합성 가능한 (직업, 등급) 목록 */
  mergeable(): { job: Job; grade: GradeKey }[] {
    const out: { job: Job; grade: GradeKey }[] = [];
    for (const s of this.getStacks()) if (this.canMerge(s.job, s.grade)) out.push({ job: s.job, grade: s.grade });
    return out;
  }

  // 소환 확정 로직 (직업/등급이 정해진 뒤 공통으로 처리)
  private createUnit(job: Job, gradeKey: GradeKey, source: 'summon' | 'merge' = 'summon'): Unit {
    const grade = GRADE_BY_KEY[gradeKey];
    const gIdx = GRADE_INDEX[gradeKey];
    const baseAtk = grade.atk[0] + Math.random() * (grade.atk[1] - grade.atk[0]);

    // 새 직업 구역 배정: 몹 진행(반시계: 좌상→좌하→하단→우측)에 맞춰
    // 상단(0) → 좌측(3) → 하단(2) → 우측(1) 순으로 빈 구역을 채운다
    const ZONE_PRIORITY = [0, 3, 2, 1];
    let zone = this.zones.find((z) => z.job === job)
      || ZONE_PRIORITY.map((i) => this.zones[i]).find((z) => z.job === null)
      || this.zones[0];
    zone.job = job;

    if (!this.levels[job]) this.levels[job] = 1; // 강화는 직업 단위

    const unit: Unit = {
      id: nextId++, job, grade: gradeKey, gradeIndex: gIdx,
      baseAtk: Math.round(baseAtk), zoneId: zone.id,
      x: zone.cx, y: zone.cy, cooldown: 0, flash: 0,
      dir: 0, moveFrom: null, moveTo: null, moveElapsed: 0, moveDur: 0,
    };
    this.units.push(unit);
    this.placeInZone(unit, zone); // 구역 안 랜덤 배치 (겹침 허용)

    const rate = grade.summonRate;
    const verb = source === 'merge' ? '합성' : '소환';
    const text = source === 'merge'
      ? `${icon('hammer')} ${JOB_KR[job]} ${grade.kr}등급 합성`
      : `${rate}% ${JOB_KR[job]} ${grade.kr}등급 소환`;
    if (gIdx >= GRADE_INDEX['mythic']) {
      this.mythicBanner = { text: `${JOB_KR[job]} ${grade.kr} 등급 ${verb}!`, ttl: 4 };
      this.shake = Math.max(this.shake, 5);
    } else {
      this.pushLog(text);
    }
    this.addEffect({ type: 'summon', x: unit.x, y: unit.y, ttl: 0.5, color: grade.color, big: gIdx >= GRADE_INDEX['legendary'] });

    if (gradeKey === 'legendary') this.tryAchieve('firstLegendary');
    if (gradeKey === 'mythic') this.tryAchieve('firstMythic');
    if (gradeKey === 'eternal') this.tryAchieve('firstEternal');

    this.emit('roster', undefined);
    return unit;
  }

  private progress(stat: 'summons' | 'sells' | 'kills'): void {
    if (this.opts.track) addDailyProgress(stat, 1);
  }

  pushLog(text: string): void {
    this.log.unshift({ text, ttl: 10 });
    if (this.log.length > 6) this.log.pop();
  }

  tryAchieve(key: string): void {
    if (!this.opts.track) return;
    const a = unlockAchievement(key);
    if (a) this.emit('achievement', a);
  }

  upgradeCost(job: Job): number {
    const level = this.levels[job] || 1;
    return ECONOMY.upgradeStep * level;
  }

  // 직업 강화: 해당 직업의 모든 등급 유닛에 레벨이 적용된다.
  upgrade(job: Job): boolean {
    if (!this.units.some((u) => u.job === job)) return false;
    const cost = this.upgradeCost(job);
    if (this.gold < cost) return false;
    this.gold -= cost;
    this.levels[job] = (this.levels[job] || 1) + 1;
    this.emit('roster', undefined);
    return true;
  }

  sellOne(job: Job, gradeKey: GradeKey): boolean {
    const idx = this.units.findIndex((u) => u.job === job && u.grade === gradeKey);
    if (idx < 0) return false;
    const grade = GRADE_BY_KEY[gradeKey];
    this.gold += grade.sellGold;
    const [removed] = this.units.splice(idx, 1);
    this.sells += 1;
    this.progress('sells');
    // 구역이 비면 직업 해제 (남은 유닛은 각자 위치 유지)
    if (!this.units.some((u) => u.zoneId === removed.zoneId)) {
      const z = this.zones.find((z) => z.id === removed.zoneId);
      if (z) z.job = null;
    }
    this.emit('roster', undefined);
    return true;
  }

  // qty 만큼 판매 (ALL 은 Infinity). 판매한 개수 반환
  sellMany(job: Job, gradeKey: GradeKey, qty: number): number {
    let sold = 0;
    while (sold < qty && this.sellOne(job, gradeKey)) sold += 1;
    return sold;
  }

  countOf(job: Job, gradeKey: GradeKey): number {
    return this.units.reduce((n, u) => n + (u.job === job && u.grade === gradeKey ? 1 : 0), 0);
  }

  swapZones(idA: number, idB: number): void {
    const a = this.zones[idA], b = this.zones[idB];
    if (!a || !b) return;
    const tmp = a.job; a.job = b.job; b.job = tmp;
    for (const u of this.units) {
      if (u.zoneId === idA) u._newZone = idB;
      else if (u.zoneId === idB) u._newZone = idA;
    }
    for (const u of this.units) {
      if (u._newZone !== undefined) { u.zoneId = u._newZone; delete u._newZone; }
    }
    // 교환된 두 구역의 유닛을 새 구역 안의 임의 지점까지 걸어가게 한다
    for (const u of this.units) {
      if (u.zoneId === idA) this.startWalk(u, this.randomPointInZone(a));
      else if (u.zoneId === idB) this.startWalk(u, this.randomPointInZone(b));
    }
    this.emit('roster', undefined);
  }

  // 구역 삼각형 안의 임의 지점 좌표 계산 (유닛끼리 겹쳐도 됨)
  private randomPointInZone(zone: Zone): { x: number; y: number } {
    let r1 = Math.random(), r2 = Math.random();
    if (r1 + r2 > 1) { r1 = 1 - r1; r2 = 1 - r2; } // 삼각형 균등 샘플링
    const [p0, p1, p2] = zone.tri;
    const x = p0.x + r1 * (p1.x - p0.x) + r2 * (p2.x - p0.x);
    const y = p0.y + r1 * (p1.y - p0.y) + r2 * (p2.y - p0.y);
    // 가장자리 여백: 무게중심 쪽으로 살짝 당겨 스프라이트가 밖으로 안 나가게
    return { x: zone.cx + (x - zone.cx) * 0.82, y: zone.cy + (y - zone.cy) * 0.82 };
  }

  // 즉시 배치 (소환 시 최초 등장 - 걷는 모습을 보일 필요 없음)
  private placeInZone(u: Unit, zone: Zone): void {
    const p = this.randomPointInZone(zone);
    u.x = p.x; u.y = p.y;
  }

  // 목표 지점까지 걸어가는 트윈 시작 (구역 교환 시 사용)
  private startWalk(u: Unit, target: { x: number; y: number }, dur = 0.55): void {
    const dx = target.x - u.x, dy = target.y - u.y;
    if (Math.abs(dx) > Math.abs(dy)) u.dir = dx > 0 ? 2 : 1; // 좌/우
    else u.dir = dy > 0 ? 0 : 3;                              // 하/상
    u.moveFrom = { x: u.x, y: u.y };
    u.moveTo = target;
    u.moveElapsed = 0;
    u.moveDur = dur;
  }

  // 매 프레임 걷기 트윈 진행
  private updateUnitMovement(dt: number): void {
    for (const u of this.units) {
      if (!u.moveTo || !u.moveFrom) continue;
      u.moveElapsed += dt;
      const t = Math.min(1, u.moveElapsed / u.moveDur);
      const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; // easeInOutQuad
      u.x = u.moveFrom.x + (u.moveTo.x - u.moveFrom.x) * e;
      u.y = u.moveFrom.y + (u.moveTo.y - u.moveFrom.y) * e;
      if (t >= 1) { u.x = u.moveTo.x; u.y = u.moveTo.y; u.moveFrom = null; u.moveTo = null; }
    }
  }

  // ---------------- 전투 헬퍼 ----------------
  unitLevel(u: Unit): number { return this.levels[u.job] || 1; }

  unitRange(u: { gradeIndex: number; job: Job }): number {
    return u.gradeIndex >= GLOBAL_RANGE_FROM_INDEX ? Infinity : GRADE_RANGE[u.gradeIndex] * UNIT_BY_ID[u.job].rangeMult;
  }

  /** 컬렉션(영구) 레벨 */
  collectionLevel(job: Job): number { return this.opts.unitLevels[job] || 1; }

  unitDamage(u: Unit, mob: { race: Race; boss: boolean; kind?: MobKind; card?: number; markUntil?: number; speedMult?: number }): number {
    const level = this.unitLevel(u);
    let dmg = u.baseAtk * (1 + (level - 1) * ECONOMY.upgradePerLevel);
    dmg *= UNIT_BY_ID[u.job].atkMult * (1 + (this.collectionLevel(u.job) - 1) * UNIT_LEVEL_ATK);
    dmg *= DMG_MULT[u.job][mob.race];
    const def = mob.card !== undefined ? ATTACKS[mob.card] : null;
    if (def?.resist?.includes(u.job)) dmg *= RESIST_MULT; // 유령(물리)·방패병(화살)
    if (mob.markUntil && mob.markUntil > this.time) dmg *= SKILLS.hunter.markMult;
    if (u.gradeIndex >= SKILL_FROM_INDEX) {
      const high = u.gradeIndex >= FULL_RANGE_FROM_INDEX;
      if (u.job === 'knight' && (mob.kind === 'tank' || (def && ['shield', 'giant', 'king', 'demon', 'golem'].includes(def.key)))) {
        dmg *= high ? SKILLS.knight.armoredMultHigh : SKILLS.knight.armoredMult;
      } else if (u.job === 'houndmaster' && (mob.speedMult ?? 1) > 1.2) {
        dmg *= high ? SKILLS.houndmaster.fastMultHigh : SKILLS.houndmaster.fastMult;
      } else if (u.job === 'berserker') {
        dmg *= 1 + Math.min(SKILLS.berserker.cap, this.mobs.length * SKILLS.berserker.perMob);
      }
    }
    dmg *= this.angelMult;
    // 성기사: 보스와 큰 몹 카드(거인·킹·마왕) 특화
    if (u.job === 'paladin' && u.gradeIndex >= SKILL_FROM_INDEX && (mob.boss || (def && def.hpMult >= 5))) {
      const m = u.gradeIndex >= FULL_RANGE_FROM_INDEX ? SKILLS.paladin.bossMultHigh : SKILLS.paladin.bossMult;
      dmg *= 1 + (m - 1) * perkMult(this.collectionLevel(u.job));
    }
    dmg *= 1 + this.res('atk') * RESEARCH_PER.atk;
    dmg *= this.opts.atkMult;
    if (mob.boss) dmg *= 1 + this.res('boss') * RESEARCH_PER.boss;
    return dmg;
  }

  private addEffect(e: Effect): void {
    if (this.effects.length < MAX_EFFECTS) this.effects.push(e);
  }

  // ---------------- 메인 업데이트 ----------------
  update(dtReal: number): void {
    if (this.over || this.paused) return;
    const dt = dtReal * this.speed;
    this.time += dt;
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dtReal * 30);

    for (const l of this.log) l.ttl -= dtReal;
    this.log = this.log.filter((l) => l.ttl > 0);
    if (this.mythicBanner) {
      this.mythicBanner.ttl -= dtReal;
      if (this.mythicBanner.ttl <= 0) this.mythicBanner = null;
    }

    this.updateWaveState(dt);
    this.updatePending(dt);
    this.updateMobs(dt);
    this.updateUnitMovement(dt);
    this.updateCombat(dt);
    this.updateDots(dt);
    this.updateEffects(dt);

    if (this.mobs.length > this.peakMobs) this.peakMobs = this.mobs.length;
    if (this.mobs.length >= WAVE.gameOverMobCount) this.gameOver('몹이 100마리를 넘었습니다');
  }

  updateWaveState(dt: number): void {
    if (this.waveState === 'rest') {
      this.restTimer -= dt;
      if (this.restTimer <= 0) this.startNextWave();
      return;
    }
    if (this.waveState === 'spawning') {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0 && this.spawnedCount < this.spawnGoal) {
        this.spawnMob();
        this.spawnedCount += 1;
        this.spawnTimer = WAVE.spawnInterval;
      }
      if (this.spawnedCount >= this.spawnGoal) {
        if (this.isBossWave) {
          this.waveState = 'waiting_boss';
        } else {
          this.waveState = 'rest';
          this.restTimer = WAVE.restBetween;
        }
      }
      return;
    }
    if (this.waveState === 'waiting_boss') {
      this.bossTimer -= dt;
      const bossAlive = this.mobs.some((m) => m.boss);
      if (!bossAlive) {
        if (!this.opts.stageId) this.tryAchieve(`clear${this.wave}`);
        if (this.wave >= this.totalWaves) { this.win(); return; }
        this.waveState = 'rest';
        this.restTimer = WAVE.restBetween;
      } else if (this.bossTimer <= 0) {
        this.gameOver('보스 제한시간 초과');
      }
    }
  }

  updateMobs(dt: number): void {
    const speedPx = 50 * (WAVE.mobSpeed / 1.2);
    this.guards = this.mobs.filter((m) => m.card !== undefined && !m.dead && ATTACKS[m.card].guard);
    for (const m of this.mobs.slice()) {
      if (m.hitFlash > 0) m.hitFlash -= dt;
      if (m.slow > 0) m.slow -= dt;
      if (m.card !== undefined && !m.dead) this.cardAbility(m, dt);
      if (m.pause > 0) { m.pause -= dt; continue; }
      const target = PATH.corners[m.seg];
      const dx = target.x - m.x, dy = target.y - m.y;
      const dist = Math.hypot(dx, dy);
      // 이동 방향으로 스프라이트 방향 결정 (0=하 1=좌 2=우 3=상)
      if (Math.abs(dx) > Math.abs(dy)) m.dir = dx > 0 ? 2 : 1;
      else m.dir = dy > 0 ? 0 : 3;
      const rage = m.enraged ? ATTACKS[m.card!].enrage! : 1;
      const step = speedPx * m.speedMult * rage * (m.slow > 0 ? 1 - m.slowPct : 1) * dt;
      if (dist <= step) {
        m.x = target.x; m.y = target.y;
        m.seg = (m.seg + 1) % PATH.corners.length;
        m.pause = WAVE.cornerPause;
      } else {
        m.x += (dx / dist) * step;
        m.y += (dy / dist) * step;
      }
    }
  }

  /** 유닛 → 대상 방향 직선에서 대상 뒤 length 안, 폭 width 안의 몹 (가까운 순) */
  private lineTargets(u: Unit, target: Mob, length: number, width: number): Mob[] {
    const d = Math.hypot(target.x - u.x, target.y - u.y) || 1;
    const dx = (target.x - u.x) / d, dy = (target.y - u.y) / d;
    const out: { m: Mob; t: number }[] = [];
    for (const m of this.mobs) {
      if (m === target || m.dead) continue;
      const rx = m.x - u.x, ry = m.y - u.y;
      const t = rx * dx + ry * dy;
      if (t < d - 10 || t > d + length) continue;
      if (Math.abs(rx * dy - ry * dx) <= width) out.push({ m, t });
    }
    return out.sort((a, b) => a.t - b.t).map((o) => o.m);
  }
  /** 길을 거슬러 dist 만큼 뒤로 (지난 모서리를 넘지 않음) */
  private pushBack(m: Mob, dist: number): void {
    if (m.dead || m.boss) return;
    const c = PATH.corners;
    const prev = c[(m.seg - 1 + c.length) % c.length];
    const d = Math.hypot(prev.x - m.x, prev.y - m.y);
    const k = d > 0 ? Math.min(1, dist / d) : 0;
    m.x += (prev.x - m.x) * k;
    m.y += (prev.y - m.y) * k;
    m.pause = Math.max(m.pause, 0.15);
  }
  /** 주변 북치기 → 공격 간격 배수 (가장 센 북 하나) */
  private hasteFor(u: Unit): number {
    let best = 0;
    for (const d of this.drummers) {
      if (d === u || Math.hypot(d.x - u.x, d.y - u.y) > SKILLS.drummer.radius) continue;
      best = Math.max(best, d.gradeIndex >= FULL_RANGE_FROM_INDEX ? SKILLS.drummer.hasteHigh : SKILLS.drummer.haste);
    }
    return 1 - best;
  }
  /** 중독·불 장판 지속 피해 (막타 보상 없이 처치) */
  private updateDots(dt: number): void {
    const dot = (m: Mob, dmg: number) => {
      if (m.dead) return;
      m.hp -= dmg;
      if (m.hp <= 0) this.killMob(m);
    };
    for (const m of this.mobs) {
      if (m.poison && m.poison.until > this.time) dot(m, m.poison.dps * m.poison.stacks * dt);
    }
    if (this.burns.length) {
      this.burns = this.burns.filter((b) => b.until > this.time);
      for (const b of this.burns) for (const m of this.mobs) {
        if (Math.hypot(m.x - b.x, m.y - b.y) <= b.r) dot(m, b.dps * dt);
      }
    }
    if (this.mobs.some((m) => m.dead)) this.mobs = this.mobs.filter((m) => !m.dead);
  }

  /** 몹 카드 능력: 신관 회복, 킹 졸개 소환, 도적 은신, 오크 광폭, 마녀 점멸, 주술사 보호막 표시, 유령 번식 */
  private cardAbility(m: Mob, dt: number): void {
    const def = ATTACKS[m.card!];
    m.age = (m.age ?? 0) + dt;
    if (def.stealth) {
      const hide = m.age % 4 >= 4 - def.stealth;
      if (hide && !m.hidden) this.addEffect({ type: 'splash', x: m.x, y: m.y, ttl: 0.3, r: 26, color: '#6a4c93' });
      m.hidden = hide;
    }
    if (def.enrage && !m.enraged && m.hp < m.maxHp * 0.5) {
      m.enraged = true;
      this.addEffect({ type: 'splash', x: m.x, y: m.y, ttl: 0.4, r: 34, color: '#ff4a3a' });
    }
    if (def.blink) {
      m.blinkT = (m.blinkT ?? 3) - dt;
      if (m.blinkT <= 0) {
        m.blinkT = 3;
        this.addEffect({ type: 'splash', x: m.x, y: m.y, ttl: 0.35, r: 30, color: '#c9a2ff' });
        this.advance(m, def.blink);
        this.addEffect({ type: 'splash', x: m.x, y: m.y, ttl: 0.35, r: 30, color: '#c9a2ff' });
      }
    }
    if (def.breed && !m.bred && (m.gen ?? 0) < 2 && m.age >= 5) {
      m.bred = true;
      const c = this.spawnFrom(m, m.card!, m.maxHp * 0.7, 1, 0.9);
      c.gen = (m.gen ?? 0) + 1;
      this.addEffect({ type: 'splash', x: m.x, y: m.y, ttl: 0.4, r: 32, color: '#a8e86a' });
    }
    if (!def.heal && !def.spawn && !def.guard) return;
    m.tick = (m.tick ?? 0) + dt;
    if (def.guard && m.tick >= 1) {
      m.tick -= 1;
      this.addEffect({ type: 'splash', x: m.x, y: m.y, ttl: 0.5, r: GUARD_RADIUS, color: '#6fd3ff' });
    }
    if (def.heal && m.tick >= 1) {
      m.tick -= 1;
      for (const o of this.mobs) {
        if (o.dead || o.boss || o.hp >= o.maxHp || (o.purifyUntil ?? 0) > this.time || Math.hypot(o.x - m.x, o.y - m.y) > 130) continue;
        o.hp = Math.min(o.maxHp, o.hp + o.maxHp * def.heal);
      }
      this.addEffect({ type: 'splash', x: m.x, y: m.y, ttl: 0.4, r: 130, color: '#7ee87e' });
    }
    if (def.spawn && m.tick >= 4) {
      m.tick -= 4;
      for (let i = 0; i < def.spawn; i++) this.spawnFrom(m, 0, m.maxHp * 0.06, 1, 0.8);
    }
  }

  // 경로(사각 링) seg 번째 변에서 t(0~1) 위치의 좌표
  private pathPoint(seg: number, t: number): { x: number; y: number } {
    const c = PATH.corners;
    const a = c[seg % c.length], b = c[(seg + 1) % c.length];
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  }

  updateCombat(dt: number): void {
    // 오라: 천사(공격력)·북치기(공속) - 스킬은 정예 등급부터
    let angel = 0;
    this.drummers = [];
    for (const u of this.units) {
      if (u.gradeIndex < SKILL_FROM_INDEX) continue;
      const high = u.gradeIndex >= FULL_RANGE_FROM_INDEX;
      if (u.job === 'angel') angel += high ? SKILLS.angel.auraHigh : SKILLS.angel.aura;
      else if (u.job === 'drummer') this.drummers.push(u);
    }
    this.angelMult = 1 + Math.min(SKILLS.angel.cap, angel);
    for (const u of this.units) {
      if (u.flash > 0) u.flash -= dt;
      u.cooldown -= dt;
      if (u.cooldown > 0) continue;
      const range = this.unitRange(u);
      let best: Mob | null = null;
      let bestD = Infinity;
      for (const m of this.mobs) {
        if (m.dead || m.hidden) continue; // 숨은 도적은 직접 못 노림 (범위 공격엔 맞음)
        const d = Math.hypot(m.x - u.x, m.y - u.y);
        if (d <= range && d < bestD) { bestD = d; best = m; }
      }
      if (!best) continue;
      const crit = Math.random() < this.critChance(u);
      let dmg = this.unitDamage(u, best) * (crit ? SKILLS.critMult : 1);
      if (u.job === 'reaper' && u.souls) { dmg *= SKILLS.reaper.soulMult; u.souls -= 1; } // 영혼 소모
      u.cooldown = UNIT_BY_ID[u.job].cooldown * this.hasteFor(u);
      this.hitter = u;
      u.flash = 0.1;
      this.emit('shoot', u.job);
      // 투사체: 거리에 비례한 비행 시간 (시각 전용)
      const dur = Math.min(0.22, 0.06 + bestD / 2600);
      this.addEffect({
        type: 'proj', x1: u.x, y1: u.y - 8, x2: best.x, y2: best.y,
        job: u.job, grade: u.gradeIndex, ttl: dur, dur,
      });
      this.hit(best, dmg, crit);

      // 직업 스킬 (정예 이상)
      if (u.gradeIndex >= SKILL_FROM_INDEX) this.applySkill(u, best, range);
      this.hitter = null;

      // 태초 등급: 몹 이동 경로(사각 링) 전체에 촘촘히 폭발 이펙트 (시각 전용 - 데미지는 단일 대상 그대로)
      if (u.gradeIndex === GRADE_INDEX['eternal'] && this.effects.length < 160) {
        const c = PATH.corners;
        for (let seg = 0; seg < c.length; seg++) {
          const a = c[seg], b = c[(seg + 1) % c.length];
          const count = Math.max(1, Math.round(Math.hypot(b.x - a.x, b.y - a.y) / 48)); // ~48px 간격
          for (let k = 0; k < count; k++) {
            const t = Math.min(1, Math.max(0, (k + 0.5) / count + (Math.random() - 0.5) * 0.05));
            const p = this.pathPoint(seg, t);
            this.addEffect({ type: 'burst', x: p.x, y: p.y, ttl: 0.4, seed: Math.random() * Math.PI * 2 });
          }
        }
        this.shake = Math.max(this.shake, 2.5);
      }
    }
    if (this.mobs.some((m) => m.dead)) this.mobs = this.mobs.filter((m) => !m.dead);
  }

  // 단일 대상 피해 처리 + 데미지 숫자
  private hit(m: Mob, dmg: number, crit: boolean): void {
    if (m.dead) return;
    // 수호 주술사 근처의 다른 몹은 피해 감소 (가장 센 하나)
    for (const g of this.guards) {
      if (g !== m && !g.dead && Math.hypot(g.x - m.x, g.y - m.y) <= GUARD_RADIUS) { dmg *= 1 - ATTACKS[g.card!].guard!; break; }
    }
    m.hp -= dmg;
    m.hitFlash = 0.12;
    // 데미지 숫자 (너무 많으면 생략해 성능/난잡함 방지)
    if (this.effects.length < 90 || crit) {
      this.addEffect({ type: 'dmg', x: m.x + (Math.random() - 0.5) * 14, y: m.y - m.size / 2, ttl: 0.7, value: Math.round(dmg), crit });
    }
    if (m.hp <= 0) this.killMob(m);
  }

  private critChance(u: Unit): number {
    if (u.job === 'ranger' && u.gradeIndex >= SKILL_FROM_INDEX) {
      const c = u.gradeIndex >= FULL_RANGE_FROM_INDEX ? SKILLS.ranger.critChanceHigh : SKILLS.ranger.critChance;
      return Math.min(0.8, c * perkMult(this.collectionLevel(u.job)));
    }
    return SKILLS.critChance;
  }

  // 범위 피해 (대상 제외)
  private splashAround(u: Unit, target: Mob, r: number, ratio: number): void {
    for (const m of this.mobs) {
      if (m === target || m.dead) continue;
      if (Math.hypot(m.x - target.x, m.y - target.y) <= r) this.hit(m, this.unitDamage(u, m) * ratio, false);
    }
  }

  private slowMob(m: Mob, pct: number, dur: number): void {
    if (m.dead) return;
    m.slowPct = m.slow > 0 ? Math.max(m.slowPct, pct) : pct;
    m.slow = Math.max(m.slow, dur);
  }

  private applySkill(u: Unit, target: Mob, range: number): void {
    const high = u.gradeIndex >= FULL_RANGE_FROM_INDEX; // 전설 이상 강화
    const perk = perkMult(this.collectionLevel(u.job));  // 컬렉션 Lv5/10 퍽
    switch (u.job) {
      case 'archer': {
        const n = (high ? SKILLS.archer.extraTargetsHigh : SKILLS.archer.extraTargets) + (perk > 1.5 ? 1 : 0);
        const others = this.mobs
          .filter((m) => m !== target && !m.dead && !m.hidden && Math.hypot(m.x - u.x, m.y - u.y) <= range)
          .sort((a, b) => Math.hypot(a.x - target.x, a.y - target.y) - Math.hypot(b.x - target.x, b.y - target.y))
          .slice(0, n);
        for (const m of others) {
          const dur = 0.12;
          this.addEffect({ type: 'proj', x1: u.x, y1: u.y - 8, x2: m.x, y2: m.y, job: u.job, grade: u.gradeIndex, ttl: dur, dur });
          this.hit(m, this.unitDamage(u, m) * SKILLS.archer.ratio * perk, false);
        }
        break;
      }
      case 'wizard': {
        const r = high ? SKILLS.wizard.radiusHigh : SKILLS.wizard.radius;
        this.addEffect({ type: 'splash', x: target.x, y: target.y, ttl: 0.35, r, color: '#b48cff' });
        this.splashAround(u, target, r, SKILLS.wizard.ratio * perk);
        break;
      }
      case 'bomber': {
        const r = high ? SKILLS.bomber.radiusHigh : SKILLS.bomber.radius;
        this.addEffect({ type: 'splash', x: target.x, y: target.y, ttl: 0.45, r, color: '#ff7a3d' });
        this.splashAround(u, target, r, SKILLS.bomber.ratio * perk);
        this.shake = Math.max(this.shake, 1.5);
        break;
      }
      case 'frost': {
        const r = high ? SKILLS.frost.radiusHigh : SKILLS.frost.radius;
        const pct = Math.min(0.7, (high ? SKILLS.frost.slowPctHigh : SKILLS.frost.slowPct) * (1 + (perk - 1) * 0.5));
        this.addEffect({ type: 'splash', x: target.x, y: target.y, ttl: 0.4, r, color: '#7fe0ff' });
        for (const m of this.mobs) {
          if (Math.hypot(m.x - target.x, m.y - target.y) <= r) this.slowMob(m, pct, SKILLS.frost.dur);
        }
        break;
      }
      case 'warrior': {
        const pct = Math.min(0.7, (high ? SKILLS.warrior.slowPctHigh : SKILLS.warrior.slowPct) * (1 + (perk - 1) * 0.5));
        this.slowMob(target, pct, SKILLS.warrior.dur);
        this.addEffect({ type: 'slash', x: target.x, y: target.y, ttl: 0.25, seed: Math.random() * Math.PI });
        break;
      }
      case 'assassin': {
        const th = (high ? SKILLS.assassin.executeHigh : SKILLS.assassin.execute) * perk;
        if (!target.dead && !target.boss && target.hp / target.maxHp <= th) {
          this.addEffect({ type: 'slash', x: target.x, y: target.y, ttl: 0.3, seed: Math.random() * Math.PI });
          this.hit(target, target.hp + 1, true);
        }
        break;
      }
      case 'spearman': {
        const n = high ? SKILLS.spearman.pierceHigh : SKILLS.spearman.pierce;
        const hits = this.lineTargets(u, target, 140, 26).slice(0, n);
        this.addEffect({ type: 'beam', x1: u.x, y1: u.y, x2: target.x + (target.x - u.x) * 0.3, y2: target.y + (target.y - u.y) * 0.3, ttl: 0.15, dur: 0.15, color: '#e8d0a0', w: 5 });
        for (const m of hits) this.hit(m, this.unitDamage(u, m) * SKILLS.spearman.ratio * perk, false);
        break;
      }
      case 'crossbow':
      case 'dragoon': {
        const sk = u.job === 'crossbow' ? SKILLS.crossbow : SKILLS.dragoon;
        const ratio = (high ? sk.ratioHigh : sk.ratio) * perk;
        const hits = this.lineTargets(u, target, sk.length, sk.width);
        const d = Math.hypot(target.x - u.x, target.y - u.y) || 1;
        const ex = u.x + ((target.x - u.x) / d) * (d + sk.length), ey = u.y + ((target.y - u.y) / d) * (d + sk.length);
        this.addEffect({ type: 'beam', x1: u.x, y1: u.y, x2: ex, y2: ey, ttl: 0.25, dur: 0.25, color: u.job === 'dragoon' ? '#ff6a2a' : '#d8c8a0', w: u.job === 'dragoon' ? 22 : 4 });
        for (const m of hits) this.hit(m, this.unitDamage(u, m) * ratio, false);
        break;
      }
      case 'slinger':
        this.pushBack(target, (high ? SKILLS.slinger.pushHigh : SKILLS.slinger.push) * perk);
        break;
      case 'monk': {
        const n = (high ? SKILLS.monk.hitsHigh : SKILLS.monk.hits) - 1;
        for (let i = 0; i < n && !target.dead; i++) this.hit(target, this.unitDamage(u, target) * SKILLS.monk.ratio * perk, false);
        this.addEffect({ type: 'slash', x: target.x, y: target.y, ttl: 0.2, seed: Math.random() * Math.PI });
        break;
      }
      case 'hunter':
        target.markUntil = this.time + (high ? SKILLS.hunter.markDurHigh : SKILLS.hunter.markDur) * perk;
        break;
      case 'acolyte':
      case 'cleric': {
        if (u.job === 'cleric') target.purifyUntil = this.time + (high ? SKILLS.cleric.purifyDurHigh : SKILLS.cleric.purifyDur) * perk;
        if (u.job === 'acolyte') {
          const r = high ? SKILLS.acolyte.radiusHigh : SKILLS.acolyte.radius;
          this.addEffect({ type: 'splash', x: target.x, y: target.y, ttl: 0.35, r, color: '#fff2a8' });
          for (const m of this.mobs) {
            if (m === target || m.dead || m.race !== 'undead' || Math.hypot(m.x - target.x, m.y - target.y) > r) continue;
            this.hit(m, this.unitDamage(u, m) * SKILLS.acolyte.ratio * perk, false);
          }
        } else this.addEffect({ type: 'splash', x: target.x, y: target.y, ttl: 0.35, r: 34, color: '#fff0c0' });
        break;
      }
      case 'poisoner': {
        const dps = this.unitDamage(u, target) * (high ? SKILLS.poisoner.dpsHigh : SKILLS.poisoner.dps) * perk;
        const p = target.poison;
        const stacks = Math.min(SKILLS.poisoner.maxStack, (p && p.until > this.time ? p.stacks : 0) + 1);
        target.poison = { dps: Math.max(dps, p && p.until > this.time ? p.dps : 0), until: this.time + SKILLS.poisoner.dur, stacks };
        this.addEffect({ type: 'splash', x: target.x, y: target.y, ttl: 0.3, r: 26, color: '#7ac943' });
        break;
      }
      case 'storm': {
        let from = target;
        const done = new Set<Mob>([target]);
        const n = high ? SKILLS.storm.bouncesHigh : SKILLS.storm.bounces;
        for (let i = 0; i < n; i++) {
          let next: Mob | null = null, nd: number = SKILLS.storm.range;
          for (const m of this.mobs) {
            if (m.dead || done.has(m)) continue;
            const d = Math.hypot(m.x - from.x, m.y - from.y);
            if (d < nd) { nd = d; next = m; }
          }
          if (!next) break;
          done.add(next);
          this.addEffect({ type: 'beam', x1: from.x, y1: from.y, x2: next.x, y2: next.y, ttl: 0.2, dur: 0.2, color: '#a8d0ff', w: 3 });
          this.hit(next, this.unitDamage(u, next) * SKILLS.storm.ratio * perk, false);
          from = next;
        }
        break;
      }
      case 'pyro': {
        const r = high ? SKILLS.pyro.radiusHigh : SKILLS.pyro.radius;
        if (this.burns.length < 24) this.burns.push({ x: target.x, y: target.y, r, dps: this.unitDamage(u, target) * SKILLS.pyro.dps * perk, until: this.time + SKILLS.pyro.dur });
        break;
      }
      case 'cannoneer': {
        target.pause = Math.max(target.pause, (high ? SKILLS.cannoneer.stunHigh : SKILLS.cannoneer.stun) * perk);
        this.addEffect({ type: 'splash', x: target.x, y: target.y, ttl: 0.4, r: SKILLS.cannoneer.radius, color: '#c8c8c8' });
        this.splashAround(u, target, SKILLS.cannoneer.radius, SKILLS.cannoneer.ratio * perk);
        this.shake = Math.max(this.shake, 2);
        break;
      }
      case 'chrono': {
        const r = high ? SKILLS.chrono.radiusHigh : SKILLS.chrono.radius;
        const stop = (high ? SKILLS.chrono.stopHigh : SKILLS.chrono.stop) * perk;
        this.addEffect({ type: 'splash', x: target.x, y: target.y, ttl: 0.5, r, color: '#c0a0ff' });
        for (const m of this.mobs) if (!m.boss && Math.hypot(m.x - target.x, m.y - target.y) <= r) m.pause = Math.max(m.pause, stop);
        break;
      }
      case 'archmage': {
        const r = high ? SKILLS.archmage.radiusHigh : SKILLS.archmage.radius;
        this.addEffect({ type: 'splash', x: target.x, y: target.y, ttl: 0.5, r, color: '#ff7ad8' });
        this.splashAround(u, target, r, SKILLS.archmage.ratio * perk);
        this.shake = Math.max(this.shake, 2.5);
        break;
      }
      case 'shadow': {
        const other = this.mobs.find((m) => m !== target && !m.dead && Math.hypot(m.x - u.x, m.y - u.y) <= range) ?? (target.dead ? null : target);
        if (other) {
          this.addEffect({ type: 'slash', x: other.x, y: other.y, ttl: 0.25, seed: Math.random() * Math.PI });
          this.hit(other, this.unitDamage(u, other) * (high ? SKILLS.shadow.cloneRatioHigh : SKILLS.shadow.cloneRatio) * perk, false);
        }
        break;
      }
      case 'stormking': {
        const n = high ? SKILLS.stormking.strikesHigh : SKILLS.stormking.strikes;
        const alive = this.mobs.filter((m) => !m.dead);
        for (let i = 0; i < n && alive.length; i++) {
          const m = alive[Math.floor(Math.random() * alive.length)];
          this.addEffect({ type: 'beam', x1: m.x + (Math.random() - 0.5) * 30, y1: m.y - 140, x2: m.x, y2: m.y, ttl: 0.2, dur: 0.2, color: '#a8d8ff', w: 4 });
          this.hit(m, this.unitDamage(u, m) * SKILLS.stormking.ratio * perk, false);
        }
        break;
      }
      default:
        // ranger(치명타)·paladin(보스 피해)은 critChance/unitDamage 에서 처리
        if (u.job === 'paladin' || u.job === 'ranger') {
          this.addEffect({ type: 'slash', x: target.x, y: target.y, ttl: 0.2, seed: Math.random() * Math.PI });
        }
    }
  }

  killMob(m: Mob): void {
    if (m.dead) return;
    const def = m.card !== undefined ? ATTACKS[m.card] : null;
    const by = this.hitter;
    const bySkill = !!by && by.gradeIndex >= SKILL_FROM_INDEX;
    if (bySkill && by!.job === 'reaper') {
      m.noRevive = true;
      by!.souls = Math.min(SKILLS.reaper.maxSouls, (by!.souls ?? 0) + 1);
    }
    // 망령: 한 번 되살아남 (사신·정화로 막을 수 있음)
    if (def?.revive && m.gold === undefined && !m.noRevive && !((m.purifyUntil ?? 0) > this.time)) {
      m.gold = ECONOMY.killGold;
      m.hp = m.maxHp * 0.5;
      m.pause = 0.6;
      this.addEffect({ type: 'splash', x: m.x, y: m.y, ttl: 0.4, r: 40, color: '#c9a2ff' });
      return;
    }
    m.dead = true; // 배열 제거는 전투 루프 끝에서 일괄 처리
    // 분열 알: 작은 몹으로 갈라짐 (분열된 몹은 다시 갈라지지 않음)
    if (def?.split && m.gold === undefined) {
      for (let i = 0; i < def.split; i++) this.spawnFrom(m, m.card!, m.maxHp * 0.25, 1, 0.6);
    }
    const goldMult = 1 + this.res('goldGain') * RESEARCH_PER.goldGain;
    let base = m.boss ? ECONOMY.bossGold : m.gold ?? def?.gold ?? ECONOMY.killGold;
    if (bySkill && by!.job === 'merchant') base += by!.gradeIndex >= FULL_RANGE_FROM_INDEX ? SKILLS.merchant.goldHigh : SKILLS.merchant.gold;
    const gained = Math.round(base * goldMult);
    this.gold += gained;
    this.kills += 1;
    this.progress('kills');
    this.addEffect({ type: 'pop', x: m.x, y: m.y, ttl: m.boss ? 0.8 : 0.45, boss: m.boss, seed: Math.random() * 6.28 });
    if (m.boss || this.effects.length < 140) {
      this.addEffect({ type: 'gold', x: m.x, y: m.y - 10, ttl: 0.8, value: gained });
    }
    if (m.boss) this.shake = Math.max(this.shake, 14);
    this.emit('kill', m.boss);
  }

  updateEffects(dt: number): void {
    for (const e of this.effects) e.ttl -= dt;
    this.effects = this.effects.filter((e) => e.ttl > 0);
  }

  // ---------------- 종료 ----------------
  gameOver(reason: string): void {
    if (this.over) return;
    this.over = true;
    this.cleared = false;
    this.finish(reason);
  }
  win(): void {
    if (this.over) return;
    this.over = true;
    this.cleared = true;
    if (!this.opts.stageId) this.tryAchieve('clear50');
    this.finish(this.opts.stageId ? `스테이지 ${this.opts.stageId} 클리어!` : '50 웨이브 클리어!');
  }
  revived = false;
  /** 부활 (보상형 광고): 일반 몹 정리 + 보스 시간 연장. 판당 1회 */
  canRevive(): boolean {
    return this.over && !this.cleared && !this.isPvp && !this.revived;
  }
  revive(): boolean {
    if (!this.canRevive()) return false;
    this.revived = true;
    this.over = false;
    for (const m of this.mobs) if (!m.boss) this.addEffect({ type: 'pop', x: m.x, y: m.y, ttl: 0.45, boss: false, seed: Math.random() * 6.28 });
    this.mobs = this.mobs.filter((m) => m.boss);
    if (this.waveState === 'waiting_boss') this.bossTimer = Math.max(this.bossTimer, 45);
    this.shake = 12;
    this.pushLog('부활! 필드가 정리되었습니다');
    return true;
  }

  /** PvP 결과 확정 (상대 패배/이탈 시 승리, 서버 판정 등) */
  pvpEnd(won: boolean, reason: string): void {
    if (this.over) return;
    this.over = true;
    this.cleared = won;
    this.emit('gameover', { wave: this.wave, reason, cleared: won, pvp: { won }, peakMobs: this.peakMobs });
  }
  finish(reason: string): void {
    const d: GameOverData = { wave: this.wave, reason, cleared: this.cleared, peakMobs: this.peakMobs };
    if (this.isPvp) d.pvp = { won: false }; // PvP 에서 내 필드가 무너지면 패배
    this.emit('gameover', d);
  }

  // ---------------- UI 조회 헬퍼 ----------------
  // 직업+등급별 (판매 패널용)
  getStacks(): Stack[] {
    const map = new Map<string, Stack>();
    for (const u of this.units) {
      const key = `${u.job}_${u.grade}`;
      let s = map.get(key);
      if (!s) {
        s = { job: u.job, grade: u.grade, gradeIndex: u.gradeIndex, count: 0,
          level: this.levels[u.job] || 1, key };
        map.set(key, s);
      }
      s.count += 1;
    }
    return [...map.values()].sort((a, b) =>
      b.gradeIndex - a.gradeIndex || a.job.localeCompare(b.job));
  }

  // 직업별 (하단 강화 패널용) - 강화가 직업 단위이므로
  getJobStacks(): JobStack[] {
    const map = new Map<Job, JobStack>();
    for (const u of this.units) {
      let s = map.get(u.job);
      if (!s) {
        s = { job: u.job, count: 0, level: this.levels[u.job] || 1,
          topGrade: u.grade, topGradeIndex: u.gradeIndex };
        map.set(u.job, s);
      }
      s.count += 1;
      if (u.gradeIndex > s.topGradeIndex) { s.topGradeIndex = u.gradeIndex; s.topGrade = u.grade; }
    }
    return [...map.values()].sort((a, b) => a.job.localeCompare(b.job));
  }
}
