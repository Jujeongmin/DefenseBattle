// ============================================================
//  진입점 - 부팅 / 화면 전환(로비↔게임) / 판 흐름(스테이지·무한·PvP) / 메인 루프
// ============================================================
import './style.css';
import { Game } from './engine';
import { Renderer } from './render';
import { UI, type ResultView } from './ui';
import { Spotlight, type SpotStep } from './tutorial';
import { Menu, roadRewardIcon, type Launch } from './menu';
import { preloadAll, preloadUnits, warmTints } from './assets';
import { audio } from './audio';
import { getPlatform } from './platform';
import { meta, saveMeta, reloadMeta } from './meta';
import { starsFor, STAGE_BY_ID, STAGES, PVP, PLAY_SPEED, PVP_TIERS, CHESTS } from './config';
import { afterMatch } from './offers';
import { pendingReveals } from './chests';
import { stageOptions, endlessOptions, stageUnlocked, unitLevels, deckMin, featureUnlocked } from './progress';
import { syncPurchases } from './shop';
import { act, runStart, stageResult, endlessResult, applyEcon, online, pvpRewardLocal, syncEcon } from './econ';
import { showRewarded, rewardedAvailable } from './ads';
import type { PvpSession, PvpResult } from './pvp';
import { $, toast } from './dom';
import type { GameOverData } from './types';
import { icon } from './icons';
import { initUnitTips } from './tooltip';
import { preloadEverything } from './preload';
import { translateStatic } from './i18n-dom';

import { tl } from './i18n';
/** 로딩 화면 한 줄 팁 */
const LOADING_TIPS = [
  tl('같은 유닛 3개를 합치면 한 등급 위로 올라가요'),
  tl('몹 카드를 끌어 상대 전장에 던지세요'),
  tl('필드 몹이 100마리가 되면 져요'),
  tl('상대 덱을 보고 막기 어려운 몹을 골라 보내세요'),
  tl('영웅·전설 유닛은 정예 등급부터 스킬을 써요'),
  tl('대전에서 이기면 상자를 받아요'),
  tl('중복 카드를 모으면 유닛 레벨을 올릴 수 있어요'),
];

preloadAll(meta.deck);
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
  // 골드 부스터: 바로 쓰고(화면) 서버에 차감 요청 (없으면 서버가 거절 - 다음 동기화 때 바로잡힘)
  if (l.kind !== 'pvp' && l.goldBooster && meta.items.goldBooster > 0) { booster = true; meta.items.goldBooster -= 1; void act('useItem', { key: 'goldBooster' }); }
  if (l.kind === 'stage') void runStart('stage', l.stageId);
  else if (l.kind === 'endless') void runStart('endless');
  if (l.kind === 'stage') game = new Game(stageOptions(l.stageId, booster));
  else if (l.kind === 'endless') game = new Game(endlessOptions(booster));
  else {
    game = new Game({ mode: 'pvp', seed: l.session.match.seed, useResearch: true, deck: [...meta.deck], deckMin: deckMin(), attackDeck: [...meta.attackDeck], unitLevels: unitLevels() });
    game.paused = true; // 카운트다운 후 동시에 시작
  }
  preloadUnits(game.opts.deck); // 이 판에 나올 유닛 (등급 6개)
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
      if (!g.over) g.pvpEnd(r.won, r.won ? (r.reason === 'leave' ? tl('상대가 대전을 떠났습니다') : tl('상대 필드가 무너졌습니다!')) : tl('내 필드가 무너졌습니다'));
      showPvpResult(g, u, s, r);
    },
  }).catch((e) => {
    console.warn('[pvp] ready failed', e);
    toast(tl('대전 서버 연결에 실패했어요'));
    void exitGame(true);
  });
}

