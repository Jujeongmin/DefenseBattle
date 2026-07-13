// ============================================================
//  진입점 - 화면 전환(메인↔게임) & 메인 루프
// ============================================================
import './style.css';
import { Game } from './engine';
import { Renderer } from './render';
import { UI } from './ui';
import { Menu } from './menu';
import { preloadAll } from './assets';
import { audio } from './audio';
import { t, getLang, setLang } from './i18n';
import { maybeStartTutorial, endTutorial } from './tutorial';

// 메인 화면 언어 버튼: 현재 언어 표시 + 클릭 시 전환 후 새로고침(패널 재렌더)
function setupLangButtons(): void {
  const cur = getLang();
  document.querySelectorAll<HTMLButtonElement>('.menu-lang button').forEach((b) => {
    const lang = b.dataset.lang as ('en' | 'ko');
    b.classList.toggle('active', lang === cur);
    b.onclick = () => {
      if (lang === getLang()) return;
      setLang(lang);
      location.reload();
    };
  });
}

// 정적 HTML(메인 화면/하단 조작부)의 문자열을 현재 언어로 적용
function applyStaticI18n(): void {
  document.documentElement.lang = getLang();
  document.title = t('app.title');
  const set = (id: string, text: string) => { const el = document.getElementById(id); if (el) el.textContent = text; };
  const html = (id: string, markup: string) => { const el = document.getElementById(id); if (el) el.innerHTML = markup; };
  set('game-title', t('app.title'));
  set('menu-start', t('menu.start'));
  set('menu-shop', t('menu.shop'));
  set('menu-lab', t('menu.lab'));
  set('menu-rank', t('menu.rank'));
  set('menu-record-pre', t('menu.recordPre'));
  set('menu-record-suf', t('menu.recordSuf'));
  set('summon-title', t('hud.summon'));
  set('btn-prob-info-game', t('hud.probInfo'));
  html('btn-sell-panel', `🛒<br />${t('hud.sell')}`);
  html('btn-menu', `🏠<br />${t('hud.home')}`);
}

applyStaticI18n();
setupLangButtons();
preloadAll();
audio.installUnlock();

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const gameFrame = document.getElementById('game-frame') as HTMLElement;

let game: Game | null = null;
let renderer: Renderer | null = null;
let ui: UI | null = null;

const menu = new Menu(startGame);

function startGame(): void {
  game = new Game();
  renderer = new Renderer(canvas, game);
  ui = new UI(game, returnToMenu);
  ui.renderStacks();
  menu.hide();
  document.getElementById('gameover-panel')!.classList.add('hidden');
  gameFrame.classList.remove('hidden');
  audio.startBgm();
  // 첫 플레이 온보딩 (레이아웃이 잡힌 뒤 위치 계산해야 하므로 다음 프레임에)
  requestAnimationFrame(() => maybeStartTutorial(game!));
}

function returnToMenu(): void {
  audio.stopBgm();
  endTutorial(); // 튜토리얼 중 나가기 시 오버레이 정리
  gameFrame.classList.add('hidden');
  // 게임 화면에서 뜬 오버레이(확인 패널, 게임오버 등)가 메인화면 위에 남지 않도록 전부 닫는다.
  document.querySelectorAll('.overlay').forEach((el) => el.classList.add('hidden'));
  game = null;
  renderer = null;
  ui = null;
  menu.show();
}

menu.show();

let last = performance.now();
function loop(now: number): void {
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.1) dt = 0.1; // 탭 비활성 등으로 인한 큰 점프 방지
  if (game && renderer && ui) {
    game.update(dt);
    renderer.draw();
    ui.update();
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// 디버그용 전역 노출
declare global {
  interface Window {
    __game: Game | null;
    __startGame: () => void;
    __forceDraw: () => void;
    __uiUpdate: () => void;
  }
}
window.__startGame = startGame;
window.__forceDraw = () => renderer?.draw();
window.__uiUpdate = () => ui?.update();
Object.defineProperty(window, '__game', { get: () => game });
