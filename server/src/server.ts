/**
 * Defense Battle (디펜스 배틀) - Verse8(Agent8) GameServer
 *
 * 기능
 *  - 클라우드 저장: loadProfile / saveProfile  (계정별 메타 진행도)
 *  - VX Shop 결제 지급: $onItemPurchased 훅이 대기 목록에 기록 → claimPurchases 로 수령
 *  - PvP 실시간 1:1: 매칭(pvpQueue/pvpPoll/pvpCancel) → 룸(pvpReady/pvpSnap/pvpAttack/pvpDefeat)
 *    → 결과(트로피/랭킹) 서버 판정. 이탈(onRoomLeave) 시 상대 승리.
 *
 * 각 클라이언트가 자기 필드를 시뮬레이션하고, 서버는 매칭·중계·승패/트로피만 권위적으로 처리한다.
 * (같은 seed 로 양쪽 웨이브 구성이 동일)
 *
 * 경제(보석·아이템·카드·유닛 레벨·연구·상자·보상)는 서버 권위:
 *  - 계정별 'econ' 상태에만 있고, 기기는 읽기만 한다 (SDK 는 상태를 쓸 수 없고 서버 함수만 부를 수 있다)
 *  - 바꾸는 방법은 econ(동작) / 결제 훅 / 대전·스테이지 결과뿐. 규칙은 game/src/econ/rules.ts (기기 오프라인 모드와 공용)
 *  - saveProfile 로 올라온 저장본의 경제 필드는 버린다
 */
import * as R from '../../game/src/econ/rules';
import { STAGE_BY_ID, RESEARCH, UNITS, CHESTS } from '../../game/src/config';
import { isBadNick } from '../../game/src/nickFilter';

const QUEUE_KEY = 'pvpQueue';
const QUEUE_TTL = 15_000;        // 대기열 하트비트 만료(ms) - 클라이언트가 2초마다 poll
const MATCH_TTL = 60_000;        // 매칭 결과 보관(ms)
const TROPHY_WIN = 30;
const TROPHY_LOSS = 20;
const ATTACK_CARD_COUNT = 10;    // 몹 카드 종류 수 (game/src/config.ts ATTACKS)
const RANKING = 'pvpRanking';
const MAX_META_BYTES = 60_000;
/** 대전 중 연결이 끊긴 쪽을 기다려 주는 시간 - 지나면 남은 쪽이 승리를 요청할 수 있다 (플랫폼 유예가 더 길어도 이만큼만) */
const AWAY_GRACE_MS = 20_000;
const MAX_PENDING_ATTACKS = 60;
/** 룸마다 '나 → 상대' 계정 (스냅샷을 상대에게만 보내려고 - 런타임이 재시작되면 룸 상태에서 다시 읽는다) */
const oppCache = new Map<string, string>();

interface QueueEntry { account: string; nick: string; trophies: number; t: number }
interface PvpStats { trophies: number; wins: number; losses: number; streak: number }
interface MatchInfo {
  roomId: string;
  seed: number;
  t: number;
  opponent: { account: string; nick: string; trophies: number };
}
interface PurchaseRecord { purchaseId: string; productId: string; quantity: number }
interface PlayerSlot { nick: string; trophies: number; ready: boolean }

function cleanNick(n: unknown): string {
  const s = (typeof n === 'string' ? n.trim() : '').slice(0, 12);
  return s && !isBadNick(s) ? s : '용사'; // 비속어 닉네임은 기본 이름으로 (랭킹·상대 화면에 나가지 않게)
}

// ---------------- 경제 ----------------
type Econ = R.Econ;
const ECON_VERSION = 1;
/** 스테이지/무한 결과를 받기 위한 최소 진행 시간 (웨이브당, 3배속 기준으로 넉넉히) */
const MS_PER_WAVE = 2500;

