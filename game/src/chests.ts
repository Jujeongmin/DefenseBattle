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
import type { Job, Rarity } from './types';

export type { CardDrop, Reveal } from './econ/rules';
import type { Reveal } from './econ/rules';

import { tl } from './i18n';
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
/** 여는 중인 상자 남은 시간 - 시:분:초 (1시간 미만이면 분:초) */
export function clockText(ms: number): string {
  const t = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), sec = t % 60;
  const two = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${two(m)}:${two(sec)}` : `${two(m)}:${two(sec)}`;
}
export function leftText(ms: number): string {
  const m = Math.ceil(ms / 60000);
  return m >= 60 ? tl('{0}시간{1}', Math.floor(m / 60), m % 60 ? tl(' {0}분', m % 60) : '') : tl('{0}분', m);
}

// ---------- 카드 공개 창 ----------
/** 결제로 받은 상자 등, 나중에 보여 줄 공개 내용 */
export const pendingReveals: Reveal[] = [];

const RANK: Record<Rarity, number> = { common: 0, rare: 1, epic: 2, legendary: 3 };
/** 상자 연출 시간 (ms): 떨어짐 → 흔들림 3번 → 터짐 → 카드 */
const T_SHAKES = [520, 860, 1200];
const T_BURST = 1480;
const T_CARDS = 1760;

/**
 * 카드 공개 연출: 상자가 떨어져 세 번 흔들리고(영웅 이상이 있으면 마지막 흔들림이 그 등급 색으로 빛남)
 * 빛과 함께 터진 뒤, 카드가 낮은 등급부터 한 장씩 뒤집힌다 (영웅·전설은 뜸을 들여 크게). 화면을 탭하면 건너뛴다.
 */
/** 공개 창 제목 (서버가 보낸 제목은 한국어라 종류로 다시 만든다) */
function revealTitle(r: Reveal): string {
  if (r.kind === 'gacha') return tl('유닛 뽑기 {0}회', (r.title.match(/\d+/) ?? ['1'])[0]);
  if (r.kind) return CHESTS[r.kind].kr;
  return r.title;
}

export function showReveal(r: Reveal, onDone?: () => void): void {
  const drops = [...r.drops].reverse(); // 낮은 등급부터 → 가장 좋은 카드가 마지막
  const rar = (d: { job: Job }) => UNIT_BY_ID[d.job].rarity;
  const best = drops.reduce<Rarity>((b, d) => (RANK[rar(d)] > RANK[b] ? rar(d) : b), 'common');
  // 연출 색: 상자는 상자 색, 뽑기는 나온 카드 중 가장 높은 등급 색 (일반 회색 · 희귀 파랑 · 영웅 보라 · 전설 금색)
  const box = r.kind && r.kind !== 'gacha' ? CHESTS[r.kind].color : RARITY_COLOR[best];
  // 카드마다 나오는 시각 (영웅 이상은 뜸을 들인다)
  let t = 0;
  const delays = drops.map((d) => (t += RANK[rar(d)] >= 2 ? 620 : 200));
  const end = t + 450;
  const rows = drops.map((d, i) => {
    const u = UNIT_BY_ID[d.job];
    const lv = unitLevel(d.job);
    const need = cardsNeeded(u.rarity, lv);
    const have = meta.cards[d.job] ?? 0;
    const pctOf = (n: number) => (lv >= UNIT_MAX_LEVEL ? 100 : Math.min(100, (n / need) * 100));
    const ready = lv < UNIT_MAX_LEVEL && have >= need;
    return `<div class="rv-card r-${u.rarity} ${RANK[u.rarity] >= 2 ? 'big' : ''}" style="--rc:${RARITY_COLOR[u.rarity]};--d:${delays[i]}ms">
      ${d.fresh ? '<span class="rv-new">NEW</span>' : ''}
      ${spriteIcon(unitIconUrl(d.job))}
      <div class="rv-n">×${d.n}</div>
      <div class="rv-name">${u.kr}</div>
      <div class="rv-bar ${ready ? 'ready' : ''}"><div style="--from:${pctOf(Math.max(0, have - d.n))}%;width:${pctOf(have)}%"></div><span>${ready ? tl('레벨업!') : `${have}/${need}`}</span></div>
    </div>`;
  }).join('');
  const el = openOverlay('modal', `<div class="rv-scene" style="--cc:${box};--hc:${RARITY_COLOR[best]}">
      <div class="rv-rays"></div>
      <div class="rv-box ${RANK[best] >= 2 ? 'hint' : ''}">${r.kind === 'gacha' ? icon('summon') : icon('chest')}</div>
      <div class="rv-flash"></div>
      <div class="rv-skip">${tl('탭해서 건너뛰기')}</div>
    </div>
    <div class="dialog reveal-dialog rv-wait" style="--end:${end}ms"><button class="close-x">${icon('close')}</button>
    <h2>${revealTitle(r)}</h2>
    ${r.gems ? `<div class="rv-gems">${icon('gem')} +${r.gems}</div>` : ''}
    <div class="rv-grid">${rows}</div>
    <div class="fine">${Object.entries(RARITY_KR).map(([k, v]) => `<span style="color:${RARITY_COLOR[k as Rarity]}">■</span>${v}`).join(' ')}</div>
    <button class="btn red rv-ok" data-close>${tl('확인')}</button></div>`, onDone);

  const scene = el.querySelector<HTMLElement>('.rv-scene')!;
  const dlg = el.querySelector<HTMLElement>('.reveal-dialog')!;
  const timers: ReturnType<typeof setTimeout>[] = [];
  const at = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms));
  let done = false;
  const showCards = (skip: boolean) => {
    scene.remove();
    dlg.classList.remove('rv-wait');
    dlg.classList.add('rv-go');
    if (skip) dlg.classList.add('rv-fast');
  };
  // 연출 중 탭: 창을 닫지 않고 끝까지 건너뛴다
  const onTap = (e: Event) => {
    if (done) return;
    e.stopPropagation();
    e.preventDefault();
    timers.forEach(clearTimeout);
    if (scene.isConnected) audio.fanfareUnlock();
    showCards(true);
    finish();
  };
  const finish = () => { done = true; el.removeEventListener('click', onTap, true); };
  el.addEventListener('click', onTap, true);

  T_SHAKES.forEach((ms) => at(ms, () => audio.button()));
  at(T_BURST, () => { scene.classList.add('burst'); if (best === 'legendary') audio.summon(true); else audio.fanfareUnlock(); });
  at(T_CARDS, () => showCards(false));
  drops.forEach((d, i) => at(T_CARDS + delays[i], () => (RANK[rar(d)] >= 2 ? audio.summon(rar(d) === 'legendary') : audio.coin())));
  at(T_CARDS + end, finish);
}
/** 쌓인 공개 내용을 차례로 */
export function flushReveals(onDone?: () => void): void {
  const r = pendingReveals.shift();
  if (!r) { onDone?.(); return; }
  showReveal(r, () => flushReveals(onDone));
}
