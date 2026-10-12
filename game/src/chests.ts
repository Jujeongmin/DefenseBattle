// ============================================================
//  상자 · 뽑기 - 유닛 카드를 준다 (중복 카드 = 레벨업 재료)
//   상자: 대전 승리 시 칸(4)에 들어감 → 하나씩 열기 시작(시간) → 다 되면 열기. 보석으로 바로 열기.
//   뽑기: 보석으로 카드 묶음 (10회는 영웅 이상 보장)
//  카드가 나오면 '카드 공개' 창에서 하나씩 보여 주고, 레벨업할 수 있으면 표시한다.
// ============================================================
import {
  CHESTS, CHEST_CYCLE, GACHA, UNITS, UNIT_BY_ID, PVP_TIERS, RARITY_KR, RARITY_COLOR, UNIT_MAX_LEVEL,
  chestOpenCost, cardsNeeded, type ChestKind,
} from './config';
import { meta, saveMeta } from './meta';
import { addCards, unitLevel } from './progress';
import { unitIconUrl } from './assets';
import { audio } from './audio';
import { icon } from './icons';
import { openOverlay, spriteIcon } from './dom';
import type { Job, Rarity } from './types';

export interface CardDrop { job: Job; n: number; fresh: boolean }
export interface Reveal { title: string; drops: CardDrop[]; gems: number }

const HOUR = 60 * 60 * 1000;
const pick = <T>(a: T[]): T => a[Math.floor(Math.random() * a.length)];
const arenaIdx = () => Math.max(0, PVP_TIERS.filter((t) => meta.pvp.trophies >= t.min).length - 1);
const pool = (r: Rarity) => UNITS.filter((u) => u.rarity === r).map((u) => u.id);

/** n 장을 그 등급 유닛 k 종에 나눠 담는다 */
function split(r: Rarity, n: number, k: number, out: Map<Job, number>): void {
  if (n <= 0) return;
  const jobs = [...pool(r)].sort(() => Math.random() - 0.5).slice(0, Math.max(1, Math.min(k, n)));
  for (let i = 0; i < n; i++) { const j = jobs[i % jobs.length]; out.set(j, (out.get(j) ?? 0) + 1); }
}

/** 상자 내용 굴리기 */
export function rollChest(kind: ChestKind): { cards: Map<Job, number>; gems: number } {
  const d = CHESTS[kind];
  const a = arenaIdx();
  const total = d.cards + d.perArena * a;
  const epic = Math.floor(d.epic) + (Math.random() < d.epic % 1 ? 1 : 0);
  const legend = Math.random() < d.legendary ? 1 : 0;
  const rare = Math.min(total - epic - legend, Math.round(d.rare * (1 + a * 0.25)));
  const common = Math.max(0, total - rare - epic - legend);
  const cards = new Map<Job, number>();
  split('common', common, 3, cards);
  split('rare', rare, 2, cards);
  split('epic', epic, epic, cards);
  split('legendary', legend, 1, cards);
  const gems = d.gems[0] + Math.floor(Math.random() * (d.gems[1] - d.gems[0] + 1));
  return { cards, gems };
}

/** 카드·보석 지급 → 공개 창용 목록 (희귀한 것부터) */
function grant(cards: Map<Job, number>, gems: number): CardDrop[] {
  meta.crystals += gems;
  const order: Record<Rarity, number> = { legendary: 0, epic: 1, rare: 2, common: 3 };
  const drops = [...cards].map(([job, n]) => ({ job, n, fresh: addCards(job, n) }));
  saveMeta();
  return drops.sort((x, y) => order[UNIT_BY_ID[x.job].rarity] - order[UNIT_BY_ID[y.job].rarity]);
}

/** 상자 바로 열기 (상점 구매·트로피 로드) - 공개 내용 반환 */
export function openChestNow(kind: ChestKind): Reveal {
  const r = rollChest(kind);
  return { title: CHESTS[kind].kr, drops: grant(r.cards, r.gems), gems: r.gems };
}

