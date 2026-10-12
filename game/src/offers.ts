// ============================================================
//  결제 팝업 - 중요한 순간에 한정 상품을 띄운다
//   · 패배 연속(대전 2연패 / 스테이지 2연속 실패) → 다시 일어서기 패키지
//   · 새 아레나 승급 → 승급 축하 패키지,  새 챕터 도달 → 새 챕터 패키지
//   · 보석 부족(강화·연구·해금) → 모자란 만큼의 보석 상품 / 그 유닛 패키지
//  빈도(보통): 판이 끝날 때 최대 하나, 같은 한정 상품 팝업은 하루 한 번. 한정 상품은 24시간 동안 상점에도 보인다.
// ============================================================
import {
  PRODUCT_BY_ID, PRODUCTS, OFFER_PRODUCT, OFFER_HOURS, UNIT_PACK, ITEM_KR, UNIT_BY_ID,
  productEfficiency, type OfferKind, type ProductDef,
} from './config';
import { meta, saveMeta } from './meta';
import { purchase, productOwned } from './shop';
import { pendingReveals, flushReveals } from './chests';
import { getPlatform } from './platform';
import { unitIconUrl } from './assets';
import { audio } from './audio';
import { icon } from './icons';
import { openOverlay, closeOverlay, bindActions, spriteIcon, toast } from './dom';
import type { ItemKey, Job } from './types';

const HOUR = 60 * 60 * 1000;

