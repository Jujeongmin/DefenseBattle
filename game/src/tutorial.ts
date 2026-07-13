// ============================================================
//  첫 플레이 온보딩 (코치마크 튜토리얼)
//  - 첫 게임 시작 시 게임을 멈추고, 실제 UI 요소를 스포트라이트로
//    강조하며 소환→상성→적 종족→골드 순서로 안내한다.
//  - "소환" 단계는 플레이어가 직접 소환할 때까지 대기(learn-by-doing).
//  - 완료/건너뛰기 시 meta.tutorialDone 저장 후 다시 표시하지 않는다.
// ============================================================
import { ECONOMY } from './config';
import { markTutorialDone, meta } from './meta';
import { t } from './i18n';
import { audio } from './audio';
import type { Game } from './engine';

interface Step {
  target: string | null;    // 강조할 요소 CSS 선택자 (null = 화면 중앙)
  title: string;
  body: string;
  place: 'above' | 'below' | 'center';
  waitSummon?: boolean;     // true 면 유닛 소환 시 자동으로 다음 단계
}

let overlay: HTMLElement | null = null;

export function endTutorial(): void {
  if (overlay) { overlay.remove(); overlay = null; }
}

export function maybeStartTutorial(game: Game): void {
  if (meta.tutorialDone) return;
  startTutorial(game);
}

function startTutorial(game: Game): void {
  endTutorial(); // 혹시 남아있으면 제거
  game.paused = true;

  const steps: Step[] = [
    { target: '#btn-summon',   title: t('tut.summonTitle'), body: t('tut.summon', { cost: ECONOMY.summonCost }), place: 'above', waitSummon: true },
    { target: '#unit-stacks',  title: t('tut.stacksTitle'), body: t('tut.stacks'), place: 'above' },
    { target: '.top-left',     title: t('tut.raceTitle'),   body: t('tut.race'),   place: 'below' },
    { target: '#gold-badge',   title: t('tut.goldTitle'),   body: t('tut.gold'),   place: 'below' },
    { target: null,            title: '',                   body: '',              place: 'center' },
  ];

  overlay = document.createElement('div');
  overlay.id = 'tutorial-overlay';
  document.body.appendChild(overlay);

  let idx = 0;
  let waitingSummon = false;

  const finish = () => {
    markTutorialDone();
    game.paused = false;
    endTutorial();
  };

  // 소환 대기 단계: roster 이벤트로 유닛이 늘면 다음으로. (off 가 없어 가드 플래그 사용)
  game.on('roster', () => {
    if (waitingSummon && game.units.length > 0) {
      waitingSummon = false;
      next();
    }
  });

  const next = () => {
    idx += 1;
    if (idx >= steps.length) { finish(); return; }
    render();
  };

  const render = () => {
    if (!overlay) return;
    const step = steps[idx];
    waitingSummon = !!step.waitSummon;
    const last = idx === steps.length - 1;
    overlay.className = step.place === 'center' ? 'dimmed' : '';
    overlay.innerHTML = '';

    // 스포트라이트
    let rect: DOMRect | null = null;
    if (step.target) {
      const el = document.querySelector(step.target) as HTMLElement | null;
      if (el) {
        rect = el.getBoundingClientRect();
        const spot = document.createElement('div');
        spot.className = 'tut-spot';
        const pad = 6;
        spot.style.left = `${rect.left - pad}px`;
        spot.style.top = `${rect.top - pad}px`;
        spot.style.width = `${rect.width + pad * 2}px`;
        spot.style.height = `${rect.height + pad * 2}px`;
        overlay.appendChild(spot);
      }
    }

    // 말풍선
    const bubble = document.createElement('div');
    bubble.className = 'tut-bubble';
    const stepText = last ? '' : `<div class="tut-step">${idx + 1} / ${steps.length - 1}</div>`;
    const titleHtml = step.title ? `<h3>${step.title}</h3>` : '';
    const bodyHtml = last ? `<p class="tut-final">🎉</p>` : `<p>${step.body}</p>`;
    const buttons = last
      ? `<button class="tut-primary tut-go">${t('tut.start')}</button>`
      : step.waitSummon
        ? `<button class="tut-skip">${t('tut.skip')}</button>`
        : `<button class="tut-skip">${t('tut.skip')}</button><button class="tut-primary tut-next">${t('tut.next')}</button>`;
    bubble.innerHTML = `${stepText}${titleHtml}${bodyHtml}<div class="tut-btns">${buttons}</div>`;
    overlay.appendChild(bubble);

    // 버튼 바인딩
    bubble.querySelector('.tut-next')?.addEventListener('click', () => { audio.button(); next(); });
    bubble.querySelector('.tut-go')?.addEventListener('click', () => { audio.button(); finish(); });
    bubble.querySelector('.tut-skip')?.addEventListener('click', () => { audio.button(); finish(); });

    // 위치 계산 (버블 삽입 후 크기 측정)
    positionBubble(bubble, rect, step.place);
  };

  render();
}

function positionBubble(bubble: HTMLElement, rect: DOMRect | null, place: Step['place']): void {
  const frame = document.getElementById('game-frame');
  const fr = frame ? frame.getBoundingClientRect() : { left: 0, right: window.innerWidth, width: window.innerWidth, top: 0, bottom: window.innerHeight } as DOMRect;
  const cx = fr.left + fr.width / 2;
  const bw = bubble.offsetWidth;
  const bh = bubble.offsetHeight;
  const margin = 12;

  let left = cx - bw / 2;
  left = Math.max(fr.left + 8, Math.min(left, fr.right - bw - 8));

  let top: number;
  if (place === 'center' || !rect) {
    top = fr.top + (fr.bottom - fr.top) / 2 - bh / 2;
  } else if (place === 'above') {
    top = rect.top - bh - margin;
    if (top < fr.top + 8) top = rect.bottom + margin; // 위 공간 부족하면 아래로
  } else {
    top = rect.bottom + margin;
    if (top + bh > fr.bottom - 8) top = rect.top - bh - margin;
  }
  top = Math.max(fr.top + 8, Math.min(top, fr.bottom - bh - 8));

  bubble.style.left = `${left}px`;
  bubble.style.top = `${top}px`;
}
