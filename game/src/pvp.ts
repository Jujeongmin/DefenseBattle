// ============================================================
//  PvP 세션 - 실시간 1:1 (Verse8 게임서버) / AI 연습 상대(봇)
//  두 구현이 같은 인터페이스를 가져 UI/게임 흐름은 상대 종류를 신경 쓰지 않는다.
// ============================================================
import { Game, type BoardSnapshot } from './engine';
import { PVP, JOBS, PLAY_SPEED, STARTER_UNITS, TROPHY_ROAD, DECK_SIZE, ATTACKS, STARTER_ATTACKS, ATTACK_DECK_SIZE, UNIT_BY_ID, type AttackKey } from './config';
import { aiStep, thinkInterval } from './ai';
import { meta } from './meta';
import { unitLevels } from './progress';
import { isOnlineEnv } from './platform';
import type { AttackPayload, Job, Rarity } from './types';
import type { PvpReward } from './econ';

export interface MatchInfo {
  roomId: string;
  seed: number;
  opponent: { account?: string; nick: string; trophies: number };
  bot: boolean;
}

export interface PvpResult {
  won: boolean;
  reason: 'defeat' | 'leave' | 'cancel';
  trophyDelta: number;
  trophies: number;
  /** 서버가 준 보상과 바뀐 경제 상태 (온라인). 오프라인 봇전은 없음 → 기기 규칙으로 */
  reward?: PvpReward & { econ?: Record<string, unknown> };
}

export interface PvpHandlers {
  onStart(startAt: number): void;              // Date.now() 기준 시작 시각
  onSnapshot(s: BoardSnapshot): void;
  onAttack(p: AttackPayload): void;
  onResult(r: PvpResult): void;
}

export interface PvpSession {
  readonly match: MatchInfo;
  ready(h: PvpHandlers): Promise<void>;
  sendSnapshot(s: BoardSnapshot): void;
  sendAttack(p: AttackPayload): void;
  reportDefeat(): void;
  leave(): void;
}

export class MatchTimeout extends Error {
  constructor() { super('match timeout'); }
}

export function onlineAvailable(): boolean {
  return isOnlineEnv();
}

// ---------------------------------------------------------------
//  온라인 매칭 (서버 pvpQueue → pvpMatch 메시지/폴링)
// ---------------------------------------------------------------
export async function findOnlineMatch(onStatus: (sec: number) => void, signal: { cancelled: boolean }, maxWait: number = PVP.matchTimeout): Promise<PvpSession> {
  const net = await import('./net/server');
  const server = await net.getServer();
  type Q = { status: 'waiting' | 'idle' } | { status: 'matched'; match: Omit<MatchInfo, 'bot'> };
  let found: Omit<MatchInfo, 'bot'> | null = null;
  const off = server.onGlobalMessage('pvpMatch', (m: Omit<MatchInfo, 'bot'>) => { found = m; });
  try {
    const first = await net.callGlobal<Q>('pvpQueue', { nick: meta.nick });
    if (first.status === 'matched') found = first.match;
    const t0 = Date.now();
    while (!found) {
      if (signal.cancelled) { await net.callGlobal('pvpCancel'); throw new Error('cancelled'); }
      const sec = (Date.now() - t0) / 1000;
      onStatus(sec);
      if (sec > maxWait) { await net.callGlobal('pvpCancel'); throw new MatchTimeout(); }
      await new Promise((r) => setTimeout(r, 2000));
      if (found) break;
      const p = await net.callGlobal<Q>('pvpPoll');
      if (p.status === 'matched') found = p.match;
      else if (p.status === 'idle') {
        // 대기열 만료 시 재등록
        const again = await net.callGlobal<Q>('pvpQueue', { nick: meta.nick });
        if (again.status === 'matched') found = again.match;
      }
    }
  } finally {
    off();
  }
  return new OnlineSession({ ...(found as Omit<MatchInfo, 'bot'>), bot: false });
}

class OnlineSession implements PvpSession {
  private offs: (() => void)[] = [];
  private started = false;
  private finished = false;
  private me = '';
  constructor(readonly match: MatchInfo) {}