export function offerActive(id: string): boolean {
  return (meta.offers[id] ?? 0) > Date.now();
}
/** 지금 떠 있는 한정 상품 (상점 '한정 특가' 칸) */
export function activeOffers(): ProductDef[] {
  return PRODUCTS.filter((p) => p.category === 'offer' && offerActive(p.id));
}
export function timeLeft(id: string): string {
  const ms = Math.max(0, (meta.offers[id] ?? 0) - Date.now());
  const h = Math.floor(ms / HOUR), m = Math.floor((ms % HOUR) / 60000), s = Math.floor((ms % 60000) / 1000);
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
/** 유닛 패키지를 아직 살 수 있나 (안 샀고, 그 유닛이 Lv5 미만) */
export function unitPackAvailable(job: Job): string | null {
  const id = UNIT_PACK[job];
  if (!id || productOwned(id)) return null;
  return (meta.units[job] ?? 0) < (PRODUCT_BY_ID[id].grant.units?.[job] ?? 5) ? id : null;
}

const price = (id: string) => getPlatform().priceOf(id) ?? PRODUCT_BY_ID[id].vx;

/** 상품 구성 줄 (보석·아이템·유닛) */
function grantRows(p: ProductDef): string {
  const g = p.grant;
  const rows: string[] = [];
  for (const [j, lv] of Object.entries(g.units ?? {})) {
    rows.push(`<div class="og-row">${spriteIcon(unitIconUrl(j as Job), 'frame-sprite og-unit')}<span>${UNIT_BY_ID[j as Job].kr} <b>Lv${lv}</b></span></div>`);
  }
  if (g.crystals) rows.push(`<div class="og-row">${icon('gem')}<span>보석 <b>${g.crystals.toLocaleString()}</b></span></div>`);
  for (const [k, n] of Object.entries(g.items ?? {})) {
    const it = ITEM_KR[k as ItemKey];
    rows.push(`<div class="og-row">${icon(it.icon)}<span>${it.kr} <b>×${n}</b></span></div>`);
  }
  return rows.join('');
}

/** 상품 팝업 하나 (한정 상품이면 남은 시간도) */
function popup(id: string, title: string, why: string, onDone?: () => void): void {
  const p = PRODUCT_BY_ID[id];
  const eff = productEfficiency(p, price(id));
  const limited = p.category === 'offer';
  const el = openOverlay('modal', `<div class="dialog offer-dialog"><button class="close-x">${icon('close')}</button>
    <h2>${title}</h2>
    <div class="offer-why">${why}</div>
    <div class="offer-box">${eff > 100 ? `<span class="eff">효율<b>${eff}%</b></span>` : ''}
      <img class="offer-img" src="/ui/shop/${p.id}.png" alt="">
      <div class="offer-name">${p.kr}</div>
      <div class="offer-grant">${grantRows(p)}</div>
    </div>
    ${limited ? `<div class="offer-timer">${icon('timer')} <span id="offer-left">${timeLeft(id)}</span> 남음</div>` : ''}
    <button class="btn gold offer-buy" data-act="buy">VX ${price(id)}</button>
    <button class="btn offer-later" data-close>다음에</button></div>`, onDone);
  // 남은 시간 1초마다
  if (limited) {
    const t = setInterval(() => {
      const span = document.getElementById('offer-left');
      if (!span || !offerActive(id)) { clearInterval(t); return; }
      span.textContent = timeLeft(id);
    }, 1000);
  }
  bindActions(el, {
    buy: async (b) => {
      (b as HTMLButtonElement).disabled = true;
      const got = await purchase(id);
      if (got.length) {
        audio.fanfareUnlock();
        toast(`구매 완료: ${p.kr}`);
        closeOverlay('modal');
        if (pendingReveals.length) setTimeout(() => flushReveals(), 250); // 상자 상품이면 공개
      } else {
        toast('결제가 완료되지 않았어요');
        (b as HTMLButtonElement).disabled = false;
      }
    },
  });
}

const OFFER_TEXT: Record<OfferKind, { title: string; why: string }> = {
  comeback: { title: '다시 일어서기!', why: '연속으로 졌어요. 소환권과 보석으로 덱을 다시 키워 보세요' },
  arena: { title: '아레나 승급 축하!', why: '새 아레나에 올랐어요. 승급 기념 특가' },
  chapter: { title: '새 챕터 열림!', why: '다음 챕터는 더 강한 몹이 나와요. 미리 준비하세요' },
};

/** 한정 상품 띄우기 (같은 상품 팝업은 하루 한 번). 띄웠으면 true */
function tryOffer(kind: OfferKind): boolean {
  const id = OFFER_PRODUCT[kind];
  if (Date.now() - (meta.offerShownAt[id] ?? 0) < 24 * HOUR) return false;
  if (!offerActive(id)) meta.offers[id] = Date.now() + OFFER_HOURS * HOUR;
  meta.offerShownAt[id] = Date.now();
  saveMeta();
  setTimeout(() => popup(id, OFFER_TEXT[kind].title, OFFER_TEXT[kind].why), 700); // 결과 화면이 먼저 보이게
  return true;
}

/** 판이 끝난 뒤 (결과 화면 위). 판마다 최대 하나: 승급·챕터 > 연패 */
export function afterMatch(ev: { tierUp?: boolean; chapterUp?: boolean; losing?: boolean }): void {
  if (ev.tierUp && tryOffer('arena')) return;
  if (ev.chapterUp && tryOffer('chapter')) return;
  if (ev.losing) tryOffer('comeback');
}

/** 보석 부족: 그 유닛 패키지(해금 중이면) 또는 모자란 만큼을 채우는 가장 작은 보석 상품 */
export function showShortage(need: number, job?: Job, onDone?: () => void): void {
  const pack = job ? unitPackAvailable(job) : null;
  if (pack) {
    popup(pack, `${UNIT_BY_ID[job!].kr} 바로 받기`, `보석 ${need.toLocaleString()}개가 부족해요. 패키지로 바로 해금하고 Lv5까지 올려요`, onDone);
    return;
  }
  const gems = PRODUCTS.filter((p) => p.category === 'crystal').sort((a, b) => (a.grant.crystals ?? 0) - (b.grant.crystals ?? 0));
  const fit = gems.find((p) => (p.grant.crystals ?? 0) >= need) ?? gems[gems.length - 1];
  popup(fit.id, '보석이 부족해요', `보석 ${need.toLocaleString()}개가 더 필요해요`, onDone);
}