function freshEcon(): Omit<Econ, 'deck' | 'daily' | 'pvp'> {
  return {
    crystals: 0,
    items: { gachaTicket: 0, goldBooster: 0 },
    cards: {},
    units: { archer: 1, wizard: 1, warrior: 1 },
    research: Object.fromEntries(RESEARCH.map((r) => [r.key, 0])) as Econ['research'],
    chests: [{ kind: 'wood' }, null, null, null],
    chestCycle: 0,
    roadClaimed: [],
    stages: {},
    oneTime: {},
    monthly: { expires: 0, lastClaim: '' },
    season: { id: R.seasonOf(Date.now()), xp: 0, premium: false, claimedFree: [], claimedPremium: [] },
    achievements: {},
    adRemoved: false,
  };
}
const clampN = (v: unknown, max: number) => Math.max(0, Math.min(max, Math.floor(Number(v) || 0)));
/** 경제 도입 전 저장본(기기가 올린 값)을 한 번만 받아들인다 - 값은 상한으로 자른다 */
function migrateEcon(old: Record<string, any> | null | undefined): Omit<Econ, 'deck' | 'daily' | 'pvp'> {
  const e = freshEcon();
  if (!old) return e;
  e.crystals = clampN(old.crystals, 20000);
  const oldItems: Record<string, number> = {};
  for (const k of ['summonTicket', 'mythicTicket', 'gachaTicket', 'goldBooster']) oldItems[k] = clampN(old.items?.[k], 100);
  R.convertLegacyItems(oldItems); // 예전 판 안 소환권·신화 확정권 → 뽑기권
  for (const k of Object.keys(e.items) as (keyof Econ['items'])[]) e.items[k] = clampN(oldItems[k], 100);
  for (const u of UNITS) {
    const lv = clampN(old.units?.[u.id], 10);
    if (lv) e.units[u.id] = lv;
    const c = clampN(old.cards?.[u.id], 2000);
    if (c) e.cards[u.id] = c;
  }
  for (const r of RESEARCH) e.research[r.key] = clampN(old.research?.[r.key], r.max);
  if (Array.isArray(old.chests)) e.chests = [0, 1, 2, 3].map((i) => {
    const c = old.chests[i];
    return c && CHESTS[c.kind as keyof typeof CHESTS] ? { kind: c.kind } : null;
  });
  e.chestCycle = clampN(old.chestCycle, 1e6);
  if (Array.isArray(old.roadClaimed)) e.roadClaimed = old.roadClaimed.filter((n: unknown) => typeof n === 'number').slice(0, 100);
  if (old.stages && typeof old.stages === 'object') for (const [id, n] of Object.entries(old.stages)) if (STAGE_BY_ID[id]) e.stages[id] = clampN(n, 3);
  if (old.oneTime && typeof old.oneTime === 'object') for (const [k, v] of Object.entries(old.oneTime)) if (typeof v === 'boolean' || typeof v === 'number') e.oneTime[k] = v;
  if (old.achievements && typeof old.achievements === 'object') for (const [k, v] of Object.entries(old.achievements)) if (v === true) e.achievements[k] = true;
  e.adRemoved = old.adRemoved === true;
  return e;
}
interface EconRec { v: number; data: Omit<Econ, 'deck' | 'daily' | 'pvp'> }
/** 계정 경제 불러오기 (없으면 예전 저장본에서 한 번 옮김) */
async function loadEcon(account: string): Promise<Econ> {
  const st = await $global.getUserState(account, ['econ', 'meta', 'pvp']);
  const rec = st.econ as EconRec | undefined;
  const data = rec?.v === ECON_VERSION ? rec.data : migrateEcon(st.meta);
  R.convertLegacyItems(data.items as Record<string, number>); // 소환권·신화 확정권이 남은 계정 (뽑기권으로 바뀌기 전 저장본)
  const deck = Array.isArray(st.meta?.deck) ? [...st.meta.deck] : ['archer', 'wizard', 'warrior'];
  return { ...data, deck, daily: st.meta?.daily ?? { date: '', progress: {}, claimed: {} }, pvp: { ...freshStats(), ...(st.pvp || {}) } } as Econ;
}
async function saveEcon(account: string, e: Econ): Promise<void> {
  const { deck: _d, daily: _y, pvp: _p, ...data } = e;
  await $global.updateUserState(account, { econ: { v: ECON_VERSION, data } });
}
/** 기기로 보내는 경제 상태 */
function publicEcon(e: Econ): Record<string, unknown> {
  const { deck: _d, daily: _y, pvp: _p, ...data } = e;
  return data;
}
const econCtx = (): R.Ctx => ({ now: Date.now(), rng: Math.random });
/** 계정 잠금 안에서 경제를 바꾸고 저장 → 바뀐 상태와 결과 */
async function withEcon<T>(account: string, fn: (e: Econ) => T | Promise<T>): Promise<{ econ: Record<string, unknown>; result: T }> {
  return $lock(`econ:${account}`, async () => {
    const e = await loadEcon(account);
    const result = await fn(e);
    await saveEcon(account, e);
    return { econ: publicEcon(e), result };
  });
}

