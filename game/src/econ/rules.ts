// ============================================================
//  경제 규칙 (클라이언트·서버 공용) - 보석·아이템·카드·유닛 레벨·연구·상자·보상
//  온라인: 서버(server/src/server.ts)가 이 규칙으로 계산하고 결과만 내려준다 (기기는 못 바꿈).
//  오프라인(로컬 개발): 기기가 같은 규칙을 자기 저장본에 적용한다.
//  DOM·저장소에 의존하지 않는 순수 함수만 둔다 (서버 번들에 들어간다).
// ============================================================
import {
  CHESTS, CHEST_CYCLE, GACHA, UNITS, UNIT_BY_ID, PVP_TIERS, UNIT_MAX_LEVEL, DECK_SIZE, TROPHY_ROAD, STAGE_BY_ID,
  RESEARCH, PRODUCT_BY_ID, MONTHLY_DAILY_CRYSTALS, SEASON_TIERS, SEASON_XP_PER_TIER, ACHIEVEMENTS, DAILY_QUESTS,
  PVP, CHAPTER_STAR_GOALS, chestOpenCost, cardsNeeded, unitUpgradeCost, researchCost, crystalReward,
  type ChestKind, type RoadStep, type SeasonReward,
} from '../config';
import type { MetaData, Job, Rarity, ItemKey, ResearchKey } from '../types';

/** 경제 상태 = 저장본 중 서버가 권위를 갖는 부분 */
export const ECON_KEYS = [
  'crystals', 'items', 'cards', 'units', 'research', 'chests', 'chestCycle', 'roadClaimed', 'stages',
  'oneTime', 'monthly', 'season', 'achievements', 'adRemoved',
] as const;
export type EconKey = (typeof ECON_KEYS)[number];
export type Econ = Pick<MetaData, EconKey> & { deck: MetaData['deck']; daily: MetaData['daily']; pvp: MetaData['pvp'] };

export interface Ctx { now: number; rng: () => number }
export interface CardDrop { job: Job; n: number; fresh: boolean }
/** kind: 연출용 (어떤 상자 / 뽑기) */
export interface Reveal { title: string; drops: CardDrop[]; gems: number; kind?: ChestKind | 'gacha' }

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
export const todayOf = (now: number) => new Date(now).toISOString().slice(0, 10);
export const seasonOf = (now: number) => `S${new Date(now).toISOString().slice(0, 7)}`;
const arenaIdx = (e: Econ) => Math.max(0, PVP_TIERS.filter((t) => e.pvp.trophies >= t.min).length - 1);

// ---------------- 유닛·카드 ----------------
export function unlockUnit(e: Econ, job: Job): void {
  if (e.units[job]) return;
  e.units[job] = 1;
  if (e.deck.length < DECK_SIZE && !e.deck.includes(job)) e.deck.push(job);
}
/** 카드 받기: 없는 유닛이면 1장으로 해금, 나머지는 레벨업 재료. 새로 해금되면 true */
export function addCards(e: Econ, job: Job, n: number): boolean {
  if (n <= 0 || !UNIT_BY_ID[job]) return false;
  let fresh = false;
  if (!e.units[job]) { unlockUnit(e, job); n -= 1; fresh = true; }
  e.cards[job] = (e.cards[job] ?? 0) + n;
  return fresh;
}
export function addItem(e: Econ, key: ItemKey, n: number): void {
  e.items[key] = Math.max(0, (e.items[key] || 0) + n);
}
export function upgradeUnit(e: Econ, job: Job): boolean {
  const lv = e.units[job] ?? 0;
  const need = cardsNeeded(UNIT_BY_ID[job].rarity, lv);
  const cost = unitUpgradeCost(lv);
  if (lv <= 0 || lv >= UNIT_MAX_LEVEL || (e.cards[job] ?? 0) < need || e.crystals < cost) return false;
  e.crystals -= cost;
  e.cards[job] = (e.cards[job] ?? 0) - need;
  e.units[job] = lv + 1;
  return true;
}
/** 보석으로 바로 해금 */
export function buyUnit(e: Econ, job: Job): boolean {
  const def = UNIT_BY_ID[job];
  if (!def || e.units[job] || !def.unlockCrystals || e.crystals < def.unlockCrystals) return false;
  e.crystals -= def.unlockCrystals;
  unlockUnit(e, job);
  return true;
}
export function research(e: Econ, key: ResearchKey): boolean {
  const r = RESEARCH.find((x) => x.key === key);
  const lv = e.research[key] ?? 0;
  if (!r || lv >= r.max || e.crystals < researchCost(lv)) return false;
  e.crystals -= researchCost(lv);
  e.research[key] = lv + 1;
  return true;
}
/** 소환권·신화 확정권·골드 부스터 1개 사용 */
export function useItem(e: Econ, key: ItemKey): boolean {
  if ((e.items[key] || 0) <= 0) return false;
  e.items[key] -= 1;
  return true;
}

