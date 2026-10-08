// ============================================================
//  진입점 - 부팅 / 화면 전환(로비↔게임) / 판 흐름(스테이지·무한·PvP) / 메인 루프
// ============================================================
import './style.css';
import { Game } from './engine';
import { Renderer } from './render';
import { UI, type ResultView } from './ui';
import { Spotlight, type SpotStep } from './tutorial';
import { Menu, roadRewardIcon, type Launch } from './menu';
import { preloadAll, warmTints } from './assets';
import { audio } from './audio';
import { getPlatform } from './platform';
import { meta, saveMeta, reloadMeta, useItem } from './meta';
import { crystalReward, starsFor, STAGE_BY_ID, STAGES, PVP, PLAY_SPEED } from './config';
import { completeStage, stageOptions, endlessOptions, stageUnlocked, unitLevels, claimRoad } from './progress';
import { syncPurchases, addSeasonXp } from './shop';
import { showRewarded, rewardedAvailable, maybeInterstitial } from './ads';
import type { PvpSession } from './pvp';
import { $, toast } from './dom';
import type { GameOverData } from './types';
import { icon } from './icons';

preloadAll();
warmTints();
audio.installUnlock();

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const gameFrame = document.getElementById('game-frame') as HTMLElement;

let game: Game | null = null;
let renderer: Renderer | null = null;
let ui: UI | null = null;
let session: PvpSession | null = null;
let current: Launch | null = null;
let snapAcc = 0;

const menu = new Menu(launch);

// ---------------------------------------------------------------
//  판 시작
// ---------------------------------------------------------------
function launch(l: Launch): void {
  current = l;
  let booster = false;
  if (l.kind !== 'pvp' && l.goldBooster) booster = useItem('goldBooster');
  if (l.kind === 'stage') game = new Game(stageOptions(l.stageId, booster));
  else if (l.kind === 'endless') game = new Game(endlessOptions(booster));
  else {
    game = new Game({ mode: 'pvp', seed: l.session.match.seed, useResearch: false, deck: [...meta.deck], attackDeck: [...meta.attackDeck], unitLevels: unitLevels() });
    game.paused = true; // 카운트다운 후 동시에 시작
  }
  renderer = new Renderer(canvas, game);
  ui = new UI(game, {
    kind: l.kind,
    stageId: l.kind === 'stage' ? l.stageId : undefined,
    onExit: () => void exitGame(),
  });
  const g = game;
  const u = ui;
  g.on('gameover', (d) => onGameOver(g, d));
  menu.hide();
  u.hideResult();
  gameFrame.classList.remove('hidden');

  if (l.kind === 'pvp') {
    startPvp(g, u, l.session);
    audio.switchBgm('pvp');
  } else {
    audio.switchBgm('battle');
    if (l.kind === 'stage' && l.stageId === '1-1' && meta.tutorial === 0) void startTutorial(g, u);
  }
}

// ---------------------------------------------------------------
//  PvP
// ---------------------------------------------------------------
function startPvp(g: Game, u: UI, s: PvpSession): void {
  session = s;
  snapAcc = 0;
  u.setOpponentInfo(s.match.opponent.nick, s.match.opponent.trophies, s.match.bot);
  if (meta.pvp.wins + meta.pvp.losses === 0) u.showThrowHint(); // 첫 대전: 던지는 법
  g.on('attack', (p) => s.sendAttack(p));
  let resultShown = false;
  // 판정 대기 안전장치: 내가 무너졌는데 서버 결과가 안 오면 패배 처리
  let fallback: ReturnType<typeof setTimeout> | null = null;
  g.on('gameover', (d) => {
    if (d.pvp?.won === false && !resultShown) {
      s.reportDefeat();
      fallback = setTimeout(() => {
        if (!resultShown) { resultShown = true; showPvpResult(g, u, s, { won: false, trophyDelta: 0, trophies: meta.pvp.trophies, reason: 'defeat' }); }
      }, 6000);
    }
  });
  void s.ready({
    onStart: (startAt) => u.countdown(startAt, () => { g.paused = false; }),
    onSnapshot: (snap) => u.setOpponent(snap),
    onAttack: (p) => g.receiveAttack(p),
    onResult: (r) => {
      if (resultShown) return;
      resultShown = true;
      if (fallback) clearTimeout(fallback);
      if (!g.over) g.pvpEnd(r.won, r.won ? (r.reason === 'leave' ? '상대가 대전을 떠났습니다' : '상대 필드가 무너졌습니다!') : '내 필드가 무너졌습니다');
      showPvpResult(g, u, s, r);
    },
  }).catch((e) => {
    console.warn('[pvp] ready failed', e);
    toast('대전 서버 연결에 실패했어요');
    void exitGame(true);
  });
}

