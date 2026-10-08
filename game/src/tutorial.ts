// ============================================================
//  튜토리얼 스포트라이트 - 화면을 어둡게 하고 눌러야 할 곳만 밝힌다.
//  밝힌 곳을 누르면 그 요소를 대신 클릭해 주고, 다른 곳은 눌리지 않는다.
// ============================================================
import { icon } from './icons';

export interface SpotStep {
  /** 밝힐 요소 (아직 없으면 null - 나타날 때까지 기다린다) */
  target: () => HTMLElement | null;
  /** 한 줄 안내 (HTML) */
  text: string;
}

export class Spotlight {
  private root: HTMLElement;
  private hole: HTMLElement;
  private hand: HTMLElement;
  private bubble: HTMLElement;
  private raf = 0;
  private current: SpotStep | null = null;
  private onTap: (() => void) | null = null;

  constructor() {
    this.root = document.createElement('div');
    this.root.id = 'tut';
    this.root.innerHTML = `<div class="tut-hole"></div><div class="tut-hand">${icon('pointer')}</div><div class="tut-text"></div>`;
    this.hole = this.root.querySelector('.tut-hole')!;
    this.hand = this.root.querySelector('.tut-hand')!;
    this.bubble = this.root.querySelector('.tut-text')!;
    // 밝힌 영역 안을 누를 때만 통과 (나머지 입력은 막는다)
    this.root.addEventListener('click', (e) => {
      if (!this.current || !this.onTap) return;
      const el = this.current.target();
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
        const tap = this.onTap;
        this.onTap = null;
        el.click();
        tap();
      }
    });
    document.getElementById('app')!.appendChild(this.root);
    this.tick();
  }

  /** 단계를 보여 주고, 사용자가 밝힌 곳을 누르면 resolve */
  step(s: SpotStep): Promise<void> {
    this.current = s;
    this.bubble.innerHTML = s.text;
    this.root.classList.remove('msg-only');
    return new Promise((resolve) => { this.onTap = resolve; });
  }

  /** 버튼 없이 안내만 잠깐 */
  message(text: string, ms: number): Promise<void> {
    this.current = null;
    this.onTap = null;
    this.bubble.innerHTML = text;
    this.root.classList.add('msg-only');
    return new Promise((r) => setTimeout(r, ms));
  }

  close(): void {
    cancelAnimationFrame(this.raf);
    this.root.remove();
  }

  // 대상 위치를 매 프레임 따라간다 (패널이 올라오는 애니메이션 중에도 맞게)
  private tick = (): void => {
    const app = document.getElementById('app')!.getBoundingClientRect();
    const el = this.current?.target() ?? null;
    if (el) {
      const r = el.getBoundingClientRect();
      const pad = 6;
      Object.assign(this.hole.style, {
        display: 'block',
        left: `${r.left - app.left - pad}px`, top: `${r.top - app.top - pad}px`,
        width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px`,
      });
      this.hand.style.display = 'block';
      this.hand.style.left = `${r.left - app.left + r.width / 2 - 18}px`;
      this.hand.style.top = `${r.top - app.top - 44}px`;
      // 안내 문구: 대상이 화면 아래쪽이면 위에, 위쪽이면 아래에
      const below = r.top - app.top < app.height * 0.45;
      this.bubble.style.top = below ? `${r.bottom - app.top + 18}px` : '';
      this.bubble.style.bottom = below ? '' : `${app.bottom - r.top + 56}px`;
    } else {
      this.hole.style.display = this.root.classList.contains('msg-only') ? 'none' : this.hole.style.display;
      this.hand.style.display = 'none';
      if (this.root.classList.contains('msg-only')) { this.bubble.style.top = '42%'; this.bubble.style.bottom = ''; }
    }
    this.raf = requestAnimationFrame(this.tick);
  };
}