function freshStats(): PvpStats {
  return { trophies: 0, wins: 0, losses: 0, streak: 0 };
}

async function getStats(account: string): Promise<PvpStats> {
  const st = await $global.getUserState(account, ['pvp']);
  return { ...freshStats(), ...(st.pvp || {}) };
}

export class Server {
  // ================= 클라우드 저장 =================
  async loadProfile(): Promise<{ account: string; meta: Record<string, any>; pvp: PvpStats }> {
    const st = await $global.getMyState(['meta', 'pvp']);
    const pvp = { ...freshStats(), ...(st.pvp || {}) };
    const { econ } = await withEcon($sender.account, () => null); // 처음이면 여기서 옮겨 둔다
    // PvP 기록·경제는 서버 값이 권위 (기기 저장본 덮어쓰기).
    // 처음 온 계정도 빈 저장본 대신 이 계정의 경제·PvP 를 준다 - 기기에 남은 다른 계정 캐시를 쓰지 않게
    const meta = { ...(st.meta || {}), ...econ, pvp };
    return { account: $sender.account, meta, pvp };
  }

  async saveProfile(meta: Record<string, any>): Promise<boolean> {
    if (!meta || typeof meta !== 'object') throw new Error('invalid meta');
    if (JSON.stringify(meta).length > MAX_META_BYTES) throw new Error('meta too large');
    delete meta.pvp; // 서버 권위 필드는 저장하지 않음
    // 경제 필드도 버린다 (기기가 올린 보석·카드·레벨은 믿지 않는다). 단, 경제 도입 전 계정의 첫 이전용 값은 econ 이 없을 때만 남긴다
    const st = await $global.getMyState(['econ']);
    if (st.econ) for (const k of R.ECON_KEYS) delete meta[k];
    await $global.updateMyState({ meta }, { returnState: false });
    return true;
  }

  // ================= 경제 =================
  /** 경제 상태 받기 */
  async econSync(): Promise<{ econ: Record<string, unknown> }> {
    const { econ } = await withEcon($sender.account, () => null);
    return { econ };
  }

  /** 기기가 부르는 경제 동작 (상자·뽑기·강화·연구·해금·보상 수령 등) - 규칙은 rules.ts */
  async econ(opts: { action?: string; args?: Record<string, unknown> } = {}): Promise<{ econ: Record<string, unknown>; result: unknown }> {
    const fn = R.CLIENT_ACTIONS[String(opts.action)];
    if (!fn) throw new Error('unknown action');
    const args = opts.args && typeof opts.args === 'object' ? opts.args : {};
    return withEcon($sender.account, (e) => fn(e, args, econCtx()));
  }

  /** 스테이지·무한 모드 시작 기록 - 결과는 이 기록으로 한 번만, 웨이브 수에 맞는 시간이 지난 뒤에만 */
  async runStart(opts: { kind?: 'stage' | 'endless'; id?: string } = {}): Promise<{ id: string }> {
    const kind = opts.kind === 'endless' ? 'endless' : 'stage';
    if (kind === 'stage' && !STAGE_BY_ID[String(opts.id)]) throw new Error('unknown stage');
    const id = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    await $global.updateMyState({ run: { id, kind, stage: opts.id ?? null, t: Date.now() } });
    return { id };
  }