function showPvpResult(g: Game, u: UI, s: PvpSession, r: { won: boolean; trophyDelta: number; trophies: number; reason: string }): void {
  // 봇전도 실제 대전과 똑같이 처리한다 (상대가 봇인지 화면에 드러내지 않음)
  const crystals = r.won ? PVP.rewardWin : PVP.rewardLoss;
  const xp = r.won ? PVP.seasonXpWin : PVP.seasonXpLoss;
  meta.crystals += crystals;
  addSeasonXp(xp);
  if (r.reason !== 'cancel') {
    meta.pvp.trophies = r.trophies;
    if (r.won) { meta.pvp.wins += 1; meta.pvp.streak += 1; meta.pvp.lossStreak = 0; }
    else { meta.pvp.losses += 1; meta.pvp.streak = 0; meta.pvp.lossStreak = (meta.pvp.lossStreak ?? 0) + 1; }
  }
  const road = claimRoad(); // 트로피 로드 도달 보상 (보석 / 유닛 해금)
  saveMeta();
  audio.gameEnd(r.won);
  const rewards = [`${icon('trophy')} ${r.trophyDelta >= 0 ? '+' : ''}${r.trophyDelta}`, `${icon('gem')} +${crystals}`];
  for (const st of road) if (st.crystals) rewards.push(`${icon('gem')} +${st.crystals} 로드`);
  for (const st of road) if (st.attack) rewards.push(`${roadRewardIcon(st)} 새 몹 카드!`);
  const roadUnit = road.find((st) => st.unit)?.unit;
  u.showResult({
    win: r.won,
    title: r.won ? `${icon('trophy')} 승리!` : '패배',
    sub: `${s.match.opponent.nick} · Wave ${g.wave}${r.reason === 'leave' && r.won ? ' · 상대 이탈' : ''}`,
    rewards,
    unlocked: roadUnit,
    buttons: [
      ...(rewardedAvailable() ? [{ label: `${icon('tv')} 광고 보고 ${icon('gem')} +${crystals} 더 받기`, cls: 'blue', id: 'btn-double', action: () => void doubleReward(crystals) }] : []),
      { label: `${icon('sword')} 다시 대전`, cls: 'red', action: () => { void exitGame(true).then(() => menu.quickMatch()); } },
      { label: '로비로', cls: '', action: () => void exitGame(true) },
    ],
  });
}

// ---------------------------------------------------------------
//  일반 모드 결과
// ---------------------------------------------------------------
function onGameOver(g: Game, d: GameOverData): void {
  if (d.pvp || !ui || !current || current.kind === 'pvp') return;
  const u = ui;
  audio.gameEnd(d.cleared);
  // 실패 시 부활 제안 (보상형 광고, 판당 1회)
  if (!d.cleared && g.canRevive() && rewardedAvailable()) {
    u.showResult({
      win: false,
      title: '위기!',
      sub: d.reason,
      rewards: [],
      extraHtml: '<div class="fine">광고 보고 몹을 모두 지우고 계속 (1회)</div>',
      buttons: [
        { label: `${icon('tv')} 부활하고 계속하기`, cls: 'green', action: async () => {
          if (await showRewarded('revive') && g.revive()) { u.hideResult(); audio.merge(); }
          else toast('광고를 끝까지 보면 부활할 수 있어요');
        } },
        { label: '포기하기', cls: '', action: () => finishSolo(u, d) },
      ],
    });
    return;
  }
  finishSolo(u, d);
}

