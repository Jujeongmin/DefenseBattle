// ============================================================
//  게임 엔진 - 맵/경로/웨이브/전투/경제 로직
//  (렌더링/DOM 은 여기서 다루지 않음)
// ============================================================
import {
  ECONOMY, WAVE, GRADE_BY_KEY, GRADE_INDEX, GRADE_RANGE,
  DMG_MULT, RACES, JOB_KR, FULL_RANGE_FROM_INDEX, RESEARCH_PER,
  rollGrade, rollJob,
} from './config';
import {
  meta, researchLevel, addDailyProgress, setDailyBestWave, unlockAchievement,
} from './meta';
import type {
  Job, Race, GradeKey, Unit, Mob, Zone, Effect, LogEntry, Banner, Stack, JobStack,
  WaveState, GameOverData, AchievementDef, DragState,
} from './types';

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

// 이벤트 페이로드 타입
interface EventMap {
  wave: number;
  roster: void;
  achievement: AchievementDef;
  gameover: GameOverData;
  shoot: void;         // 유닛이 공격 발동
  kill: boolean;       // 몹 처치 (보스면 true)
  bossSpawn: void;     // 보스 등장
}
type EventName = keyof EventMap;
type Listener<K extends EventName> = (data: EventMap[K]) => void;

export class Game {
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
  private _listeners: { [K in EventName]?: Listener<K>[] } = {};

  constructor() {
    this.reset();
  }

  reset(): void {
    this.gold = ECONOMY.startGold + researchLevel('startGold') * RESEARCH_PER.startGold;
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
    if (this.wave > WAVE.total) { this.win(); return; }
    this.currentRace = RACES[Math.floor(Math.random() * RACES.length)];
    this.isBossWave = this.wave % WAVE.bossEvery === 0;
    this.spawnedCount = 0;
    this.spawnTimer = 0;
    this.waveState = 'spawning';
    this.spawnGoal = this.isBossWave ? 1 : WAVE.mobsPerWave;
    if (this.isBossWave) this.bossTimer = WAVE.bossTimeLimit;
    setDailyBestWave(this.wave);
    if (this.wave > meta.bestWave) meta.bestWave = this.wave;
    this.emit('wave', this.wave);
  }

  waveHp(): number {
    const base = WAVE.hpBase * Math.pow(1 + WAVE.hpGrowthPerWave, this.wave - 1);
    return this.isBossWave ? base * WAVE.bossHpMult : base;
  }

  spawnMob(): void {
    const hp = this.waveHp();
    const boss = this.isBossWave;
    this.mobs.push({
      id: nextId++,
      race: this.currentRace,
      x: PATH.corners[0].x,
      y: PATH.corners[0].y,
      seg: 0,
      pause: 0,
      hp, maxHp: hp,
      boss,
      size: boss ? 44 * WAVE.bossSizeMult : 44, // 기존 대비 2배
      dead: false,
      hitFlash: 0,
      dir: 0,
    });
    if (boss) this.emit('bossSpawn', undefined);
  }

  // ---------------- 소환 / 강화 / 판매 ----------------
  summon(): Unit | null {
    if (this.gold < ECONOMY.summonCost || this.over) return null;
    this.gold -= ECONOMY.summonCost;
    this.summons += 1;
    addDailyProgress('summons', 1);

    const rareBonus = researchLevel('rare') * RESEARCH_PER.rare;
    const gradeKey = rollGrade(rareBonus);
    const job = rollJob();
    return this.createUnit(job, gradeKey);
  }

  // 디버그/테스트 전용: 직업은 랜덤이되 등급을 지정해 무료로 소환.
  // 실제 UI는 개발 모드(import.meta.env.DEV)에서만 노출한다.
  summonDebug(gradeKey: GradeKey): Unit | null {
    if (this.over) return null;
    return this.createUnit(rollJob(), gradeKey);
  }

  // 소환 확정 로직 (직업/등급이 정해진 뒤 공통으로 처리)
  private createUnit(job: Job, gradeKey: GradeKey): Unit {
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
    const text = `${rate}% ${JOB_KR[job]} ${grade.kr}등급 소환`;
    if (gIdx >= GRADE_INDEX['mythic']) {
      this.mythicBanner = { text: `✨ ${JOB_KR[job]} ${grade.kr} 등급 소환! ✨`, ttl: 4 };
    } else {
      this.pushLog(text);
    }

    if (gradeKey === 'legendary') this.tryAchieve('firstLegendary');
    if (gradeKey === 'mythic') this.tryAchieve('firstMythic');
    if (gradeKey === 'eternal') this.tryAchieve('firstEternal');

    this.emit('roster', undefined);
    return unit;
  }

  pushLog(text: string): void {
    this.log.unshift({ text, ttl: 10 });
    if (this.log.length > 6) this.log.pop();
  }