  /** 스테이지·무한 모드 결과 → 보상 (기록이 없거나 너무 빠르면 보상 없음) */
  async runEnd(opts: { id?: string; cleared?: boolean; stars?: number; wave?: number } = {}): Promise<{ econ: Record<string, unknown>; result: unknown } | null> {
    const me = $sender.account;
    const st = await $global.getMyState(['run']);
    const run = st.run as { id: string; kind: 'stage' | 'endless'; stage: string | null; t: number } | null | undefined;
    if (!run || run.id !== opts.id) return null;
    await $global.updateMyState({ run: null });
    const elapsed = Date.now() - run.t;
    const cleared = opts.cleared === true;
    let wave = clampN(opts.wave, 999);
    if (run.kind === 'stage') {
      const def = STAGE_BY_ID[run.stage!];
      if (cleared && elapsed < def.waves * MS_PER_WAVE) return null; // 클리어인데 너무 빠름
      wave = Math.min(wave, Math.floor(elapsed / MS_PER_WAVE));
      return withEcon(me, (e) => R.stageEnd(e, run.stage!, cleared, clampN(opts.stars, 3), wave, econCtx()));
    }
    wave = Math.min(wave, Math.floor(elapsed / MS_PER_WAVE));
    return withEcon(me, (e) => R.endlessEnd(e, wave, econCtx()));
  }

  // ================= VX Shop 결제 =================
  /** 결제 완료 시 플랫폼이 호출 ($sender 가 아닌 event.account 로 사용자 식별) */
  async $onItemPurchased(event: { account: string; purchaseId: number | string; productId: string; quantity?: number }): Promise<boolean> {
    const account = event.account;
    const purchaseId = String(event.purchaseId);
    // 지급은 여기서 바로 (서버 권위). 같은 purchaseId 는 한 번만
    await withEcon(account, async (e) => {
      const st = await $global.getUserState(account, ['pendingPurchases', 'grantedIds']);
      const granted: string[] = Array.isArray(st.grantedIds) ? st.grantedIds : [];
      if (granted.includes(purchaseId)) return;
      const reveals = R.grantProduct(e, event.productId, Math.max(1, event.quantity || 1), econCtx());
      const list: Array<PurchaseRecord & { reveals?: R.Reveal[] }> = Array.isArray(st.pendingPurchases) ? st.pendingPurchases : [];
      list.push({ purchaseId, productId: event.productId, quantity: Math.max(1, event.quantity || 1), reveals });
      await $global.updateUserState(account, { pendingPurchases: list.slice(-50), grantedIds: [...granted, purchaseId].slice(-500) });
    });
    $global.sendMessageToUser('purchase', account, { productId: event.productId });
    return true;
  }

  /** 지급된 구매 알림을 가져가고 비운다 (지급은 이미 훅에서 끝남 - 기기는 화면 표시·상자 공개만) */
  async claimPurchases(): Promise<{ list: Array<PurchaseRecord & { reveals?: R.Reveal[] }>; econ: Record<string, unknown> }> {
    const account = $sender.account;
    return withEcon(account, async () => {
      const st = await $global.getMyState(['pendingPurchases']);
      const list = Array.isArray(st.pendingPurchases) ? st.pendingPurchases : [];
      if (list.length) await $global.updateMyState({ pendingPurchases: [] });
      return list;
    }).then(({ econ, result }) => ({ list: result, econ }));
  }