function finishSolo(u: UI, d: GameOverData): void {
  const l = current!;
  if (l.kind === 'stage') {
    const st = STAGE_BY_ID[l.stageId];
    const stars = d.cleared ? starsFor(d.peakMobs) : 0;
    const res = completeStage(l.stageId, d.cleared, stars);
    let crystals = res.crystals;
    if (!d.cleared) { crystals = Math.floor(d.wave / 2); meta.crystals += crystals; }
    if (d.cleared) {
      addSeasonXp(30);
      if (l.stageId === '1-1' && meta.tutorial < 2) meta.tutorial = 2;
    }
    saveMeta();
    const next = STAGES[st.index + 1];
    const canNext = d.cleared && next && stageUnlocked(next.id);
    const view: ResultView = {
      win: d.cleared,
      title: d.cleared ? '스테이지 클리어!' : '실패...',
      sub: d.cleared
        ? `${l.stageId} · 최대 필드 몹 ${d.peakMobs}마리${res.firstClear ? ' · 첫 클리어!' : res.newBest ? ' · 별 기록 갱신!' : ''}`
        : `${d.reason} · Wave ${d.wave}/${st.waves}`,
      stars: d.cleared ? stars : undefined,
      rewards: crystals ? [`${icon('gem')} +${crystals}`] : [],
      unlocked: res.unlocked,
      extraHtml: '',
      buttons: [],
    };
    if (crystals > 0 && rewardedAvailable()) view.buttons.push({ label: `${icon('tv')} 광고 보고 ${icon('gem')} +${crystals} 더 받기`, cls: 'blue', id: 'btn-double', action: () => void doubleReward(crystals) });
    if (canNext) view.buttons.push({ label: `${icon('play')} 다음 스테이지 ${next.id}`, cls: 'red', action: () => void exitGame(true, st.index).then(() => menu.openStage(next.id)) });
    view.buttons.push({ label: '다시 하기', cls: canNext ? '' : 'red', action: () => void exitGame(true, st.index).then(() => menu.openStage(l.stageId)) });
    view.buttons.push({ label: '로비로', cls: '', action: () => void exitGame(true, st.index) });
    u.showResult(view);
  } else {
    const reward = crystalReward(d.wave);
    meta.crystals += reward;
    saveMeta();
    u.showResult({
      win: d.cleared,
      title: d.cleared ? '50웨이브 클리어!' : '게임 오버',
      sub: `${d.reason} · 최고 기록 ${meta.bestWave}웨이브`,
      rewards: [`Wave ${d.wave}`, `${icon('gem')} +${reward}`],
      buttons: [
        ...(reward > 0 && rewardedAvailable() ? [{ label: `${icon('tv')} 광고 보고 ${icon('gem')} +${reward} 더 받기`, cls: 'blue', id: 'btn-double', action: () => void doubleReward(reward) }] : []),
        { label: '다시 하기', cls: 'red', action: () => void exitGame(true).then(() => launch({ kind: 'endless', goldBooster: false })) },
        { label: '로비로', cls: '', action: () => void exitGame(true) },
      ],
    });
  }
}

async function doubleReward(amount: number): Promise<void> {
  const btn = document.getElementById('btn-double') as HTMLButtonElement | null;
  if (btn) btn.disabled = true;
  if (await showRewarded('doubleReward')) {
    meta.crystals += amount;
    saveMeta();
    audio.coin();
    toast(`보상 2배! ${icon('gem')} +${amount}`);
    if (btn) btn.innerHTML = `${icon('check')} 2배 보상 받음`;
  } else if (btn) {
    btn.disabled = false;
  }
}

// ---------------------------------------------------------------
//  튜토리얼 (1-1 첫 플레이): 소환 → 합성 → 강화 → 상성/배치
// ---------------------------------------------------------------
// 1-1 첫 판 튜토리얼: 게임을 멈춘 채 눌러야 할 곳만 밝혀 한 단계씩 안내한다.
// 처음 소환 3번은 같은 유닛이 나와서 합성까지 바로 배운다. 상성/드래그는 여기서 다루지 않는다.
async function startTutorial(g: Game, u: UI): Promise<void> {
  const job = g.opts.deck[0];
  g.scriptSummons([{ job, grade: 'common' }, { job, grade: 'common' }, { job, grade: 'common' }]);
  g.paused = true;
  u.coach(null);
  const spot = new Spotlight();
  const q = <T extends Element>(sel: string) => document.querySelector<T>(sel) as HTMLElement | null;
  const alive = () => g === game;
  const steps: SpotStep[] = [
    { target: () => $('btn-summon'), text: `<b>소환</b>을 눌러 영웅을 불러요 (${icon('coin')}20)` },
    { target: () => $('btn-summon'), text: '한 번 더!' },
    { target: () => $('btn-summon'), text: '하나 더 부르면 <b>합성</b>할 수 있어요' },
    { target: () => $('btn-sell-panel'), text: '같은 영웅 3명! <b>영웅</b>을 눌러요' },
    { target: () => q('#sell-panel .grade-card.ready'), text: '눌러서 <b>합성</b> - 한 등급 위로!' },
    { target: () => q('#sell-panel .close-x'), text: '창을 닫아요' },
    { target: () => q('#unit-stacks .up-btn:not(:disabled)'), text: '<b>강화</b>하면 그 직업이 모두 세져요' },
  ];
  for (const s of steps) {
    if (!alive()) break;
    await spot.step(s);
    await new Promise((r) => setTimeout(r, 120)); // 클릭 결과가 화면에 반영될 시간
  }
  if (alive()) await spot.message('준비 끝! 몹이 길 끝에 쌓이지 않게 막아요', 1800);
  spot.close();
  if (!alive()) return;
  g.paused = false;
  meta.tutorial = 1;
  saveMeta();
}