  tryAchieve(key: string): void {
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
    addDailyProgress('sells', 1);
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

  unitRange(u: { gradeIndex: number }): number {
    return u.gradeIndex >= FULL_RANGE_FROM_INDEX ? Infinity : GRADE_RANGE[u.gradeIndex];
  }

  unitDamage(u: Unit, mob: { race: Race; boss: boolean }): number {
    const level = this.unitLevel(u);
    let dmg = u.baseAtk * (1 + (level - 1) * ECONOMY.upgradePerLevel);
    dmg *= DMG_MULT[u.job][mob.race];
    dmg *= 1 + researchLevel('atk') * RESEARCH_PER.atk;
    if (mob.boss) dmg *= 1 + researchLevel('boss') * RESEARCH_PER.boss;
    return dmg;
  }

  // ---------------- 메인 업데이트 ----------------
  update(dtReal: number): void {
    if (this.over || this.paused) return;
    const dt = dtReal * this.speed;

    for (const l of this.log) l.ttl -= dtReal;
    this.log = this.log.filter((l) => l.ttl > 0);
    if (this.mythicBanner) {
      this.mythicBanner.ttl -= dtReal;
      if (this.mythicBanner.ttl <= 0) this.mythicBanner = null;
    }

    this.updateWaveState(dt);
    this.updateMobs(dt);
    this.updateUnitMovement(dt);
    this.updateCombat(dt);
    this.updateEffects(dt);

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
        this.tryAchieve(`clear${this.wave}`);
        if (this.wave >= WAVE.total) { this.win(); return; }
        this.waveState = 'rest';
        this.restTimer = WAVE.restBetween;
      } else if (this.bossTimer <= 0) {
        this.gameOver('보스 제한시간 초과');
      }
    }
  }

  updateMobs(dt: number): void {
    const speedPx = 50 * (WAVE.mobSpeed / 1.2);
    for (const m of this.mobs) {
      if (m.hitFlash > 0) m.hitFlash -= dt;
      if (m.pause > 0) { m.pause -= dt; continue; }
      const target = PATH.corners[m.seg];
      const dx = target.x - m.x, dy = target.y - m.y;
      const dist = Math.hypot(dx, dy);
      // 이동 방향으로 스프라이트 방향 결정 (0=하 1=좌 2=우 3=상)
      if (Math.abs(dx) > Math.abs(dy)) m.dir = dx > 0 ? 2 : 1;
      else m.dir = dy > 0 ? 0 : 3;
      const step = speedPx * dt;
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

  // 경로(사각 링) seg 번째 변에서 t(0~1) 위치의 좌표
  private pathPoint(seg: number, t: number): { x: number; y: number } {
    const c = PATH.corners;
    const a = c[seg % c.length], b = c[(seg + 1) % c.length];
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  }

  updateCombat(dt: number): void {
    for (const u of this.units) {
      if (u.flash > 0) u.flash -= dt;
      u.cooldown -= dt;
      if (u.cooldown > 0) continue;
      const range = this.unitRange(u);
      let best: Mob | null = null;
      let bestD = Infinity;
      for (const m of this.mobs) {
        const d = Math.hypot(m.x - u.x, m.y - u.y);
        if (d <= range && d < bestD) { bestD = d; best = m; }
      }
      if (!best) continue;
      const dmg = this.unitDamage(u, best);
      best.hp -= dmg;
      best.hitFlash = 0.12;
      u.cooldown = 1.0;
      u.flash = 0.1;
      this.emit('shoot', undefined);
      this.effects.push({
        type: 'shot', x1: u.x, y1: u.y, x2: best.x, y2: best.y,
        job: u.job, ttl: 0.15,
      });
      // 데미지 숫자 (너무 많으면 생략해 성능/난잡함 방지)
      if (this.effects.length < 60) {
        this.effects.push({ type: 'dmg', x: best.x, y: best.y - best.size / 2, ttl: 0.6, value: Math.round(dmg) });
      }
      // 태초 등급: 몹 이동 경로(사각 링) 전체에 촘촘히 폭발 이펙트 (시각 전용 - 데미지는 단일 대상 그대로)
      if (u.gradeIndex === GRADE_INDEX['eternal'] && this.effects.length < 160) {
        const c = PATH.corners;
        for (let seg = 0; seg < c.length; seg++) {
          const a = c[seg], b = c[(seg + 1) % c.length];
          const count = Math.max(1, Math.round(Math.hypot(b.x - a.x, b.y - a.y) / 48)); // ~48px 간격
          for (let k = 0; k < count; k++) {
            const t = Math.min(1, Math.max(0, (k + 0.5) / count + (Math.random() - 0.5) * 0.05));
            const p = this.pathPoint(seg, t);
            this.effects.push({ type: 'burst', x: p.x, y: p.y, ttl: 0.4, seed: Math.random() * Math.PI * 2 });
          }
        }
      }
      if (best.hp <= 0 && !best.dead) this.killMob(best);
    }
  }

  killMob(m: Mob): void {
    m.dead = true;
    const goldMult = 1 + researchLevel('goldGain') * RESEARCH_PER.goldGain;
    const gained = m.boss
      ? Math.round(ECONOMY.bossGold * goldMult)
      : Math.round(ECONOMY.killGold * goldMult);
    this.gold += gained;
    this.kills += 1;
    addDailyProgress('kills', 1);
    this.effects.push({ type: 'pop', x: m.x, y: m.y, ttl: 0.4, boss: m.boss });
    this.emit('kill', m.boss);
    this.mobs = this.mobs.filter((x) => x !== m);
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
    this.tryAchieve('clear50');
    this.finish('50 웨이브 클리어!');
  }
  finish(reason: string): void {
    this.emit('gameover', { wave: this.wave, reason, cleared: this.cleared });
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