  // ================= PvP 매칭 =================
  async pvpQueue(opts: { nick?: string } = {}): Promise<{ status: 'waiting' } | { status: 'matched'; match: MatchInfo }> {
    const me = $sender.account;
    const nick = cleanNick(opts.nick);
    const stats = await getStats(me);
    await $global.updateMyState({ nick, pvpMatch: null });
    return $lock(QUEUE_KEY, async () => {
      const now = Date.now();
      const g = await $global.getGlobalState([QUEUE_KEY]);
      let queue: QueueEntry[] = (g[QUEUE_KEY] || []).filter((q: QueueEntry) => now - q.t < QUEUE_TTL && q.account !== me);
      // 트로피가 가장 가까운 상대 (오래 기다린 사람일수록 허용 폭 확대)
      let best: QueueEntry | null = null;
      let bestScore = Infinity;
      for (const q of queue) {
        const waited = (now - q.t) / 1000;
        const diff = Math.abs(q.trophies - stats.trophies);
        if (diff > 200 + waited * 40) continue;
        if (diff < bestScore) { bestScore = diff; best = q; }
      }
      if (best) {
        const opp = best;
        queue = queue.filter((q) => q.account !== opp.account);
        await $global.updateGlobalState({ [QUEUE_KEY]: queue });
        const roomId = `pvp_${now.toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
        const seed = Math.floor(Math.random() * 2 ** 31);
        const forMe: MatchInfo = { roomId, seed, t: now, opponent: { account: opp.account, nick: opp.nick, trophies: opp.trophies } };
        const forOpp: MatchInfo = { roomId, seed, t: now, opponent: { account: me, nick, trophies: stats.trophies } };
        await $global.updateUserState(opp.account, { pvpMatch: forOpp });
        $global.sendMessageToUser('pvpMatch', opp.account, forOpp);
        return { status: 'matched' as const, match: forMe };
      }
      queue.push({ account: me, nick, trophies: stats.trophies, t: now });
      await $global.updateGlobalState({ [QUEUE_KEY]: queue });
      return { status: 'waiting' as const };
    });
  }

  /** 대기 중 하트비트 + 매칭 확인 (메시지 유실 대비) */
  async pvpPoll(): Promise<{ status: 'waiting' | 'idle' } | { status: 'matched'; match: MatchInfo }> {
    const me = $sender.account;
    const st = await $global.getMyState(['pvpMatch']);
    const m: MatchInfo | null = st.pvpMatch || null;
    if (m && Date.now() - m.t < MATCH_TTL) {
      await $global.updateMyState({ pvpMatch: null });
      return { status: 'matched', match: m };
    }
    return $lock(QUEUE_KEY, async () => {
      const g = await $global.getGlobalState([QUEUE_KEY]);
      const queue: QueueEntry[] = g[QUEUE_KEY] || [];
      const mine = queue.find((q) => q.account === me);
      if (!mine) return { status: 'idle' as const };
      mine.t = Date.now();
      await $global.updateGlobalState({ [QUEUE_KEY]: queue });
      return { status: 'waiting' as const };
    });
  }

  async pvpCancel(): Promise<boolean> {
    const me = $sender.account;
    await $lock(QUEUE_KEY, async () => {
      const g = await $global.getGlobalState([QUEUE_KEY]);
      const queue: QueueEntry[] = (g[QUEUE_KEY] || []).filter((q: QueueEntry) => q.account !== me);
      await $global.updateGlobalState({ [QUEUE_KEY]: queue });
    });
    await $global.updateMyState({ pvpMatch: null });
    return true;
  }

  // ================= PvP 룸 =================
  /** 룸 입장 후 준비 완료. 두 명 모두 준비되면 3.5초 뒤 동시 시작 */
  async pvpReady(opts: { nick?: string; seed?: number } = {}): Promise<Record<string, any>> {
    const me = $sender.account;
    const roomId = $sender.roomId || $room.getId();
    const stats = await getStats(me);
    return $lock(`room:${roomId}`, async () => {
      const room = await $room.getRoomState();
      const players: Record<string, PlayerSlot> = room.players || {};
      players[me] = { nick: cleanNick(opts.nick), trophies: stats.trophies, ready: true };
      const update: Record<string, any> = { players };
      if (room.seed === undefined && typeof opts.seed === 'number') update.seed = opts.seed;
      const readyCount = Object.values(players).filter((p) => p.ready).length;
      if (readyCount >= 2 && (!room.status || room.status === 'waiting')) {
        update.status = 'playing';
        update.startAt = Date.now() + 3500;
        await $room.updateRoomState(update);
        // now: 서버 시각 - 기기 시계가 서로 달라도 (startAt - now) 만큼 남았다고 계산해 둘이 같이 시작한다
        $room.broadcastToRoom('pvpStart', { startAt: update.startAt, now: Date.now(), seed: update.seed ?? room.seed, players });
      } else {
        if (!room.status) update.status = 'waiting';
        await $room.updateRoomState(update);
      }
      return { ...room, ...update, now: Date.now() };
    });
  }

  /** 내 필드 상태 요약 중계 (상대 미니맵) */
  async pvpSnap(snap: Record<string, any>): Promise<void> {
    if (!snap || typeof snap !== 'object') return;
    const me = $sender.account;
    const roomId = $sender.roomId || $room.getId();
    const msg = { account: me, snap };
    // 상대에게만 보낸다 (방 전체로 보내면 내 스냅이 나한테도 돌아와 받는 양이 2배). 상대가 못 받는다고 알리면 방 전체로
    const key = `${roomId}:${me}`;
    let opp = oppCache.get(key);
    if (opp === undefined) {
      const room = await $room.getRoomState(['players', 'snapBroadcast']);
      if (room.snapBroadcast) { $room.broadcastToRoom('pvpSnap', msg); return; }
      opp = Object.keys(room.players || {}).find((a) => a !== me) ?? '';
      if (opp) oppCache.set(key, opp);
    }
    if (!opp || opp === '*') { $room.broadcastToRoom('pvpSnap', msg); return; }
    $room.sendMessageToUser('pvpSnap', opp, msg);
  }

  /** 상대 스냅이 안 온다 (개별 전송이 이 환경에서 안 닿음) → 이 방은 방 전체 방송으로 */
  async pvpSnapFallback(): Promise<void> {
    const roomId = $sender.roomId || $room.getId();
    await $room.updateRoomState({ snapBroadcast: true });
    for (const k of [...oppCache.keys()]) if (k.startsWith(`${roomId}:`)) oppCache.set(k, '*');
  }

  /** 몹 보내기 중계 */
  async pvpAttack(payload: { card?: number; tier?: number; wave: number; pos?: number }): Promise<boolean> {
    // 몹 카드 번호(0~9, 클라이언트 ATTACKS 순서) + 던진 길 위치(둘레 비율 0~1). tier 는 예전 클라이언트 호환
    const card = Math.max(0, Math.min(ATTACK_CARD_COUNT - 1, Math.floor(Number(payload?.card ?? payload?.tier) || 0)));
    const wave = Math.max(1, Math.min(999, Math.floor(Number(payload?.wave) || 1)));
    const p = Number(payload?.pos);
    const pos = Number.isFinite(p) ? Math.max(0, Math.min(1, p)) : 0;
    const me = $sender.account;
    const roomId = $sender.roomId || $room.getId();
    const room = await $room.getRoomState(['status', 'away']);
    if (room.status !== 'playing') return false;
    $room.broadcastToRoom('pvpAttack', { from: me, payload: { card, wave, pos } });
    // 상대가 연결이 끊겨 있으면 못 받으니 모아 두었다가 다시 들어오면 준다
    if (room.away && Object.keys(room.away).some((a) => a !== me)) {
      await $lock(`room:${roomId}`, async () => {
        const r = await $room.getRoomState(['away', 'pending']);
        const pending: Record<string, unknown[]> = r.pending || {};
        for (const acc of Object.keys(r.away || {})) {
          if (acc === me) continue;
          pending[acc] = [...(pending[acc] || []), { card, wave, pos }].slice(-MAX_PENDING_ATTACKS);
        }
        await $room.updateRoomState({ pending });
      });
    }
    return true;
  }

  /** 내 필드가 무너짐 → 상대 승리 */
  async pvpDefeat(): Promise<Record<string, any> | null> {
    const roomId = $sender.roomId || $room.getId();
    return this.finishMatch(roomId, $sender.account, 'defeat');
  }

  /** 연결 끊김 (플랫폼 유예 중 - 다시 붙을 수 있다): 상대에게 알리고 기다린다 */
  async onRoomDisconnect(roomId: string, account: string): Promise<void> {
    await $lock(`room:${roomId}`, async () => {
      const room = await $room.getRoomState(['status', 'away']);
      if (room.status !== 'playing') return;
      await $room.updateRoomState({ away: { ...(room.away || {}), [account]: Date.now() } });
    });
    $room.broadcastToRoom('pvpAway', { account, graceMs: AWAY_GRACE_MS });
  }

  /** 다시 들어옴 (클라이언트가 pvpResume 도 부르지만, 플랫폼이 먼저 알려 주면 바로 상대 화면의 안내를 끈다) */
  async onRoomJoin(roomId: string, account: string): Promise<void> {
    const room = await $room.getRoomState(['status', 'away']);
    if (room.status === 'playing' && room.away?.[account]) $room.broadcastToRoom('pvpBack', { account });
  }

  /** 끊겼다가 같은 방에 다시 들어온 클라이언트: 그동안 끝났으면 결과, 아니면 못 받은 몹 공격을 돌려준다 */
  async pvpResume(): Promise<{ status: string; result?: unknown; pending: unknown[] }> {
    const me = $sender.account;
    const roomId = $sender.roomId || $room.getId();
    return $lock(`room:${roomId}`, async () => {
      const room = await $room.getRoomState(['status', 'result', 'away', 'pending']);
      const pending = (room.pending?.[me] as unknown[]) || [];
      const away = { ...(room.away || {}) };
      delete away[me];
      const rest = { ...(room.pending || {}) };
      delete rest[me];
      await $room.updateRoomState({ away, pending: rest });
      if (room.status === 'playing') $room.broadcastToRoom('pvpBack', { account: me });
      return { status: room.status || 'waiting', result: room.result, pending };
    });
  }

  /** 상대가 끊긴 채 유예 시간이 지났다 → 남은 쪽 승리 (서버가 시간을 직접 확인) */
  async pvpClaimAway(): Promise<Record<string, any> | null> {
    const me = $sender.account;
    const roomId = $sender.roomId || $room.getId();
    const room = await $room.getRoomState(['status', 'away']);
    if (room.status !== 'playing') return null;
    const gone = Object.entries((room.away || {}) as Record<string, number>).find(([a, t]) => a !== me && Date.now() - t >= AWAY_GRACE_MS);
    if (!gone) return null;
    return this.finishMatch(roomId, gone[0], 'leave');
  }

  async onRoomLeave(roomId: string, account: string): Promise<void> {
    const room = await $room.getRoomState(['status']);
    if (room.status === 'playing') {
      await this.finishMatch(roomId, account, 'leave');
    } else if (room.status === 'waiting') {
      await $room.updateRoomState({ status: 'cancelled' });
      $room.broadcastToRoom('pvpCancel', { account });
    }
  }

  /** 승패 확정 (중복 호출 안전) - 트로피/전적/랭킹 갱신 후 결과 브로드캐스트 */
  private async finishMatch(roomId: string, loser: string, reason: 'defeat' | 'leave'): Promise<Record<string, any> | null> {
    return $lock(`room:${roomId}`, async () => {
      const room = await $room.getRoomState();
      if (room.status !== 'playing') return room.result || null;
      const accounts = Object.keys(room.players || {});
      const winner = accounts.find((a) => a !== loser) || null;
      const delta: Record<string, number> = {};
      const trophies: Record<string, number> = {};
      const rewards: Record<string, unknown> = {};
      for (const acc of accounts) {
        const s = await getStats(acc);
        const won = acc === winner;
        const d = won ? TROPHY_WIN + Math.min(10, s.streak * 2) : -Math.min(TROPHY_LOSS, s.trophies);
        s.trophies += d;
        if (won) { s.wins += 1; s.streak = Math.max(0, s.streak) + 1; } else { s.losses += 1; s.streak = 0; }
        delta[acc] = d;
        trophies[acc] = s.trophies;
        await $global.updateUserState(acc, { pvp: s });
        // 보상(보석·시즌 XP·승리 상자·트로피 로드)도 서버가 지급
        const r = await withEcon(acc, (e) => { e.pvp = s; return R.pvpReward(e, won, econCtx()); });
        rewards[acc] = { ...r.result, econ: r.econ };
        const nick = room.players[acc]?.nick || '용사';
        await $global.addCollectionItem(RANKING, { account: acc, nick, trophies: s.trophies, wins: s.wins }, { id: acc })
          .catch(() => $global.updateCollectionItem(RANKING, { __id: acc, account: acc, nick, trophies: s.trophies, wins: s.wins }));
      }
      const result = { winner, loser, reason, delta, trophies, rewards };
      await $room.updateRoomState({ status: 'done', result });
      $room.broadcastToRoom('pvpResult', result);
      return result;
    });
  }

  // ================= 봇전 (라이브 매칭이 없을 때 봇이 상대) =================
  /** 봇전 시작 기록 - 결과는 이 id 로 한 번만 받는다 */
  async pvpBotStart(): Promise<{ id: string }> {
    const id = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    await $global.updateMyState({ pvpBot: { id, t: Date.now() } });
    return { id };
  }

  /** 봇전 결과 - 트로피 규칙은 실제 대전과 같다. 잘못된 id/너무 짧은 경기는 null */
  async pvpBotResult(opts: { id?: string; won?: boolean } = {}): Promise<{ delta: number; trophies: number; reward: unknown; econ: Record<string, unknown> } | null> {
    const me = $sender.account;
    const st = await $global.getMyState(['pvpBot', 'nick']);
    const rec = st.pvpBot as { id: string; t: number } | null | undefined;
    // 경기 시간과 상관없이 승패 모두 반영 (일찍 나가 패배를 피하는 일이 없게). 시작 기록 1개당 결과 1번만
    if (!rec || rec.id !== opts.id) return null;
    await $global.updateMyState({ pvpBot: null });
    const s = await getStats(me);
    const won = !!opts.won;
    const d = won ? TROPHY_WIN + Math.min(10, s.streak * 2) : -Math.min(TROPHY_LOSS, s.trophies);
    s.trophies += d;
    if (won) { s.wins += 1; s.streak = Math.max(0, s.streak) + 1; } else { s.losses += 1; s.streak = 0; }
    await $global.updateUserState(me, { pvp: s });
    const nick = cleanNick(st.nick);
    await $global.addCollectionItem(RANKING, { account: me, nick, trophies: s.trophies, wins: s.wins }, { id: me })
      .catch(() => $global.updateCollectionItem(RANKING, { __id: me, account: me, nick, trophies: s.trophies, wins: s.wins }));
    const r = await withEcon(me, (e) => { e.pvp = s; return R.pvpReward(e, won, econCtx()); });
    return { delta: d, trophies: s.trophies, reward: r.result, econ: r.econ };
  }

  // ================= 랭킹 =================
  /** 닉네임 바꾸기 - 랭킹에 이미 있으면 그 이름도 바로 바꾼다 (대전 끝날 때까지 기다리지 않게) */
  async setNick(opts: { nick?: string } = {}): Promise<{ nick: string }> {
    const nick = cleanNick(opts.nick);
    const me = $sender.account;
    await $global.updateMyState({ nick });
    const s = await getStats(me);
    if (s.wins + s.losses > 0) {
      await $global.addCollectionItem(RANKING, { account: me, nick, trophies: s.trophies, wins: s.wins }, { id: me })
        .catch(() => $global.updateCollectionItem(RANKING, { __id: me, account: me, nick, trophies: s.trophies, wins: s.wins }));
    }
    return { nick };
  }

  async pvpLeaderboard(): Promise<{ top: Array<{ account: string; nick: string; trophies: number; wins: number }>; me: PvpStats }> {
    const items = await $global.getCollectionItems(RANKING, {
      orderBy: [{ field: 'trophies', direction: 'desc' }],
      limit: 50,
    });
    const top = items.map((i: any) => ({ account: i.account, nick: i.nick, trophies: i.trophies, wins: i.wins || 0 }));
    return { top, me: await getStats($sender.account) };
  }
}