  async ready(h: PvpHandlers): Promise<void> {
    const net = await import('./net/server');
    const server = await net.getServer();
    this.me = server.account;
    const roomId = this.match.roomId;
    await server.joinRoom(roomId);
    const start = (startAt: number) => {
      if (this.started) return;
      this.started = true;
      h.onStart(startAt);
    };
    this.offs.push(
      server.onRoomMessage(roomId, 'pvpStart', (m: { startAt: number }) => start(m.startAt)),
      server.onRoomMessage(roomId, 'pvpSnap', (m: { account: string; snap: BoardSnapshot }) => {
        if (m.account !== this.me) h.onSnapshot(m.snap);
      }),
      server.onRoomMessage(roomId, 'pvpAttack', (m: { from: string; payload: AttackPayload }) => {
        if (m.from !== this.me) h.onAttack(m.payload);
      }),
      server.onRoomMessage(roomId, 'pvpResult', (r: { winner: string; reason: 'defeat' | 'leave'; delta: Record<string, number>; trophies: Record<string, number>; rewards?: Record<string, PvpResult['reward']> }) => {
        if (this.finished) return;
        this.finished = true;
        h.onResult({ won: r.winner === this.me, reason: r.reason, trophyDelta: r.delta[this.me] ?? 0, trophies: r.trophies[this.me] ?? meta.pvp.trophies, reward: r.rewards?.[this.me] });
      }),
      server.onRoomMessage(roomId, 'pvpCancel', () => {
        if (this.finished) return;
        this.finished = true;
        h.onResult({ won: false, reason: 'cancel', trophyDelta: 0, trophies: meta.pvp.trophies });
      }),
    );
    const st = await net.callRoom<{ status?: string; startAt?: number }>('pvpReady', { nick: meta.nick, seed: this.match.seed });
    if (st.status === 'playing' && st.startAt) start(st.startAt);
  }

  sendSnapshot(s: BoardSnapshot): void {
    void import('./net/server').then((net) => net.sendRoom('pvpSnap', [s], PVP.reportInterval * 1000));
  }
  sendAttack(p: AttackPayload): void {
    void import('./net/server').then((net) => net.callRoom('pvpAttack', p).catch(() => {}));
  }
  reportDefeat(): void {
    void import('./net/server').then((net) => net.callRoom('pvpDefeat').catch(() => {}));
  }
  leave(): void {
    this.offs.forEach((f) => f());
    this.offs = [];
    void import('./net/server').then(async (net) => (await net.getServer()).leaveRoom());
  }
}

