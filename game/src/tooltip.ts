// ============================================================
//  유닛 말풍선 - data-tip-unit="<job>" 이 붙은 아이콘에 마우스를 올리거나(PC) 탭하면(모바일)
//  유닛 이름·등급·역할·보유 레벨을 아이콘 위에 띄운다. 다른 곳을 누르거나 스크롤하면 닫힌다.
// ============================================================
import { UNIT_BY_ID, RARITY_KR, RARITY_COLOR } from './config';
import { meta } from './meta';
import type { Job } from './types';

let tip: HTMLDivElement | null = null;
let anchor: HTMLElement | null = null;
let lastPointer = 'mouse';

function hide(): void {
  tip?.classList.remove('show');
  anchor = null;
}

function show(el: HTMLElement): void {
  const job = el.dataset.tipUnit as Job;
  const u = UNIT_BY_ID[job];
  if (!u) return;
  if (!tip) {
    tip = document.createElement('div');
    tip.className = 'unit-tip';
    document.body.appendChild(tip);
  }
  const lv = meta.units[job];
  tip.innerHTML = `<div class="ut-name">${u.kr} <span style="color:${RARITY_COLOR[u.rarity]}">${RARITY_KR[u.rarity]}</span></div>
    <div class="ut-role">${u.role}</div>
    <div class="ut-own ${lv ? '' : 'no'}">${lv ? `보유 Lv.${lv}` : '미보유'}</div>`;
  anchor = el;
  // 아이콘 바로 위 가운데 (화면 밖으로 나가지 않게)
  const r = el.getBoundingClientRect();
  tip.classList.add('show');
  const w = tip.offsetWidth, h = tip.offsetHeight;
  const x = Math.max(6, Math.min(window.innerWidth - w - 6, r.left + r.width / 2 - w / 2));
  const above = r.top - h - 6;
  const y = above >= 6 ? above : r.bottom + 6;
  tip.style.left = `${x}px`;
  tip.style.top = `${y}px`;
  tip.classList.toggle('below', above < 6);
}

const target = (e: Event) => (e.target as HTMLElement | null)?.closest?.<HTMLElement>('[data-tip-unit]') ?? null;

export function initUnitTips(): void {
  document.addEventListener('pointerover', (e) => {
    if (e.pointerType !== 'mouse') return;
    const el = target(e);
    if (el && el !== anchor) show(el);
  });
  document.addEventListener('pointerout', (e) => {
    if (e.pointerType !== 'mouse' || !anchor) return;
    if (target(e) === anchor && !anchor.contains(e.relatedTarget as Node | null)) hide();
  });
  // 탭: 아이콘이면 띄우고(터치로 같은 아이콘을 다시 누르면 닫기), 다른 곳이면 닫기
  document.addEventListener('pointerdown', (e) => { lastPointer = e.pointerType; }, true);
  document.addEventListener('click', (e) => {
    const el = target(e);
    if (!el) hide();
    else if (el === anchor && lastPointer !== 'mouse') hide();
    else show(el);
  }, true);
  window.addEventListener('scroll', hide, true);
  window.addEventListener('resize', hide);
}