// ---------- 상자 칸 ----------
/** 대전 승리 → 다음 순서 상자를 빈 칸에. 칸이 가득이면 null */
export function giveWinChest(): ChestKind | null {
  const i = meta.chests.findIndex((c) => !c);
  if (i < 0) return null;
  const kind = CHEST_CYCLE[meta.chestCycle % CHEST_CYCLE.length];
  meta.chestCycle += 1;
  meta.chests[i] = { kind };
  saveMeta();
  return kind;
}
export function opening(): number {
  return meta.chests.findIndex((c) => !!c?.openAt);
}
export function chestState(i: number): 'empty' | 'locked' | 'opening' | 'ready' {
  const c = meta.chests[i];
  if (!c) return 'empty';
  if (!c.openAt) return 'locked';
  return c.openAt <= Date.now() ? 'ready' : 'opening';
}
export function chestLeftMs(i: number): number {
  const c = meta.chests[i];
  return c?.openAt ? Math.max(0, c.openAt - Date.now()) : c ? CHESTS[c.kind].hours * HOUR : 0;
}
export function leftText(ms: number): string {
  const m = Math.ceil(ms / 60000);
  return m >= 60 ? `${Math.floor(m / 60)}시간${m % 60 ? ` ${m % 60}분` : ''}` : `${m}분`;
}
/** 열기 시작 (한 번에 하나) */
export function startUnlock(i: number): boolean {
  const c = meta.chests[i];
  if (!c || c.openAt || opening() >= 0) return false;
  c.openAt = Date.now() + CHESTS[c.kind].hours * HOUR;
  saveMeta();
  return true;
}
/** 다 된 상자 또는 보석으로 바로 열기 → 공개 내용 (보석 부족이면 null) */
export function openSlot(i: number, payGems: boolean): Reveal | null {
  const c = meta.chests[i];
  if (!c) return null;
  if (chestState(i) !== 'ready') {
    if (!payGems) return null;
    const cost = chestOpenCost(chestLeftMs(i));
    if (meta.crystals < cost) return null;
    meta.crystals -= cost;
  }
  meta.chests[i] = null;
  return openChestNow(c.kind);
}

// ---------- 뽑기 ----------
function rollRarity(): Rarity {
  let r = Math.random();
  for (const k of ['legendary', 'epic', 'rare', 'common'] as Rarity[]) {
    if (r < GACHA.rates[k]) return k;
    r -= GACHA.rates[k];
  }
  return 'common';
}
/** 뽑기 n 회 (1 또는 10). 보석 부족이면 null. 10회는 영웅 이상 1장 보장 */
export function gacha(n: 1 | 10): Reveal | null {
  const cost = n === 1 ? GACHA.one : GACHA.ten;
  if (meta.crystals < cost) return null;
  meta.crystals -= cost;
  const rolls = Array.from({ length: n }, rollRarity);
  if (n === 10 && !rolls.some((r) => r === 'epic' || r === 'legendary')) rolls[rolls.length - 1] = 'epic';
  const cards = new Map<Job, number>();
  for (const r of rolls) { const j = pick(pool(r)); cards.set(j, (cards.get(j) ?? 0) + GACHA.count[r]); }
  return { title: `유닛 뽑기 ${n}회`, drops: grant(cards, 0), gems: 0 };
}

// ---------- 카드 공개 창 ----------
/** 결제로 받은 상자 등, 나중에 보여 줄 공개 내용 */
export const pendingReveals: Reveal[] = [];

export function showReveal(r: Reveal, onDone?: () => void): void {
  audio.fanfareUnlock();
  const rows = r.drops.map((d) => {
    const u = UNIT_BY_ID[d.job];
    const lv = unitLevel(d.job);
    const need = cardsNeeded(u.rarity, lv);
    const have = meta.cards[d.job] ?? 0;
    const pct = lv >= UNIT_MAX_LEVEL ? 100 : Math.min(100, (have / need) * 100);
    const ready = lv < UNIT_MAX_LEVEL && have >= need;
    return `<div class="rv-card r-${u.rarity}" style="--rc:${RARITY_COLOR[u.rarity]}">
      ${d.fresh ? '<span class="rv-new">NEW</span>' : ''}
      ${spriteIcon(unitIconUrl(d.job))}
      <div class="rv-n">×${d.n}</div>
      <div class="rv-name">${u.kr}</div>
      <div class="rv-bar ${ready ? 'ready' : ''}"><div style="width:${pct}%"></div><span>${ready ? '레벨업!' : `${have}/${need}`}</span></div>
    </div>`;
  }).join('');
  openOverlay('modal', `<div class="dialog reveal-dialog"><button class="close-x">${icon('close')}</button>
    <h2>${r.title}</h2>
    ${r.gems ? `<div class="rv-gems">${icon('gem')} +${r.gems}</div>` : ''}
    <div class="rv-grid">${rows}</div>
    <div class="fine">${Object.entries(RARITY_KR).map(([k, v]) => `<span style="color:${RARITY_COLOR[k as Rarity]}">■</span>${v}`).join(' ')}</div>
    <button class="btn red" data-close>확인</button></div>`, onDone);
}
/** 쌓인 공개 내용을 차례로 */
export function flushReveals(onDone?: () => void): void {
  const r = pendingReveals.shift();
  if (!r) { onDone?.(); return; }
  showReveal(r, () => flushReveals(onDone));
}
