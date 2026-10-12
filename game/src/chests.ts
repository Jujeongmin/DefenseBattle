// ============================================================
//  상자 · 뽑기 화면 - 상자 칸 상태와 카드 공개 창 (열기·뽑기 규칙은 econ/rules.ts, 동작은 econ.act)
//   상자: 대전 승리 시 칸(4)에 들어감 → 하나씩 열기 시작(시간) → 다 되면 열기. 보석으로 바로 열기.
//   뽑기: 보석으로 카드 묶음 (10회는 영웅 이상 보장)
//  카드가 나오면 '카드 공개' 창에서 하나씩 보여 주고, 레벨업할 수 있으면 표시한다.
// ============================================================
import { CHESTS, UNIT_BY_ID, RARITY_KR, RARITY_COLOR, UNIT_MAX_LEVEL, cardsNeeded } from './config';
import { meta } from './meta';
import { unitLevel } from './progress';
import { unitIconUrl } from './assets';
import { audio } from './audio';
import { icon } from './icons';
import { openOverlay, spriteIcon } from './dom';
import type { Rarity } from './types';

export type { CardDrop, Reveal } from './econ/rules';
import type { Reveal } from './econ/rules';

const HOUR = 60 * 60 * 1000;

// ---------- 상자 칸 ----------
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