// ---------------- 상자·뽑기 ----------------
const pool = (r: Rarity) => UNITS.filter((u) => u.rarity === r).map((u) => u.id);
function split(r: Rarity, n: number, k: number, out: Map<Job, number>, rng: () => number): void {
  if (n <= 0) return;
  const jobs = [...pool(r)].sort(() => rng() - 0.5).slice(0, Math.max(1, Math.min(k, n)));
  for (let i = 0; i < n; i++) { const j = jobs[i % jobs.length]; out.set(j, (out.get(j) ?? 0) + 1); }
}
function rollChest(e: Econ, kind: ChestKind, rng: () => number): { cards: Map<Job, number>; gems: number } {
  const d = CHESTS[kind];
  const a = arenaIdx(e);
  const total = d.cards + d.perArena * a;
  const epic = Math.floor(d.epic) + (rng() < d.epic % 1 ? 1 : 0);
  const legend = rng() < d.legendary ? 1 : 0;
  const rare = Math.min(total - epic - legend, Math.round(d.rare * (1 + a * 0.25)));
  const common = Math.max(0, total - rare - epic - legend);
  const cards = new Map<Job, number>();
  split('common', common, 3, cards, rng);
  split('rare', rare, 2, cards, rng);
  split('epic', epic, epic, cards, rng);
  split('legendary', legend, 1, cards, rng);
  return { cards, gems: d.gems[0] + Math.floor(rng() * (d.gems[1] - d.gems[0] + 1)) };
}
function grantDrops(e: Econ, cards: Map<Job, number>, gems: number): CardDrop[] {
  e.crystals += gems;
  const order: Record<Rarity, number> = { legendary: 0, epic: 1, rare: 2, common: 3 };
  return [...cards].map(([job, n]) => ({ job, n, fresh: addCards(e, job, n) }))
    .sort((x, y) => order[UNIT_BY_ID[x.job].rarity] - order[UNIT_BY_ID[y.job].rarity]);
}
export function openChestNow(e: Econ, kind: ChestKind, ctx: Ctx): Reveal {
  const r = rollChest(e, kind, ctx.rng);
  return { title: CHESTS[kind].kr, drops: grantDrops(e, r.cards, r.gems), gems: r.gems, kind };
}
/** 대전 승리 상자 → 빈 칸 (가득이면 null) */
export function giveWinChest(e: Econ): ChestKind | null {
  const i = e.chests.findIndex((c) => !c);
  if (i < 0) return null;
  const kind = CHEST_CYCLE[e.chestCycle % CHEST_CYCLE.length];
  e.chestCycle += 1;
  e.chests[i] = { kind };
  return kind;
}
export function startUnlock(e: Econ, i: number, ctx: Ctx): boolean {
  const c = e.chests[i];
  if (!c || c.openAt || e.chests.some((x) => !!x?.openAt)) return false;
  c.openAt = ctx.now + CHESTS[c.kind].hours * HOUR;
  return true;
}
/** 다 된 상자 열기, 또는 pay=true 면 보석으로 바로 */
export function openSlot(e: Econ, i: number, pay: boolean, ctx: Ctx): Reveal | null {
  const c = e.chests[i];
  if (!c) return null;
  const left = c.openAt ? c.openAt - ctx.now : CHESTS[c.kind].hours * HOUR;
  if (left > 0) {
    if (!pay) return null;
    const cost = chestOpenCost(left);
    if (e.crystals < cost) return null;
    e.crystals -= cost;
  }
  e.chests[i] = null;
  return openChestNow(e, c.kind, ctx);
}
export function gacha(e: Econ, n: 1 | 10, ctx: Ctx): Reveal | null {
  const cost = n === 1 ? GACHA.one : GACHA.ten;
  if (e.crystals < cost) return null;
  e.crystals -= cost;
  const roll = (): Rarity => {
    let r = ctx.rng();
    for (const k of ['legendary', 'epic', 'rare', 'common'] as Rarity[]) { if (r < GACHA.rates[k]) return k; r -= GACHA.rates[k]; }
    return 'common';
  };
  const rolls = Array.from({ length: n }, roll);
  if (n === 10 && !rolls.some((r) => r === 'epic' || r === 'legendary')) rolls[rolls.length - 1] = 'epic';
  const cards = new Map<Job, number>();
  for (const r of rolls) { const p = pool(r); const j = p[Math.floor(ctx.rng() * p.length)]; cards.set(j, (cards.get(j) ?? 0) + GACHA.count[r]); }
  return { title: `유닛 뽑기 ${n}회`, drops: grantDrops(e, cards, 0), gems: 0, kind: 'gacha' };
}

