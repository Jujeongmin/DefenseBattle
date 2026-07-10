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
}

function returnToMenu(): void {
  audio.stopBgm();
  gameFrame.classList.add('hidden');
  document.getElementById('gameover-panel')!.classList.add('hidden');
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