function showPvpResult(g: Game, u: UI, s: PvpSession, r: PvpResult): void {
  // 봇전도 실제 대전과 똑같이 처리한다 (상대가 봇인지 화면에 드러내지 않음)
  if (r.reason !== 'cancel') {
    meta.pvp.trophies = r.trophies;
    if (r.won) { meta.pvp.wins += 1; meta.pvp.streak += 1; meta.pvp.lossStreak = 0; }
    else { meta.pvp.losses += 1; meta.pvp.streak = 0; meta.pvp.lossStreak = (meta.pvp.lossStreak ?? 0) + 1; }
  }
  // 보상(보석·시즌 XP·승리 상자·트로피 로드): 온라인은 서버가 이미 지급, 오프라인 봇전만 기기 규칙으로
  let reward: PvpResult['reward'] = r.reward;
  if (reward?.econ) applyEcon(reward.econ);
  else if (!online() && r.reason !== 'cancel') reward = pvpRewardLocal(r.won);
  const crystals = reward?.crystals ?? 0;
  const road = reward?.road ?? [];
  pendingReveals.push(...(reward?.reveals ?? []));
  // 결제 팝업 조건: 새 아레나 승급 / 2연패
  const tierIdx = PVP_TIERS.filter((t) => meta.pvp.trophies >= t.min).length - 1;
  const tierUp = tierIdx > meta.arenaMax;
  if (tierUp) meta.arenaMax = tierIdx;
  saveMeta();
  audio.gameEnd(r.won);
  const rewards = [`${icon('trophy')} ${r.trophyDelta >= 0 ? '+' : ''}${r.trophyDelta}`, ...(crystals ? [`${icon('gem')} +${crystals}`] : [])];
  for (const st of road) if (st.crystals) rewards.push(tl('{0} +{1} 로드', icon('gem'), st.crystals));
  for (const st of road) if (st.attack) rewards.push(tl('{0} 새 몹 카드!', roadRewardIcon(st)));
  if (r.won && reward) rewards.push(reward.chest ? `${icon('chest')} ${CHESTS[reward.chest].kr}` : tl('{0} 상자 칸 가득', icon('chest')));
  const roadUnit = road.find((st) => st.unit)?.unit;
  u.showResult({
    win: r.won,
    title: r.won ? tl('{0} 승리!', icon('trophy')) : tl('패배'),
    sub: `${s.match.opponent.nick} · Wave ${g.wave}${r.reason === 'leave' && r.won ? tl(' · 상대 이탈') : ''}`,
    rewards,
    unlocked: roadUnit,
    buttons: [
      ...(crystals && rewardedAvailable() ? [{ label: tl('{0} 광고 보고 {1} +{2} 더 받기', icon('tv'), icon('gem'), crystals), cls: 'blue', id: 'btn-double', action: () => void doubleReward() }] : []),
      { label: tl('{0} 다시 대전', icon('sword')), cls: 'red', action: () => { void exitGame(true).then(() => menu.quickMatch()); } },
      { label: tl('로비로'), cls: '', action: () => void exitGame(true) },
    ],
  });
  afterMatch({ tierUp, losing: !r.won && (meta.pvp.lossStreak ?? 0) >= 2 });
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
      title: tl('위기!'),
      sub: d.reason,
      rewards: [],
      extraHtml: tl('<div class="fine">광고 보고 몹을 모두 지우고 계속 (1회)</div>'),
      buttons: [
        { label: tl('{0} 부활하고 계속하기', icon('tv')), cls: 'green', action: async () => {
          if (await showRewarded('revive') && g.revive()) { u.hideResult(); audio.merge(); }
          else toast(tl('광고를 끝까지 보면 부활할 수 있어요'));
        } },
        { label: tl('포기하기'), cls: '', action: () => void finishSolo(u, d) },
      ],
    });
    return;
  }
  void finishSolo(u, d);
}