// ---------------- 보상 ----------------
/** 광고 '보상 2배' 대상 (직전 판 보상, 10분 안 1회) */
function setLastReward(e: Econ, amount: number, ctx: Ctx): void {
  (e.oneTime as Record<string, unknown>).lastReward = amount > 0 ? { amount, at: ctx.now, used: false } : null;
}
export function addSeasonXp(e: Econ, xp: number, ctx: Ctx): void {
  const id = seasonOf(ctx.now);
  if (e.season.id !== id) e.season = { id, xp: 0, premium: false, claimedFree: [], claimedPremium: [] };
  e.season.xp += xp;
}
/** 트로피 로드: 도달한 보상 받기 (트로피는 서버 기록) */
export function claimRoad(e: Econ, ctx: Ctx): { steps: RoadStep[]; reveals: Reveal[] } {
  const steps: RoadStep[] = [];
  const reveals: Reveal[] = [];
  for (const s of TROPHY_ROAD) {
    if (e.pvp.trophies < s.at || e.roadClaimed.includes(s.at)) continue;
    e.roadClaimed.push(s.at);
    if (s.crystals) e.crystals += s.crystals;
    if (s.unit) unlockUnit(e, s.unit);
    if (s.chest) reveals.push(openChestNow(e, s.chest, ctx));
    steps.push(s);
  }
  return { steps, reveals };
}
/** 대전 결과 보상 (트로피·승패는 서버 판정 뒤) */
export function pvpReward(e: Econ, won: boolean, ctx: Ctx): { crystals: number; chest: ChestKind | null; road: RoadStep[]; reveals: Reveal[] } {
  const crystals = won ? PVP.rewardWin : PVP.rewardLoss;
  e.crystals += crystals;
  addSeasonXp(e, won ? PVP.seasonXpWin : PVP.seasonXpLoss, ctx);
  setLastReward(e, crystals, ctx);
  const chest = won ? giveWinChest(e) : null;
  const road = claimRoad(e, ctx);
  return { crystals, chest, road: road.steps, reveals: road.reveals };
}
/** 스테이지 끝 (온라인은 서버가 시작 기록·최소 시간을 확인한 뒤 부른다) */
export function stageEnd(e: Econ, id: string, cleared: boolean, stars: number, wave: number, ctx: Ctx):
  { stars: number; firstClear: boolean; newBest: boolean; crystals: number; unlocked?: Job } {
  const st = STAGE_BY_ID[id];
  if (!st) return { stars: 0, firstClear: false, newBest: false, crystals: 0 };
  const prev = e.stages[id] || 0;
  if (!cleared) {
    const crystals = Math.max(0, Math.min(st.waves, Math.floor(wave)) >> 1);
    e.crystals += crystals;
    setLastReward(e, crystals, ctx);
    return { stars: 0, firstClear: false, newBest: false, crystals };
  }
  stars = Math.max(1, Math.min(3, Math.floor(stars)));
  const firstClear = prev === 0;
  const crystals = firstClear ? st.firstReward : st.replayReward;
  e.stages[id] = Math.max(prev, stars);
  e.crystals += crystals;
  addSeasonXp(e, 30, ctx);
  setLastReward(e, crystals, ctx);
  let unlocked: Job | undefined;
  if (firstClear && st.unlocks && !e.units[st.unlocks]) { unlocked = st.unlocks; unlockUnit(e, st.unlocks); }
  return { stars, firstClear, newBest: stars > prev, crystals, unlocked };
}
export function endlessEnd(e: Econ, wave: number, ctx: Ctx): number {
  const c = crystalReward(Math.max(0, Math.min(50, Math.floor(wave))));
  e.crystals += c;
  setLastReward(e, c, ctx);
  return c;
}
/** 광고 보상: 'double' 직전 판 보상 한 번 더, 'tickets' 소환권 (하루 횟수 제한) */
export const AD_TICKETS_PER_DAY = 3;
export const AD_TICKET_AMOUNT = 5;
export function adReward(e: Econ, kind: 'double' | 'tickets', ctx: Ctx): number {
  const o = e.oneTime as Record<string, any>;
  if (kind === 'double') {
    const l = o.lastReward;
    if (!l || l.used || ctx.now - l.at > 10 * 60 * 1000) return 0;
    l.used = true;
    e.crystals += l.amount;
    return l.amount;
  }
  const k = `adTicket:${todayOf(ctx.now)}`;
  if (Number(o[k] || 0) >= AD_TICKETS_PER_DAY) return 0;
  o[k] = Number(o[k] || 0) + 1;
  addItem(e, 'summonTicket', AD_TICKET_AMOUNT);
  return AD_TICKET_AMOUNT;
}
export function claimStarReward(e: Econ, chapter: number, goalIdx: number): number {
  const key = `stars:${chapter}:${goalIdx}`;
  if (e.oneTime[key] || goalIdx < 0 || goalIdx >= CHAPTER_STAR_GOALS.length) return 0;
  const stars = Object.entries(e.stages).filter(([id]) => STAGE_BY_ID[id]?.chapter === chapter).reduce((s, [, n]) => s + n, 0);
  if (stars < CHAPTER_STAR_GOALS[goalIdx]) return 0;
  const r = [100, 200, 400][goalIdx];
  e.oneTime[key] = true;
  e.crystals += r;
  return r;
}
/** 일일 퀘스트 보상 (진행도는 기기 기록 - 퀘스트마다 하루 한 번만) */
export function claimQuest(e: Econ, key: string, ctx: Ctx): number {
  const q = DAILY_QUESTS.find((x) => x.key === key);
  if (!q) return 0;
  const k = `quest:${todayOf(ctx.now)}:${key}`;
  if (e.oneTime[k]) return 0;
  e.oneTime[k] = true;
  e.crystals += q.reward;
  return q.reward;
}
/** 업적 보상 (업적마다 한 번) */
export function claimAchievement(e: Econ, key: string): number {
  const a = ACHIEVEMENTS.find((x) => x.key === key);
  if (!a || e.achievements[key]) return 0;
  e.achievements[key] = true;
  e.crystals += a.reward;
  return a.reward;
}
export function seasonTierOf(e: Econ): number {
  return Math.min(SEASON_TIERS.length, Math.floor(e.season.xp / SEASON_XP_PER_TIER));
}
function applySeasonReward(e: Econ, r: SeasonReward): void {
  if (r.crystals) e.crystals += r.crystals;
  if (r.items) for (const [k, n] of Object.entries(r.items)) addItem(e, k as ItemKey, n || 0);
}
export function claimSeason(e: Econ, tier: number, premium: boolean, ctx: Ctx): boolean {
  if (e.season.id !== seasonOf(ctx.now) || tier < 1 || tier > seasonTierOf(e)) return false;
  const list = premium ? e.season.claimedPremium : e.season.claimedFree;
  if (list.includes(tier) || (premium && !e.season.premium)) return false;
  const def = SEASON_TIERS[tier - 1];
  applySeasonReward(e, premium ? def.premium : def.free);
  list.push(tier);
  return true;
}
export function claimMonthly(e: Econ, ctx: Ctx): number {
  if (e.monthly.expires <= ctx.now || e.monthly.lastClaim === todayOf(ctx.now)) return 0;
  e.monthly.lastClaim = todayOf(ctx.now);
  e.crystals += MONTHLY_DAILY_CRYSTALS;
  return MONTHLY_DAILY_CRYSTALS;
}