// ---------------------------------------------------------------
//  나가기
// ---------------------------------------------------------------
async function exitGame(skipConfirm = false, stageIndex: number | null = null): Promise<void> {
  if (!skipConfirm && game && !game.over) {
    const { confirmModal } = await import('./dom');
    const pvp = current?.kind === 'pvp';
    if (!(await confirmModal('나가기', pvp ? '지금 나가면 <b>패배</b> 처리됩니다.' : '진행 중인 판을 포기하고 로비로 갈까요?', '나가기'))) return;
    if (pvp) session?.reportDefeat();
  }
  session?.leave();
  session = null;
  ui?.coach(null);
  gameFrame.classList.add('hidden');
  $('gameover-panel').classList.add('hidden');
  $('sell-panel').classList.add('hidden');
  const wasSolo = current && current.kind !== 'pvp';
  game = null;
  renderer = null;
  ui = null;
  current = null;
  saveMeta();
  menu.show();
  if (wasSolo) await maybeInterstitial(stageIndex);
}

// ---------------------------------------------------------------
//  메인 루프 - PvP 는 백그라운드 탭에서도 시뮬레이션이 멈추지 않게 타이머 보조
// ---------------------------------------------------------------
let last = performance.now();
let lastFrame = performance.now();
function step(now: number): void {
  let dt = (now - last) / 1000;
  last = now;
  if (!game || !renderer || !ui) return;
  const pvp = game.isPvp;
  if (dt > (pvp ? 1.0 : 0.1)) dt = pvp ? 1.0 : 0.1; // 일반: 큰 점프 방지 / PvP: 실시간 유지
  dt *= PLAY_SPEED;
  // 큰 dt 는 잘게 나눠 시뮬레이션 (충돌/이동 정확도)
  while (dt > 0) {
    const d = Math.min(dt, 0.05);
    game.update(d);
    dt -= d;
  }
  if (pvp && session && !game.paused && !game.over) {
    snapAcc += (now - lastFrame) / 1000;
    if (snapAcc >= PVP.reportInterval) { snapAcc = 0; session.sendSnapshot(game.snapshot()); }
  }
  lastFrame = now;
  ui.renderTickets();
}
function loop(now: number): void {
  step(now);
  if (game && renderer && ui) {
    renderer.draw();
    ui.update();
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
setInterval(() => {
  // rAF 가 멈춘 경우(백그라운드)에만 PvP 진행
  const now = performance.now();
  if (game?.isPvp && now - last > 400) step(now);
}, 250);

// ---------------------------------------------------------------
//  부팅
// ---------------------------------------------------------------
async function boot(): Promise<void> {
  $('main-menu').classList.remove('hidden');
  $('main-menu').innerHTML = '<div style="margin:auto;text-align:center"><div class="game-title">랜덤 디펜스</div><div class="spinner"></div></div>';
  try {
    await getPlatform().init();
    reloadMeta();
  } catch (e) {
    console.warn('[boot] platform init failed', e);
  }
  const granted = await syncPurchases().catch(() => [] as string[]);
  menu.show();
  if (granted.length) toast('결제한 상품이 지급되었어요');
}
void boot();

// 디버그용 전역 노출
declare global {
  interface Window {
    __game: Game | null;
    __meta: typeof meta;
    __launch: (l: Launch) => void;
    __forceDraw: () => void;
    __uiUpdate: () => void;
  }
}
window.__launch = launch;
window.__meta = meta;
window.__forceDraw = () => renderer?.draw();
window.__uiUpdate = () => ui?.update();
Object.defineProperty(window, '__game', { get: () => game });