async function finishSolo(u: UI, d: GameOverData): Promise<void> {
  const l = current!;
  if (l.kind === 'stage') {
    const st = STAGE_BY_ID[l.stageId];
    const stars = d.cleared ? starsFor(d.peakMobs) : 0;
    // 보상은 서버가 (시작 기록·진행 시간 확인). 거부되면 보상 없이 결과만
    const res = (await stageResult(l.stageId, d.cleared, stars, d.wave)) ?? { stars, firstClear: false, newBest: false, crystals: 0 };
    const crystals = res.crystals;
    if (d.cleared && l.stageId === '1-1' && meta.tutorial < 2) meta.tutorial = 2;
    meta.stageFailStreak = d.cleared ? 0 : meta.stageFailStreak + 1;
    saveMeta();
    const next = STAGES[st.index + 1];
    const canNext = d.cleared && next && stageUnlocked(next.id);
    const view: ResultView = {
      win: d.cleared,
      title: d.cleared ? tl('스테이지 클리어!') : tl('실패...'),
      sub: d.cleared
        ? tl('{0} · 최대 필드 몹 {1}마리{2}', l.stageId, d.peakMobs, res.firstClear ? tl(' · 첫 클리어!') : res.newBest ? tl(' · 별 기록 갱신!') : '')
        : `${d.reason} · Wave ${d.wave}/${st.waves}`,
      stars: d.cleared ? stars : undefined,
      rewards: crystals ? [`${icon('gem')} +${crystals}`] : [],
      unlocked: res.unlocked,
      extraHtml: '',
      buttons: [],
    };
    if (crystals > 0 && rewardedAvailable()) view.buttons.push({ label: tl('{0} 광고 보고 {1} +{2} 더 받기', icon('tv'), icon('gem'), crystals), cls: 'blue', id: 'btn-double', action: () => void doubleReward() });
    if (canNext) view.buttons.push({ label: tl('{0} 다음 스테이지 {1}', icon('play'), next.id), cls: 'red', action: () => void exitGame(true).then(() => menu.openStage(next.id)) });
    // 다시 하기는 실패했을 때만 (클리어면 다음 스테이지 / 로비로 - 버튼을 줄인다)
    if (!d.cleared) view.buttons.push({ label: tl('다시 하기'), cls: 'red', action: () => void exitGame(true).then(() => menu.openStage(l.stageId)) });
    view.buttons.push({ label: tl('로비로'), cls: '', action: () => void exitGame(true) });
    u.showResult(view);
    // 결제 팝업 조건: 새 챕터 도달 / 2연속 실패 (튜토리얼 직후는 제외)
    if (l.stageId !== '1-1') afterMatch({ chapterUp: res.firstClear && !!next && next.chapter > st.chapter, losing: meta.stageFailStreak >= 2 });
  } else {
    const reward = await endlessResult(d.wave);
    u.showResult({
      win: d.cleared,
      title: d.cleared ? tl('50웨이브 클리어!') : tl('게임 오버'),
      sub: tl('{0} · 최고 기록 {1}웨이브', d.reason, meta.bestWave),
      rewards: [`Wave ${d.wave}`, `${icon('gem')} +${reward}`],
      buttons: [
        ...(reward > 0 && rewardedAvailable() ? [{ label: tl('{0} 광고 보고 {1} +{2} 더 받기', icon('tv'), icon('gem'), reward), cls: 'blue', id: 'btn-double', action: () => void doubleReward() }] : []),
        { label: tl('다시 하기'), cls: 'red', action: () => void exitGame(true).then(() => launch({ kind: 'endless', goldBooster: false })) },
        { label: tl('로비로'), cls: '', action: () => void exitGame(true) },
      ],
    });
  }
}

async function doubleReward(): Promise<void> {
  const btn = document.getElementById('btn-double') as HTMLButtonElement | null;
  if (btn) btn.disabled = true;
  if (await showRewarded('doubleReward')) {
    const amount = await act<number>('adReward', { kind: 'double' }); // 직전 판 보상 한 번 더 (서버가 금액 결정)
    audio.coin();
    toast(tl('보상 2배! {0} +{1}', icon('gem'), amount));
    if (btn) btn.innerHTML = tl('{0} 2배 보상 받음', icon('check'));
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
    { target: () => $('btn-summon'), text: tl('<b>소환</b>을 눌러 영웅을 불러요 ({0}20)', icon('coin')) },
    { target: () => $('btn-summon'), text: tl('한 번 더!') },
    { target: () => $('btn-summon'), text: tl('하나 더 부르면 <b>합성</b>할 수 있어요') },
    { target: () => $('btn-sell-panel'), text: tl('같은 영웅 3명! <b>영웅</b>을 눌러요') },
    { target: () => q('#sell-panel .grade-card.ready'), text: tl('눌러서 <b>합성</b> - 한 등급 위로!') },
    { target: () => q('#sell-panel .close-x'), text: tl('창을 닫아요') },
    { target: () => q('#unit-stacks .up-btn:not(:disabled)'), text: tl('<b>강화</b>하면 그 직업이 모두 세져요') },
  ];
  for (const s of steps) {
    if (!alive()) break;
    await spot.step(s);
    await new Promise((r) => setTimeout(r, 120)); // 클릭 결과가 화면에 반영될 시간
  }
  if (alive()) await spot.message(tl('준비 끝! 몹이 길 끝에 쌓이지 않게 막아요'), 1800);
  spot.close();
  if (!alive()) return;
  g.paused = false;
  meta.tutorial = 1;
  saveMeta();
}