// ---------------- 결제 지급 ----------------
/** 상품 지급 (서버: 결제 훅에서 / 로컬: 데모 결제 뒤). 상자 상품이면 열린 내용 반환 */
export function grantProduct(e: Econ, productId: string, qty: number, ctx: Ctx): Reveal[] {
  const def = PRODUCT_BY_ID[productId];
  if (!def) return [];
  if (def.oneTime && e.oneTime[def.id]) return [];
  const g = def.grant;
  const reveals: Reveal[] = [];
  qty = Math.max(1, Math.min(99, Math.floor(qty) || 1));
  if (g.crystals) e.crystals += g.crystals * qty;
  if (g.items) for (const [k, n] of Object.entries(g.items)) addItem(e, k as ItemKey, (n || 0) * qty);
  if (g.adRemove) e.adRemoved = true;
  if (g.monthlyDays) e.monthly.expires = Math.max(ctx.now, e.monthly.expires) + g.monthlyDays * DAY * qty;
  if (g.seasonPremium) {
    if (e.season.id !== seasonOf(ctx.now)) e.season = { id: seasonOf(ctx.now), xp: 0, premium: false, claimedFree: [], claimedPremium: [] };
    e.season.premium = true;
  }
  if (g.chest) for (let i = 0; i < qty; i++) reveals.push(openChestNow(e, g.chest, ctx));
  if (g.units) for (const [j, lv] of Object.entries(g.units)) {
    const job = j as Job;
    if (!e.units[job]) unlockUnit(e, job);
    e.units[job] = Math.max(e.units[job] ?? 1, lv ?? 1);
  }
  if (def.oneTime) e.oneTime[def.id] = true;
  return reveals;
}