// ---------------------------------------------------------------
//  매칭: 온라인이면 실제 상대를 잠깐 찾고, 없으면(또는 오프라인이면) 봇이 상대가 된다.
//  봇은 실제 유저처럼 보인다 (Voodoo v1: 라이브 매칭 대신 봇이 PvP 경험을 대신).
// ---------------------------------------------------------------
const BOT_FALLBACK_SEC = 8;
export async function findMatch(onStatus: (sec: number) => void, signal: { cancelled: boolean }): Promise<PvpSession> {
  if (onlineAvailable()) {
    try {
      return await findOnlineMatch(onStatus, signal, BOT_FALLBACK_SEC);
    } catch (e) {
      if (!(e instanceof MatchTimeout)) console.warn('[pvp] 온라인 매칭 실패 - 봇으로 진행', e);
      if (signal.cancelled) throw e;
    }
  } else {
    // 찾는 연출 (1.5~3.5초)
    const wait = 1500 + Math.random() * 2000;
    const t0 = Date.now();
    while (Date.now() - t0 < wait) {
      if (signal.cancelled) throw new Error('cancelled');
      onStatus((Date.now() - t0) / 1000);
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  return createBotSession();
}

// ---------------------------------------------------------------
//  봇 상대 - 같은 시드의 헤드리스 게임을 페이지 안에서 돌린다
// ---------------------------------------------------------------
const NICK_HEAD = ['용사', '전사', '궁수', '기사', '검객', '사냥꾼', '마법사', '도적'];
const NICK_TAGS = ['달빛궁수', '합성장인', '철벽수비', '몹사냥꾼', '번개마법사', '고블린킬러', '새벽용사', '빙결여왕',
  '랜덤의신', '초보탈출', '성기사짱', '타워장인', 'MoonArcher', 'TowerKing', 'NovaKnight', 'LuckyMerge'];
function botNick(): string {
  if (Math.random() < 0.55) return `${NICK_HEAD[Math.floor(Math.random() * NICK_HEAD.length)]}${1000 + Math.floor(Math.random() * 9000)}`;
  const tag = NICK_TAGS[Math.floor(Math.random() * NICK_TAGS.length)];
  return Math.random() < 0.4 ? `${tag}${Math.floor(Math.random() * 99)}` : tag;
}

export function createBotSession(): PvpSession {
  const seed = Math.floor(Math.random() * 2 ** 31);
  const t = meta.pvp.trophies;
  return new BotSession({
    roomId: `bot_${seed}`,
    seed,
    bot: true,
    opponent: { nick: botNick(), trophies: Math.max(0, t + Math.round((Math.random() - 0.5) * 80)) },
  });
}

/** 봇 실력 0~0.75: 트로피가 오를수록 강해지되 사람이 이길 만한 수준에서 멈춘다.
 *  연승하면 조금 세게, 연패하면 확실히 약하게 (매스마켓: 지기만 하는 판이 이어지지 않게). tools/pvpsim.ts */
export function botSkill(): number {
  const p = meta.pvp;
  if (p.wins + p.losses < 3) return 0.05; // 첫 3판은 가장 약한 봇 - 처음 대전에서 이기는 경험
  // 사람 손은 봇보다 느리고 실수도 많다 → 천천히 강해진다 (300 트로피 ≈ 0.3, 900 ≈ 0.7, 1125+ ≈ 0.85)
  const base = 0.1 + p.trophies / 1500;
  const adj = Math.min(4, p.streak) * 0.05 - Math.min(3, p.lossStreak ?? 0) * 0.1;
  return Math.max(0.05, Math.min(0.85, base + adj));
}

/** 봇 유닛 레벨 = 내 출전 덱의 평균 레벨 (가진 유닛 전체 평균이면 덱만 키운 플레이어가 너무 유리했다) */
export function botLevel(): number {
  const lv = unitLevels();
  const vals = meta.deck.map((j) => lv[j] ?? 1);
  return Math.max(1, Math.round(vals.reduce((a, b) => a + b, 0) / Math.max(1, vals.length)));
}

/** 봇 유닛 공격력 배수: 약한 봇일수록 낮다 (0.05 → 0.62, 0.3 → 0.75, 0.85 → 1.0) */
export function botAtkMult(skill: number): number {
  return 0.6 + skill * 0.5;
}

/** 봇 덱: 그 트로피에서 열려 있을 유닛만 (기본 3종 + 트로피 로드로 열린 유닛) */
/** 봇 덱: 그 트로피의 사람이 가졌을 법한 유닛 (기본·로드 해금 + 등급별 트로피 기준: 희귀 80, 영웅 300, 전설 800) */
export function botDeck(trophies: number): Job[] {
  const tierOk = (r: Rarity) => r === 'common' || (r === 'rare' && trophies >= 80) || (r === 'epic' && trophies >= 300) || (r === 'legendary' && trophies >= 800);
  const pool = JOBS.filter((j) => STARTER_UNITS.includes(j) || TROPHY_ROAD.some((s) => s.unit === j && s.at <= trophies) || tierOk(UNIT_BY_ID[j].rarity));
  return [...pool].sort(() => Math.random() - 0.5).slice(0, Math.min(DECK_SIZE, pool.length));
}

/** 봇 공격 덱: 기본 4장 + 그 트로피에서 열려 있을 몹 카드 중 4장 */
export function botAttackDeck(trophies: number): AttackKey[] {
  const pool = ATTACKS.map((a) => a.key)
    .filter((k) => STARTER_ATTACKS.includes(k) || TROPHY_ROAD.some((s) => s.attack === k && s.at <= trophies));
  return [...pool].sort(() => Math.random() - 0.5).slice(0, ATTACK_DECK_SIZE);
}

/** 봇전 트로피 규칙 - 서버 finishMatch 와 같다 */
function trophyDelta(won: boolean): number {
  return won ? PVP.trophyWin + Math.min(10, meta.pvp.streak * 2) : -Math.min(PVP.trophyLoss, meta.pvp.trophies);
}

class BotSession implements PvpSession {
  private game: Game | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private handlers: PvpHandlers | null = null;
  private done = false;
  private opp: BoardSnapshot | null = null; // 플레이어 필드 (봇이 약점을 노릴 때 사용)
  constructor(readonly match: MatchInfo) {}

  private ticket: string | null = null; // 서버가 발급한 봇전 id (결과 보고용)

  async ready(h: PvpHandlers): Promise<void> {
    this.handlers = h;
    const skill = botSkill();
    const think = thinkInterval(skill);
    const openDelay = 1.5 + Math.random() * 1.5;
    if (onlineAvailable()) {
      // 트로피는 서버가 관리한다: 봇전 시작을 서버에 알리고 받은 id 로만 결과를 보고할 수 있다
      try {
        const net = await import('./net/server');
        this.ticket = (await net.callGlobal<{ id: string }>('pvpBotStart')).id;
      } catch (e) { console.warn('[pvp] 봇전 시작 기록 실패 - 트로피 미반영', e); }
    }
    // 덱: 플레이어 덱과 같은 수, 해금 유닛 중 무작위 (레벨은 플레이어 평균 수준)
    const deck = botDeck(this.match.opponent.trophies);
    const avg = botLevel();
    const game = new Game({ mode: 'pvp', seed: this.match.seed, useResearch: false, track: false, deck, atkMult: botAtkMult(skill),
      attackDeck: botAttackDeck(this.match.opponent.trophies), unitLevels: Object.fromEntries(deck.map((j) => [j, avg])) });
    this.game = game;
    game.on('attack', (p) => h.onAttack(p));
    game.on('gameover', () => void this.finish(true));
    const startAt = Date.now() + 3000;
    h.onStart(startAt);
    let acc = 0, snapAcc = 0;
    let last = Date.now();
    this.timer = setInterval(() => {
      const now = Date.now();
      const real = Math.min(0.2, (now - last) / 1000);
      last = now;
      if (now < startAt || this.done) return;
      const sinceStart = (now - startAt) / 1000;
      const dt = real * PLAY_SPEED;
      for (let left = dt; left > 0; left -= 0.05) game.update(Math.min(left, 0.05));
      acc += real; snapAcc += real; // 판단·스냅샷 모두 실시간 기준 (사람과 같은 손 속도)
      // 시작 직후 잠깐은 손을 대지 않는다 (사람이 상황을 파악하는 시간)
      if (acc >= think && sinceStart > openDelay) { acc = 0; aiStep(game, skill, this.opp); }
      if (snapAcc >= PVP.reportInterval) { snapAcc = 0; h.onSnapshot(game.snapshot()); }
    }, 50);
  }

  private async finish(playerWon: boolean): Promise<void> {
    if (this.done) return;
    this.done = true;
    if (this.timer) clearInterval(this.timer);
    let delta = trophyDelta(playerWon);
    let trophies = meta.pvp.trophies + delta;
    let reward: PvpResult['reward'];
    if (this.ticket) {
      try {
        const net = await import('./net/server');
        const r = await net.callGlobal<{ delta: number; trophies: number; reward: PvpReward; econ: Record<string, unknown> } | null>('pvpBotResult', { id: this.ticket, won: playerWon });
        if (r) { delta = r.delta; trophies = r.trophies; reward = { ...r.reward, econ: r.econ }; } else { delta = 0; trophies = meta.pvp.trophies; }
      } catch (e) { console.warn('[pvp] 봇전 결과 저장 실패', e); delta = 0; trophies = meta.pvp.trophies; }
    }
    this.handlers?.onResult({ won: playerWon, reason: 'defeat', trophyDelta: delta, trophies, reward });
  }

  sendSnapshot(s: BoardSnapshot): void { this.opp = s; }
  sendAttack(p: AttackPayload): void { this.game?.receiveAttack(p); }
  reportDefeat(): void { void this.finish(false); }
  leave(): void {
    this.done = true;
    if (this.timer) clearInterval(this.timer);
  }
}
