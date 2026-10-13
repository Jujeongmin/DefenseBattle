
import { tl } from './i18n';// ============================================================
//  DOM 헬퍼 - 패널/모달/토스트 공용
// ============================================================
export const $ = <T extends HTMLElement = HTMLElement>(id: string): T =>
  document.getElementById(id) as T;

/** 토스트. msg 는 HTML (아이콘 포함) - 사용자 입력 문자열을 넣지 말 것 */
export function toast(msg: string, ms = 2200): void {
  const layer = $('toast-layer');
  const t = document.createElement('div');
  t.className = 'toast';
  t.innerHTML = msg;
  layer.appendChild(t);
  setTimeout(() => t.remove(), ms);
}

/** 창 안의 항목을 위에서부터 차례로 톡톡 등장시킨다 (style.css .pop-in) */
const LIST_SEL = '.unit-grid, .deck-row, .stage-grid, .rewards, .btns, .tab-row, .road-list, .shop-grid';
export function popIn(root: HTMLElement): void {
  const dlg = root.classList.contains('dialog') ? root : root.querySelector<HTMLElement>('.dialog');
  if (!dlg) return;
  const items: HTMLElement[] = [];
  for (const c of Array.from(dlg.children) as HTMLElement[]) {
    if (c.tagName === 'H2' || c.classList.contains('close-x')) continue;
    if (c.matches(LIST_SEL)) items.push(...(Array.from(c.children) as HTMLElement[]));
    else {
      const list = c.querySelector<HTMLElement>(LIST_SEL);
      if (list && c.children.length === 1) items.push(...(Array.from(list.children) as HTMLElement[]));
      else items.push(c);
    }
  }
  items.forEach((it, i) => { it.style.setProperty('--i', String(Math.min(i, 14))); it.classList.add('pop-in'); });
}

const CLOSE_MS = 160;
/** 오버레이 패널 열기. 배경 탭/닫기 버튼(.close-x, [data-close])으로 닫힘 */
export function openOverlay(id: string, html: string, onClose?: () => void): HTMLElement {
  const el = $(id) as HTMLElement & { _closeTimer?: ReturnType<typeof setTimeout>; _openedAt?: number };
  // 닫히는 중에 다시 열면: 닫기를 취소하고 새로 연다
  const closing = el.classList.contains('closing');
  if (el._closeTimer) { clearTimeout(el._closeTimer); el._closeTimer = undefined; }
  el.classList.remove('closing');
  // 이미 열린 패널을 다시 그리는 경우(버튼 클릭 후 갱신): 등장 애니메이션을 다시 틀지 않고
  // 스크롤 위치도 유지한다. 그렇지 않으면 버튼마다 창이 새로 열리는 것처럼 보인다.
  // 열자마자(0.5초 안) 다시 그리는 화면(트로피 로드 등)은 아직 여는 중이므로 등장 효과를 그대로 준다
  const opening = performance.now() - (el._openedAt ?? 0) < 500;
  const redraw = !closing && !opening && !el.classList.contains('hidden') && !!el.firstElementChild;
  if (!redraw && !opening) el._openedAt = performance.now();
  const scroll = redraw ? (el.querySelector('.dialog')?.scrollTop ?? 0) : 0;
  el.innerHTML = html;
  el.classList.remove('hidden');
  if (redraw) {
    const dlg = el.querySelector<HTMLElement>('.dialog');
    if (dlg) { dlg.classList.add('redraw'); dlg.scrollTop = scroll; }
  } else popIn(el);
  // 닫기: 창이 작아지며 사라진 뒤 숨긴다 (onClose 는 바로 - 다음 화면 로직이 기다리지 않게)
  const close = () => {
    if (el.classList.contains('hidden') || el.classList.contains('closing')) return;
    el.classList.add('closing');
    el._closeTimer = setTimeout(() => {
      el._closeTimer = undefined;
      el.classList.remove('closing');
      el.classList.add('hidden');
      el.innerHTML = '';
    }, CLOSE_MS);
    onClose?.();
  };
  el.onclick = (e) => { if (e.target === el) close(); };
  el.querySelectorAll<HTMLElement>('.close-x, [data-close]').forEach((b) => { b.onclick = close; });
  (el as HTMLElement & { _close?: () => void })._close = close;
  return el;
}

export function closeOverlay(id: string): void {
  const el = $(id) as HTMLElement & { _close?: () => void };
  if (el._close) el._close();
  else el.classList.add('hidden');
}

/** 이벤트 위임: 패널 안 [data-act] 버튼 클릭 → handlers[act](button) */
export function bindActions(root: HTMLElement, handlers: Record<string, (el: HTMLElement) => void>): void {
  root.querySelectorAll<HTMLElement>('[data-act]').forEach((b) => {
    const fn = handlers[b.dataset.act!];
    if (fn) b.onclick = (e) => { e.stopPropagation(); fn(b); };
  });
}

/** 확인 모달 */
export function confirmModal(title: string, body: string, ok = tl('확인'), cancel = tl('취소')): Promise<boolean> {
  return new Promise((resolve) => {
    const el = openOverlay('modal', `<div class="dialog" style="text-align:center">
      <h2>${title}</h2><div style="margin-bottom:12px">${body}</div>
      <div style="display:flex;gap:8px"><button class="btn" style="flex:1" data-act="no">${cancel}</button>
      <button class="btn green" style="flex:1" data-act="yes">${ok}</button></div></div>`, () => resolve(false));
    bindActions(el, {
      yes: () => { el.onclick = null; el.classList.add('hidden'); el.innerHTML = ''; resolve(true); },
      no: () => closeOverlay('modal'),
    });
  });
}

/** 스프라이트 시트 1프레임 아이콘 HTML */
export function spriteIcon(url: string, cls = 'frame-sprite', style = ''): string {
  return `<div class="${cls}" style="background-image:url(${url});${style}"></div>`;
}