// ---------------- 기기가 부를 수 있는 동작 (서버가 이름으로 받는다) ----------------
type Args = Record<string, unknown>;
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : NaN);
const str = (v: unknown) => (typeof v === 'string' ? v : '');
/** 결과는 기기로 그대로 보낸다. 서버만 할 수 있는 것(대전 보상·결제·스테이지 끝)은 여기 없다 */
export const CLIENT_ACTIONS: Record<string, (e: Econ, a: Args, ctx: Ctx) => unknown> = {
  startUnlock: (e, a, ctx) => startUnlock(e, num(a.i), ctx),
  openSlot: (e, a, ctx) => openSlot(e, num(a.i), a.pay === true, ctx),
  gacha: (e, a, ctx) => (a.n === 10 ? gacha(e, 10, ctx) : gacha(e, 1, ctx)),
  upgradeUnit: (e, a) => upgradeUnit(e, str(a.job) as Job),
  buyUnit: (e, a) => buyUnit(e, str(a.job) as Job),
  research: (e, a) => research(e, str(a.key) as ResearchKey),
  useItem: (e, a) => (['summonTicket', 'mythicTicket', 'goldBooster'].includes(str(a.key)) ? useItem(e, str(a.key) as ItemKey) : false),
  claimRoad: (e, _a, ctx) => claimRoad(e, ctx),
  adReward: (e, a, ctx) => adReward(e, a.kind === 'double' ? 'double' : 'tickets', ctx),
  claimStarReward: (e, a) => claimStarReward(e, num(a.chapter), num(a.goal)),
  claimQuest: (e, a, ctx) => claimQuest(e, str(a.key), ctx),
  claimAchievement: (e, a) => claimAchievement(e, str(a.key)),
  claimSeason: (e, a, ctx) => claimSeason(e, num(a.tier), a.premium === true, ctx),
  claimMonthly: (e, _a, ctx) => claimMonthly(e, ctx),
};
