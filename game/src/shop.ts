// ============================================================
//  상점 - 결제 → 지급 확인 (지급 자체는 온라인이면 서버 결제 훅, 오프라인 데모면 econ.grantLocal)
//  + 월정액 일일 수령 / 시즌 패스 보상 수령 (모두 econ 동작)
// ============================================================
import { PRODUCT_BY_ID, SEASON_TIERS, SEASON_XP_PER_TIER, type SeasonReward } from './config';
import { meta, saveMeta, todayStr, currentSeasonId } from './meta';
import { pendingReveals } from './chests';
import { getPlatform } from './platform';
import { act, online, grantLocal, claimPurchasesOnline } from './econ';

const DAY = 24 * 60 * 60 * 1000;
import type { ItemKey, PurchaseRecord } from './types';
import { icon, type IconName } from './icons';

/** 오프라인 데모 결제 기록 지급 (이미 지급한 purchaseId 는 건너뜀) */
function grantLocalPurchases(list: PurchaseRecord[]): string[] {
  const granted: string[] = [];
  for (const p of list) {
    if (meta.grantedPurchases.includes(p.purchaseId)) continue;
    const def = PRODUCT_BY_ID[p.productId];
    if (!def) { console.warn('[shop] 알 수 없는 상품', p.productId); continue; }
    pendingReveals.push(...grantLocal(def.id, Math.max(1, p.quantity || 1)));
    meta.grantedPurchases.push(p.purchaseId);
    granted.push(def.id);
  }
  if (meta.grantedPurchases.length > 200) meta.grantedPurchases = meta.grantedPurchases.slice(-200);
  if (granted.length) saveMeta();
  return granted;
}

/** 지급된 구매 받기 (온라인: 서버가 이미 지급 - 상태·상자 공개만 받음). 받은 상품 id 목록 */
export async function syncPurchases(): Promise<string[]> {
  let ids: string[];
  if (online()) {
    try {
      const r = await claimPurchasesOnline();
      for (const it of r.list) pendingReveals.push(...(it.reveals ?? []));
      ids = r.list.map((it) => it.productId);
    } catch (e) { console.warn('[shop] 구매 수령 실패', e); return []; }
  } else {
    ids = grantLocalPurchases(await getPlatform().claimPurchases());
  }
  for (const id of ids) if (PRODUCT_BY_ID[id]?.category === 'offer') delete meta.offers[id]; // 산 한정 상품은 닫는다
  if (ids.length) saveMeta();
  return ids;
}

/** 결제 → 지급까지. 성공 시 지급된 상품 id 목록 */
export async function purchase(productId: string): Promise<string[]> {
  const def = PRODUCT_BY_ID[productId];
  if (!def || (def.oneTime && meta.oneTime[def.id])) return [];
  const ok = await getPlatform().buy(productId);
  if (!ok) return [];
  // Verse8 은 서버 훅이 지급하기까지 약간 지연될 수 있어 몇 번 재시도
  for (let i = 0; i < 5; i++) {
    const got = await syncPurchases();
    if (got.length) return got;
    await new Promise((r) => setTimeout(r, 800));
  }
  return [];
}

export function productOwned(productId: string): boolean {
  const def = PRODUCT_BY_ID[productId];
  if (!def) return false;
  if (def.id === 'ad_remove') return meta.adRemoved;
  if (def.id === 'season_premium') return meta.season.premium && meta.season.id === currentSeasonId();
  return !!(def.oneTime && meta.oneTime[def.id]);
}

// ---------- 월정액 ----------
export function monthlyActive(): boolean {
  return meta.monthly.expires > Date.now();
}
export function monthlyDaysLeft(): number {
  return Math.max(0, Math.ceil((meta.monthly.expires - Date.now()) / DAY));
}
export function canClaimMonthly(): boolean {
  return monthlyActive() && meta.monthly.lastClaim !== todayStr();
}
export async function claimMonthly(): Promise<number> {
  if (!canClaimMonthly()) return 0;
  return act<number>('claimMonthly');
}

// ---------- 시즌 패스 ----------
export function seasonTier(): number {
  return Math.min(SEASON_TIERS.length, Math.floor(meta.season.xp / SEASON_XP_PER_TIER));
}
/** tier: 1부터. premium 트랙은 시즌 패스 보유 시만 */
export async function claimSeasonReward(tier: number, premium: boolean): Promise<boolean> {
  return act<boolean>('claimSeason', { tier, premium });
}
export function rewardText(r: SeasonReward): string {
  const parts: string[] = [];
  if (r.crystals) parts.push(`${icon('gem')}${r.crystals}`);
  if (r.items) {
    const icons: Record<ItemKey, IconName> = { gachaTicket: 'ticket', goldBooster: 'bag' };
    for (const [k, n] of Object.entries(r.items)) if (n) parts.push(`${icon(icons[k as ItemKey])}${n}`);
  }
  return parts.join(' ');
}
