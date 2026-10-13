// ============================================================
//  유닛 말풍선 - 마우스를 올리거나(PC) 탭하면(모바일) 요소 위에 띄운다. 다른 곳을 누르거나 스크롤하면 닫힌다.
//   data-tip-unit="<job>"  : 유닛 이름·등급·역할·보유 레벨 (몹 카드의 '막는 유닛')
//   data-tip-skill="<job>" : 유닛 스킬 이름·설명 (유닛 카드의 ?)
//   data-tip-item="<item>" : 아이템 이름·설명 (상점 '보유')
// ============================================================
import { UNIT_BY_ID, RARITY_KR, RARITY_COLOR, SKILL_KR, SKILL_DESC, ITEM_KR } from './config';
import { meta } from './meta';
import type { Job } from './types';

import { tl } from './i18n';
let tip: HTMLDivElement | null = null;
let anchor: HTMLElement | null = null;
let lastPointer = 'mouse';
let anchorTop = 0; // 띄울 때 아이콘 위치 (스크롤로 실제로 움직였을 때만 닫는다)
let lastWidth = 0;

function hide(): void {
  tip?.classList.remove('show');
  anchor = null;
}
/** 모바일은 터치 순간 아주 작은 스크롤·주소창 크기 이벤트가 생겨 뜨자마자 닫혀 버렸다 → 아이콘이 실제로 움직였을 때만 */
function hideIfMoved(): void {
  if (!anchor || performance.now() - shownAt < 400) return; // 탭 직후 관성 스크롤·주소창 변화는 무시
  if (Math.abs(anchor.getBoundingClientRect().top - anchorTop) > 8) hide();
}

function content(el: HTMLElement): string | null {
  const item = ITEM_KR[el.dataset.tipItem as keyof typeof ITEM_KR];
  if (item) return `<div class="ut-name">${item.kr}</div><div class="ut-desc">${item.desc}</div>`;
  const skill = el.dataset.tipSkill as Job | undefined;
  if (skill && SKILL_KR[skill]) return `<div class="ut-name">${SKILL_KR[skill]}</div><div class="ut-desc">${SKILL_DESC[skill]}</div>`;
  const job = el.dataset.tipUnit as Job;
  const u = UNIT_BY_ID[job];
  if (!u) return null;
  const lv = meta.units[job];
  return `<div class="ut-name">${u.kr} <span style="color:${RARITY_COLOR[u.rarity]}">${RARITY_KR[u.rarity]}</span></div>
    <div class="ut-role">${u.role}</div>
    <div class="ut-own ${lv ? '' : 'no'}">${lv ? tl('보유 Lv.{0}', lv) : tl('미보유')}</div>`;
}

function show(el: HTMLElement): void {
  const html = content(el);
  if (!html) return;
  if (!tip) {
    tip = document.createElement('div');
    tip.className = 'unit-tip';
    document.body.appendChild(tip);
  }
  tip.innerHTML = html;
  tip.classList.toggle('wide', !!el.dataset.tipSkill || !!el.dataset.tipItem);
  anchor = el;
  // 아이콘 바로 위 가운데 (화면 밖으로 나가지 않게)
  const r = el.getBoundingClientRect();
  anchorTop = r.top;
  lastWidth = window.innerWidth;
  tip.classList.add('show');
  const w = tip.offsetWidth, h = tip.offsetHeight;
  const x = Math.max(6, Math.min(window.innerWidth - w - 6, r.left + r.width / 2 - w / 2));
  const above = r.top - h - 6;
  const y = above >= 6 ? above : r.bottom + 6;
  tip.style.left = `${x}px`;
  tip.style.top = `${y}px`;
  tip.classList.toggle('below', above < 6);
}

const target = (e: Event) => (e.target as HTMLElement | null)?.closest?.<HTMLElement>('[data-tip-unit],[data-tip-skill],[data-tip-item]') ?? null;

/**
 * 진짜 마우스 올리기만 hover 로 친다. 휴대폰·웹뷰는 터치 뒤에 pointerType 'mouse' 인 over/out 을 흉내 내 보내기도 해서,
 * 그걸 받으면 over 로 열린 말풍선을 바로 뒤 click 이 '같은 아이콘 다시 누름'으로 보고 닫아 버렸다.
 */
const realHover = (e: PointerEvent) => e.pointerType === 'mouse' && matchMedia('(hover: hover)').matches;
let shownAt = 0;

export function initUnitTips(): void {
  document.addEventListener('pointerover', (e) => {
    if (!realHover(e)) return;
    const el = target(e);
    if (el && el !== anchor) { show(el); shownAt = performance.now(); }
  });
  document.addEventListener('pointerout', (e) => {
    if (!realHover(e) || !anchor) return;
    if (target(e) === anchor && !anchor.contains(e.relatedTarget as Node | null)) hide();
  });
  // 탭: 아이콘이면 띄우고(터치로 같은 아이콘을 다시 누르면 닫기), 다른 곳이면 닫기
  document.addEventListener('pointerdown', (e) => { lastPointer = e.pointerType; }, true);
  document.addEventListener('click', (e) => {
    const el = target(e);
    if (!el) hide();
    else if (el === anchor) {
      // 같은 아이콘을 다시 누르면 닫기 - 단, 방금(같은 탭에서) 열린 것이면 그대로 둔다
      if (lastPointer !== 'mouse' && performance.now() - shownAt > 400) hide();
    } else { show(el); shownAt = performance.now(); }
  }, true);
  window.addEventListener('scroll', hideIfMoved, true);
  window.addEventListener('resize', () => { if (window.innerWidth !== lastWidth) hide(); else hideIfMoved(); });
}