// ---------------------------------------------------------------
//  나가기
// ---------------------------------------------------------------
async function exitGame(skipConfirm = false): Promise<void> {
  if (!skipConfirm && game && !game.over) {
    const { confirmModal } = await import('./dom');
    const pvp = current?.kind === 'pvp';
    if (!(await confirmModal(tl('나가기'), pvp ? tl('지금 나가면 <b>패배</b> 처리됩니다.') : tl('진행 중인 판을 포기하고 로비로 갈까요?'), tl('나가기')))) return;
    if (pvp) session?.reportDefeat();
  }
  session?.leave();
  session = null;
  ui?.coach(null);
  gameFrame.classList.add('hidden');
  $('gameover-panel').classList.add('hidden');
  $('sell-panel').classList.add('hidden');
  game = null;
  renderer = null;
  ui = null;
  current = null;
  saveMeta();
  menu.show();
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
}
function loop(now: number): void {
  step(now);
  if (game && renderer && ui) {
    renderer.draw();
    ui.update();
    ui.maybeTip(renderer.gapCount);
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
  translateStatic(); // index.html 고정 문구를 지금 언어로
  initUnitTips(); // 유닛 아이콘 말풍선 (몹 카드의 '막는 유닛' 등)
  $('main-menu').classList.remove('hidden');
  // 로딩 화면: 모든 에셋을 받는 동안 진행 막대 (서버 접속도 함께)
  const tips = LOADING_TIPS.slice().sort(() => Math.random() - 0.5);
  $('main-menu').innerHTML = `<div class="loading">
    <img class="ld-logo" src="ui/logo.png" alt="Defense Battle">
    <div class="ld-bottom">
      <div class="ld-tip" id="ld-tip">${tips[0]}</div>
      <div class="ld-bar"><div id="ld-fill"></div></div>
      <div class="ld-pct" id="ld-pct">0%</div>
    </div>
  </div>`;
  let tipI = 0;
  const tipTimer = setInterval(() => { tipI = (tipI + 1) % tips.length; $('ld-tip').textContent = tips[tipI]; }, 2600);
  const setPct = (p: number) => { $('ld-fill').style.width = `${p}%`; $('ld-pct').textContent = `${Math.floor(p)}%`; };
  // 캐시돼 있으면 에셋이 순식간에 끝나 로딩 화면이 깜빡이고 지나간다 → 최소 시간 동안 막대를 채워 보여 준다
  const t0 = performance.now();
  const MIN_MS = 2200;
  let assetPct = 0, serverDone = false;
  const show = () => setPct(Math.min(assetPct * 0.9 + (serverDone ? 10 : 0), ((performance.now() - t0) / MIN_MS) * 100));
  const barTimer = setInterval(show, 50);
  const assets = preloadEverything((d, t) => { assetPct = (d / t) * 100; show(); });
  try {
    await getPlatform().init();
    reloadMeta();
    await syncEcon(); // 경제는 서버 값 (보석·카드·레벨·상자)
  } catch (e) {
    console.warn('[boot] platform init failed', e);
  }
  serverDone = true; show();
  await assets;
  await new Promise((r) => setTimeout(r, Math.max(0, MIN_MS - (performance.now() - t0))));
  clearInterval(tipTimer);
  clearInterval(barTimer);
  setPct(100);
  await new Promise((r) => setTimeout(r, 250)); // 100% 를 잠깐 보여 준다
  const granted = await syncPurchases().catch(() => [] as string[]);
  // 처음 온 사람(1-1 을 아직 못 깸): 로비·'튜토리얼 시작' 버튼 없이 로딩 끝나면 바로 1-1 튜토리얼
  if (!featureUnlocked('pvp')) launch({ kind: 'stage', stageId: '1-1', goldBooster: false });
  else menu.show();
  if (granted.length) toast(tl('결제한 상품이 지급되었어요'));
  // Verse8 인데 계정을 확인하지 못함 → 진행이 저장되지 않으니 알린다
  if (getPlatform().kind === 'verse8' && !getPlatform().accountId()) toast(tl('서버에 연결하지 못해 진행이 저장되지 않아요 · 새로고침해 주세요'), 6000);
}
void boot();

