// ============================================================
//  로비(메인 화면) - 스테이지 / 유닛·덱 / 연구 / 퀘스트 / 상점 / PvP(시즌패스·랭킹)
// ============================================================
import {
  RESEARCH, researchCost, DAILY_QUESTS, ACHIEVEMENTS, PRODUCTS, ITEM_KR,
  UNITS, UNIT_BY_ID, UNIT_MAX_LEVEL, unitUpgradeCost, SKILL_KR,
  DECK_SIZE, STAGES, STAGE_BY_ID, CHAPTERS, ATTACKS, ATTACK_BY_KEY, ATTACK_DECK_SIZE, PLAY_SPEED, UNIT_PACK, CHESTS, RARITY_KR, RARITY_COLOR, GACHA, chestOpenCost, type RoadStep, type AttackKey,
  SEASON_TIERS, SEASON_XP_PER_TIER, pvpTier, productEfficiency,
  CAMPAIGN, TROPHY_ROAD, PVP_TIERS, ECONOMY, type SeasonReward, UNIT_PRESETS, ATTACK_PRESETS, type DeckPreset,
  GRADES, UNIT_LEVEL_ATK, RARITY_ATK,
} from './config';
import { meta, saveMeta, researchLevel, currentSeasonId, todayStr } from './meta';
import { getPlatform } from './platform';
import { audio } from './audio';
import { unitIconUrl, mobPortraitSrc, mobSprite } from './assets';
import { icon, stars as starIcons } from './icons';
import {
  stageStars, stageUnlocked, nextStageId, chapterStars, chapterUnlocked, CHAPTER_STAR_GOALS,
  chapterStarReward, starRewardClaimed, featureUnlocked, featureNew, markFeatureSeen,
  nextRoadStep, roadUnlockAt,
  unitUnlocked, unitLevel, canUpgradeUnit, toggleDeck,
  placeDeck, removeDeck, attackUnlocked, attackUnlockAt, placeAttack, unitCards, deckMin,
} from './progress';
import {
  purchase, productOwned, monthlyActive, monthlyDaysLeft, canClaimMonthly, claimMonthly,
  seasonTier, claimSeasonReward, rewardText,
} from './shop';
import { freeTicketAdsLeft, watchForTickets, rewardedAvailable, FREE_TICKET_AMOUNT } from './ads';
import { onlineAvailable, findMatch, createBotSession, type PvpSession } from './pvp';
import { $, toast, openOverlay, closeOverlay, bindActions, spriteIcon, confirmModal, fitAll } from './dom';
import { enableDeckDrag } from './dragdeck';
import { Spotlight } from './tutorial';
import { act, online, type Reveal } from './econ';
import { showShortage, activeOffers, unitPackAvailable, timeLeft } from './offers';
import { chestState, chestLeftMs, leftText, clockText, opening, showReveal, flushReveals, pendingReveals } from './chests';
import type { Job, Race, ResearchKey } from './types';

import { tl, LANGS, lang, setLang, type Lang } from './i18n';
/** 덱 화면 안내 줄의 '추천 덱' 버튼 */
const RECS_BTN = `<button class="btn small gold rec-btn" data-act="recs">${icon('star')} ${tl('추천 덱')}</button>`;

export type Launch =
  | { kind: 'stage'; stageId: string; goldBooster: boolean }
  | { kind: 'endless'; goldBooster: boolean }
  | { kind: 'pvp'; session: PvpSession };

const raceIcon = (r: Race) => spriteIcon(mobPortraitSrc(r), 'frame-sprite race-ic');

const NEW_TAG = '<span class="new-tag">NEW</span>';
type LobbyFeature = 'units' | 'research' | 'quests' | 'pvp' | 'endless';

/** 트로피 로드 보상 그림 (유닛·몹 카드는 캐릭터 그림, 보석은 아이콘) */
export function roadRewardIcon(s: RoadStep): string {
  if (s.unit) return spriteIcon(unitIconUrl(s.unit), 'frame-sprite road-unit');
  if (s.attack) { const a = ATTACK_BY_KEY[s.attack]; return spriteIcon(mobSprite(a.race, a.variant).url, 'frame-sprite road-unit'); }
  if (s.chest) return `<span class="chest-ic" style="--cc:${CHESTS[s.chest].color}">${icon('chest')}</span>`;
  return `${icon('gem')}${s.crystals}`;
}
export function roadRewardText(s: RoadStep): string {
  if (s.unit) return UNIT_BY_ID[s.unit].kr;
  if (s.attack) return tl('몹 카드 {0}', ATTACK_BY_KEY[s.attack].kr);
  if (s.chest) return CHESTS[s.chest].kr;
  return `${icon('gem')}${s.crystals}`;
}

export class Menu {
  private onLaunch: (l: Launch) => void;
  private selectedChapter = 1;
  private guiding = false; // 로비 안내(스포트라이트)가 떠 있는 중

  constructor(onLaunch: (l: Launch) => void) {
    this.onLaunch = onLaunch;
  }

  show(): void {
    $('main-menu').classList.remove('hidden');
    this.selectedChapter = STAGE_BY_ID[nextStageId()].chapter;
    this.render();
    audio.switchBgm('menu');
    this.prefetchRanking(); // 랭킹 창을 처음 열 때도 바로 보이게
  }
  hide(): void {
    $('main-menu').classList.add('hidden');
  }
  /** 결과 화면 → 스테이지 정보(시작 전) 바로 열기 */
  openStage(id: string): void { this.openStageInfo(id); }
  /** 결과 화면 '다시 대전' → 바로 매칭 */
  quickMatch(): void { this.startMatchmaking(); }

  refresh(): void {
    if (!$('main-menu').classList.contains('hidden')) this.render();
  }

  // ======================= 로비 =======================
  // ======================= 로비: 대전(아레나) 중심 + 캠페인·무한 모드 =======================
  private render(): void {
    const root = $('main-menu');
    // 도달했지만 아직 안 받은 로드 보상 (이전 버전 저장본 등) - 받을 게 있을 때만 서버에 요청
    if (!this.roadBusy && TROPHY_ROAD.some((s) => meta.pvp.trophies >= s.at && !meta.roadClaimed.includes(s.at))) {
      this.roadBusy = true;
      void act<{ steps: RoadStep[]; reveals: Reveal[] }>('claimRoad').then((r) => {
        this.roadBusy = false;
        if (!r?.steps.length) return;
        pendingReveals.push(...r.reveals);
        toast(tl('트로피 로드 보상: {0}', r.steps.map((s) => roadRewardText(s)).join(' · ')), 3200);
        this.render();
      }).catch(() => { this.roadBusy = false; });
    }
    const p = meta.pvp;
    const tier = pvpTier(p.trophies);
    const pvpOn = featureUnlocked('pvp');
    const next = nextRoadStep();
    const prevAt = [...TROPHY_ROAD].reverse().find((s) => s.at <= p.trophies)?.at ?? 0;
    const pct = next ? Math.max(0, Math.min(100, ((p.trophies - prevAt) / (next.at - prevAt)) * 100)) : 100;
    const nextIc = next ? roadRewardIcon(next) : icon('crown');
    const parade = meta.deck.map((j) => spriteIcon(unitIconUrl(j))).join('');
    const nextStage = STAGE_BY_ID[nextStageId()];
    const allCleared = CAMPAIGN.every((s) => stageStars(s.id) > 0);
    const endlessOn = featureUnlocked('endless');
    const dot = '<span class="dot"></span>';
    const tag = (f: LobbyFeature) => (featureNew(f) ? NEW_TAG : '');
    root.innerHTML = `
      <div class="lobby-top">
        <div class="profile-chip" data-act="profile" style="color:${tier.color}">
          <div class="tier-badge">${icon('trophy')}</div>
          <div><div class="nm" style="color:var(--text)">${esc(meta.nick)}</div><div class="tr">${tier.kr} · ${p.trophies}</div></div>
        </div>
        <div class="res-chip" data-act="shop"><span class="crystal">${icon('gem')} ${meta.crystals.toLocaleString()}</span><span class="plus">${icon('plus')}</span></div>
        <button class="gear-btn" data-act="settings" aria-label="${tl('설정')}">${icon('settings')}</button>
      </div>
      <div class="lobby-body v1">
        <h1 class="game-title">Defense Battle</h1>
        <div class="parade">${parade}</div>
        ${canClaimMonthly() ? `<div class="notice">${icon('calendar')} ${tl('월정액 오늘의 보석')} <button class="btn small green" data-act="monthly">${tl('받기')} ${icon('gem')}</button></div>` : ''}
        ${pvpOn ? `<div class="play-card arena-card">
          <div class="arena-name tier-name" style="color:${tier.color}">${icon('trophy')} ${tier.kr} ${tl('아레나')} <span>${p.trophies}</span></div>
          <div class="road-bar"><div style="width:${pct}%"></div></div>
          ${next ? `<div class="road-next">${tl('다음 보상')} ${nextIc} <span>${icon('trophy')}${next.at}</span></div>` : ''}
          <button class="btn red play-btn" data-act="battle">${icon('sword')} ${tl('대전 시작')}</button>
          <div class="arena-sub">${tl('{0}승 {1}패', p.wins, p.losses)}${p.streak > 1 ? tl(' · {0}연승', p.streak) : ''}
            <button class="btn small gold pass-btn" data-act="pass">${icon('trophy')} ${tl('시즌 패스')}${this.seasonClaimable() ? dot : ''}</button></div>
          <div class="arena-chests"><div class="ac-title">${icon('chest')} ${tl('내 상자')} <span class="ac-hint">${tl('한 번에 하나씩 열려요')}</span></div><div class="chest-row">${this.chestSlotsHtml()}</div></div>
        </div>
        <div class="mode-row">
          <button class="mode-card camp" data-act="stages">
            <div class="ic">${icon('map')}</div><div class="t">${tl('캠페인')}</div><div class="d">${allCleared ? tl('{0} 모두 클리어', icon('check')) : tl('스테이지 {0}', nextStage.id)}</div>
          </button>
          ${endlessOn ? `<button class="mode-card endless" data-act="endless">
            <div class="ic">${icon('infinity')}</div><div class="t">${tl('무한 모드')}</div><div class="d">${tl('최고 {0}웨이브', meta.bestWave || 0)}</div>${tag('endless')}
          </button>` : ''}
        </div>` : `<button class="btn red play-btn tut-start" data-act="tutorial">${icon('play')} ${tl('튜토리얼 시작')}</button>`}
      </div>
      <nav class="lobby-nav">
        <button data-act="shop"><span class="ic">${icon('shop')}${menuDot('shop') ? dot : ''}</span>${tl('상점')}</button>
        ${featureUnlocked('units') ? `<button data-act="units"><span class="ic">${icon('helmet')}${tag('units') || (menuDot('units') ? dot : '')}</span>${tl('덱')}</button>` : ''}
        ${featureUnlocked('research') ? `<button data-act="research"><span class="ic">${icon('flask')}${tag('research')}</span>${tl('연구')}</button>` : ''}
        ${featureUnlocked('quests') ? `<button data-act="quests"><span class="ic">${icon('scroll')}${tag('quests') || (this.questClaimable() ? dot : '')}</span>${tl('퀘스트')}</button>` : ''}
        ${pvpOn ? `<button data-act="road"><span class="ic">${icon('trophy')}</span>${tl('로드')}</button>` : ''}
        ${pvpOn ? `<button data-act="rank"><span class="ic">${icon('medal')}</span>${tl('랭킹')}</button>` : ''}
      </nav>`;
    bindActions(root, {
      profile: () => this.openProfile(),
      settings: () => this.openSettings(),
      units: () => { markFeatureSeen('units'); markDotSeen('units'); this.openUnits(); },
      stages: () => this.openStages(),
      tutorial: () => this.openStageInfo('1-1'),
      battle: () => { markFeatureSeen('pvp'); this.startMatchmaking(); },
      road: () => this.openRoad(),
      rank: () => this.openPvp('rank'),
      pass: () => this.openPvp('pass'),
      research: () => { markFeatureSeen('research'); this.openResearch(); },
      quests: () => { markFeatureSeen('quests'); this.openQuests(); },
      endless: () => { markFeatureSeen('endless'); this.openEndless(); },
      shop: () => this.openShop(),
      chest: (b) => this.tapChest(Number(b.dataset.i)),
      monthly: async () => { const n = await claimMonthly(); if (n) { audio.coin(); toast(tl('월정액 보석 +{0} {1}', n, icon('gem'))); this.render(); } },
    });
    root.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => audio.button(), { capture: true }));
    fitAll(root); // 상자 이름 등 긴 언어 글자를 칸에 맞춤
    this.fitLobby();
    this.maybeGuide();
    // 트로피 로드·결제로 받은 상자 공개 (쌓여 있으면 차례로)
    if (pendingReveals.length && $('modal').classList.contains('hidden')) flushReveals(() => this.render());
    // 여는 중인 상자 남은 시간
    if (!this.chestTimer) this.chestTimer = setInterval(() => {
      if ($('main-menu').classList.contains('hidden')) return;
      document.querySelectorAll<HTMLElement>('[data-chest-left]').forEach((el) => {
        const i = Number(el.dataset.chestLeft);
        if (chestState(i) === 'ready') { this.render(); return; }
        el.textContent = clockText(chestLeftMs(i));
      });
    }, 1000);
  }

  /**
   * 로비 안내: 새로 열린 메뉴를 하나씩 밝혀 설명하고, 밝힌 버튼을 누르면 그 메뉴가 열린다.
   * 한 번 안내한 것은 seenFeatures 에 남겨 다시 띄우지 않는다 (설정 > 튜토리얼 다시 하기 로 초기화).
   * 순서: 대전 → 덱 → 캠페인 → 연구 → 퀘스트 → 무한 모드 (스테이지 1-1 튜토리얼을 마친 뒤부터)
   * 덱은 캠페인보다 먼저 - 캠페인을 시작한 뒤에야 덱 안내가 나오면 늦다
   */
  /**
   * 로비가 화면 높이에 다 들어가게 (스크롤 없이): 넘치면 c1 → c2 → c3 단계로 여백·그림을 줄인다.
   * 화면 크기·언어마다 높이가 달라 그린 뒤에 잰다. (c3 까지 해도 넘치는 아주 작은 화면만 스크롤)
   */
  private fitLobby(): void {
    const body = document.querySelector<HTMLElement>('#main-menu .lobby-body');
    if (!body || !body.clientHeight) return;
    const steps = ['c1', 'c2', 'c3'];
    body.classList.remove(...steps);
    for (const c of steps) {
      if (body.scrollHeight <= body.clientHeight + 1) break;
      body.classList.add(c);
    }
    if (!this.fitBound) {
      this.fitBound = true;
      window.addEventListener('resize', () => { if (!$('main-menu').classList.contains('hidden')) this.fitLobby(); });
    }
  }
  private fitBound = false;

  private guideRetry: ReturnType<typeof setTimeout> | null = null;
  private maybeGuide(): void {
    if (this.guiding || !featureUnlocked('pvp') || meta.tutorial < 2 || $('main-menu').classList.contains('hidden')) return;
    // 팝업(연패 상품 등)이 떠 있으면 닫힐 때까지 기다렸다가 안내한다. 닫히는 중이면 닫힌 것
    if (['modal', 'panel'].some((id) => { const c = $(id).classList; return !c.contains('hidden') && !c.contains('closing'); })) {
      if (!this.guideRetry) this.guideRetry = setTimeout(() => {
        this.guideRetry = null;
        if (!$('main-menu').classList.contains('hidden')) this.maybeGuide();
      }, 800);
      return;
    }
    const steps: { key: string; sel: string; text: string; on: boolean }[] = [
      { key: 'pvp', sel: '[data-act="battle"]', on: true,
        text: tl('<b>대전 시작</b>을 눌러 보세요!<br>상대 전장에 몹을 던지고, 이기면 상자를 받아요') },
      { key: 'units', sel: '.lobby-nav [data-act="units"]', on: featureUnlocked('units'),
        text: tl('<b>덱</b>에서 유닛과 몹 카드를 고르고<br>모은 카드로 강화해요') },
      { key: 'campaign', sel: '[data-act="stages"]', on: stageStars('1-2') === 0,
        text: tl('<b>캠페인</b>에서 스테이지를 깨면<br>새 유닛과 보석을 얻어요') },
      { key: 'research', sel: '.lobby-nav [data-act="research"]', on: featureUnlocked('research'),
        text: tl('<b>연구소</b>가 열렸어요!<br>보석으로 대전과 모든 판의 능력을 올려요') },
      { key: 'quests', sel: '.lobby-nav [data-act="quests"]', on: featureUnlocked('quests'),
        text: tl('<b>퀘스트</b>가 열렸어요!<br>매일 목표를 채우면 보석을 받아요') },
      { key: 'endless', sel: '[data-act="endless"]', on: featureUnlocked('endless'),
        text: tl('<b>무한 모드</b>가 열렸어요!<br>얼마나 오래 버티는지 도전해 보세요') },
    ];
    const g = steps.find((s) => s.on && !meta.seenFeatures.includes(s.key) && document.querySelector(s.sel));
    if (!g) return;
    this.guiding = true;
    setTimeout(async () => {
      // 기다리는 사이 다른 창을 열었거나 판에 들어갔으면 다음 기회로
      if ($('main-menu').classList.contains('hidden') || ['modal', 'panel'].some((id) => !$(id).classList.contains('hidden'))) {
        this.guiding = false;
        this.maybeGuide();
        return;
      }
      const spot = new Spotlight();
      await spot.step({ target: () => document.querySelector<HTMLElement>(g.sel), text: g.text });
      spot.close();
      if (!meta.seenFeatures.includes(g.key)) { meta.seenFeatures.push(g.key); saveMeta(); }
      this.guiding = false;
    }, 600);
  }

  private chestTimer: ReturnType<typeof setInterval> | null = null;
  private roadBusy = false;
  /** 로비 상자 칸 4개 */
  private chestSlotsHtml(): string {
    return meta.chests.map((c, i) => {
      const st = chestState(i);
      if (!c) return `<div class="chest-slot empty">${icon('chest')}<span class="es">${tl('대전 승리 시<br>획득')}</span></div>`;
      const d = CHESTS[c.kind];
      const ic = `<span class="chest-ic" style="--cc:${d.color}">${icon('chest')}</span>`;
      const label = st === 'ready' ? tl('<b class="open">열기!</b>')
        : st === 'opening' ? `<span class="clock" data-chest-left="${i}">${clockText(chestLeftMs(i))}</span><small>${icon('gem')}${chestOpenCost(chestLeftMs(i))}</small>`
        : `<span>${leftText(chestLeftMs(i))}</span><small>${opening() < 0 ? tl('탭해서 열기') : tl('차례 대기')}</small>`;
      return `<button class="chest-slot ${st}" data-act="chest" data-i="${i}">${ic}<span class="cn">${d.kr}</span>${label}</button>`;
    }).join('');
  }
  /** 상자 칸 누르기: 다 됐으면 열기, 잠겨 있으면 열기 시작(다른 게 여는 중이면 보석으로 바로), 여는 중이면 보석으로 바로 */
  private async tapChest(i: number): Promise<void> {
    const st = chestState(i);
    if (st === 'empty') return;
    if (st === 'ready') { const r = await act<Reveal | null>('openSlot', { i, pay: false }); if (r) showReveal(r, () => this.render()); return; }
    if (st === 'locked' && opening() < 0) { await act('startUnlock', { i }); audio.button(); this.render(); return; }
    const cost = chestOpenCost(chestLeftMs(i));
    // 다른 상자를 여는 중에 잠긴 상자를 누른 경우: 한 번에 하나씩만 열린다는 걸 먼저 알려 준다 (보석 부족 창보다 먼저)
    const waiting = st === 'locked';
    const msg = waiting
      ? tl('상자는 <b>한 번에 하나씩</b>만 열 수 있어요.<br>지금 여는 상자가 끝나면 이 상자를 열 수 있어요.<br><br>{0}를 {1}{2}로 바로 열까요?', CHESTS[meta.chests[i]!.kind].kr, icon('gem'), cost)
      : tl('{0}를 {1}{2}로 바로 열까요?', CHESTS[meta.chests[i]!.kind].kr, icon('gem'), cost);
    if (await confirmModal(waiting ? tl('상자 대기 중') : tl('바로 열기'), msg)) {
      if (meta.crystals < cost) { showShortage(cost - meta.crystals, undefined, () => this.render()); return; }
      const r = await act<Reveal | null>('openSlot', { i, pay: true });
      if (r) showReveal(r, () => this.render());
    }
  }

  // 트로피 로드: 아레나 구간과 보상 (도달하면 대전 결과에서 자동 수령)
  private openRoad(): void {
    const p = meta.pvp;
    const rows = TROPHY_ROAD.map((s) => {
      const done = meta.roadClaimed.includes(s.at);
      const reached = p.trophies >= s.at;
      const arena = PVP_TIERS.find((t) => t.min === s.at);
      const reward = s.crystals ? `${icon('gem')} ${s.crystals}` : `${roadRewardIcon(s)} ${roadRewardText(s)}`;
      return `${arena ? `<div class="road-arena tier-name" style="color:${arena.color}">${arena.kr} ${tl('아레나')}</div>` : ''}<div class="road-row ${done ? 'done' : reached ? 'ready' : ''}">
        <span class="road-at">${icon('trophy')}${s.at}</span><span class="road-rw">${reward}</span>
        <span class="road-st">${done ? icon('check') : reached ? '' : icon('lock')}</span></div>`;
    }).join('');
    openOverlay('panel', `<div class="dialog"><button class="close-x">${icon('close')}</button>
      <h2>${tl('트로피 로드')}</h2>
      <div class="fine" style="margin:-4px 0 10px">${icon('trophy')} ${p.trophies} ${tl('· 대전에서 이기면 트로피가 올라요')}</div>
      ${rows}</div>`, () => this.render());
  }

  // ======================= 설정 =======================
  private openSettings(): void {
    const draw = () => {
      // 음량 슬라이더 (0 이면 끔) - 끄는 동안 다시 그리지 않고 값만 바꾼다 (끌기가 끊기지 않게)
      const row = (ic: Parameters<typeof icon>[0], label: string, key: 'bgm' | 'sfx', vol: number) =>
        `<div class="row vol-row"><div class="ic">${icon(vol > 0 ? ic : 'mute')}</div><div class="info"><div class="t">${label}</div>
          <input class="vol" type="range" min="0" max="100" step="5" value="${Math.round(vol * 100)}" data-vol="${key}" style="--p:${Math.round(vol * 100)}%"></div>
          <span class="vol-n">${Math.round(vol * 100)}</span></div>`;
      const el = openOverlay('panel', `<div class="dialog"><button class="close-x">${icon('close')}</button>
        <h2>${tl('설정')}</h2>
        ${row('music', tl('배경음악'), 'bgm', audio.getBgmVolume())}
        ${row('sound', tl('효과음'), 'sfx', audio.getSfxVolume())}
        <div class="row lang-row"><div class="ic">${icon('flag')}</div><div class="info"><div class="t">Language · ${tl('언어')}</div>
          <div class="lang-list">${LANGS.map((l) => `<button class="btn small fit ${l.id === lang ? 'gold' : ''}" data-act="lang" data-l="${l.id}">${l.name}</button>`).join('')}</div></div></div>
        <div class="row"><div class="ic">${icon('play')}</div><div class="info"><div class="t">${tl('튜토리얼')}</div></div>
          <button class="btn small blue" data-act="replayTutorial">${tl('다시 하기')}</button></div>
        <div class="row"><div class="ic">${icon('trophy')}</div><div class="info"><div class="t">${esc(meta.nick)}</div></div>
          <button class="btn small blue" data-act="profile">${tl('프로필')}</button></div></div>`, () => this.render());
      bindActions(el, {
        profile: () => { closeOverlay('panel'); this.openProfile(); },
        lang: (b) => { if (b.dataset.l !== lang) setLang(b.dataset.l as Lang); },
        // 튜토리얼만 처음부터 (스테이지·보상 진행은 그대로) - 1-1 을 시작하면 안내가 다시 나온다
        replayTutorial: () => { meta.tutorial = 0; meta.seenFeatures = []; saveMeta(); closeOverlay('panel'); this.openStageInfo('1-1'); },
      });
      for (const input of el.querySelectorAll<HTMLInputElement>('input.vol')) {
        const key = input.dataset.vol as 'bgm' | 'sfx';
        const rowEl = input.closest('.vol-row')!;
        const show = () => {
          const v = Number(input.value);
          input.style.setProperty('--p', `${v}%`);
          rowEl.querySelector('.vol-n')!.textContent = String(v);
          rowEl.querySelector('.ic')!.innerHTML = icon(v > 0 ? (key === 'bgm' ? 'music' : 'sound') : 'mute');
          return v / 100;
        };
        input.addEventListener('input', () => {
          const v = show();
          if (key === 'bgm') audio.setBgmVolume(v); else audio.setSfxVolume(v);
        });
        if (key === 'sfx') input.addEventListener('change', () => audio.button()); // 놓으면 그 크기로 한 번 들려준다
      }
    };
    draw();
  }

  private questClaimable(): boolean {
    return DAILY_QUESTS.some((q) => (meta.daily.progress[q.key] || 0) >= q.goal && !meta.daily.claimed[q.key]);
  }
  private seasonClaimable(): boolean {
    const t = seasonTier();
    for (let i = 1; i <= t; i++) {
      if (!meta.season.claimedFree.includes(i)) return true;
      if (meta.season.premium && !meta.season.claimedPremium.includes(i)) return true;
    }
    return false;
  }

  // ======================= 프로필 =======================
  private openProfile(): void {
    const p = meta.pvp;
    const tier = pvpTier(p.trophies);
    const stars = STAGES.reduce((n, s) => n + stageStars(s.id), 0);
    const el = openOverlay('panel', `<div class="dialog"><button class="close-x">${icon('close')}</button>
      <h2>${tl('프로필')}</h2>
      <div class="row"><div class="info"><div class="t">${tl('닉네임')}</div><div class="d">${tl('PvP 상대와 랭킹에 표시됩니다')}</div></div>
        <input id="nick-input" maxlength="12" value="${esc(meta.nick)}" style="width:120px;padding:8px;border-radius:8px;border:none;font-family:inherit;font-size:15px"></div>
      <div class="row"><div class="info"><div class="t tier-name" style="color:${tier.color}">${icon('trophy')} ${tier.kr} · ${p.trophies}</div><div class="d">${tl('{0}승 {1}패 · 연승 {2}', p.wins, p.losses, p.streak)}</div></div></div>
      <div class="row"><div class="info"><div class="t">${icon('star')} ${tl('캠페인 별')} ${stars} / ${STAGES.length * 3}</div><div class="d">${tl('무한 모드 최고 {0}웨이브', meta.bestWave)}</div></div></div>
      <button class="btn green close" data-act="save">${tl('저장')}</button></div>`, () => this.render());
    bindActions(el, {
      save: () => {
        const v = ($('nick-input') as HTMLInputElement).value.trim().slice(0, 12);
        if (v) {
          meta.nick = v;
          saveMeta();
          // 온라인이면 서버 랭킹 이름도 바로 바꾼다
          if (online()) void import('./net/server').then((n) => n.callGlobal('setNick', { nick: v })).catch((e) => console.warn('[nick] 랭킹 이름 갱신 실패', e));
        }
        closeOverlay('panel');
      },
    });
  }

  // ======================= 스테이지 =======================
  private openStages(): void {
    const draw = () => {
      const c = this.selectedChapter;
      const chStars = chapterStars(c);
      const nodes = STAGES.filter((s) => s.chapter === c).map((s) => {
        const st = stageStars(s.id);
        const open = stageUnlocked(s.id);
        const isNext = open && st === 0;
        const unlockIc = s.unlocks && !unitUnlocked(s.unlocks) ? spriteIcon(unitIconUrl(s.unlocks), 'frame-sprite unlock-ic') : '';
        return `<button class="stage-node ${open ? '' : 'locked'} ${isNext ? 'next' : ''} ${s.id.endsWith('-10') ? 'boss' : ''}" data-act="stage" data-id="${s.id}">
          ${s.id}<span class="st">${open ? starIcons(st) : icon('lock')}</span>${unlockIc}</button>`;
      }).join('');
      const goals = CHAPTER_STAR_GOALS.map((g, i) => {
        const claimed = starRewardClaimed(c, i);
        const ready = chStars >= g && !claimed;
        return `<button class="btn small ${ready ? 'gold' : ''}" data-act="starGoal" data-i="${i}" ${ready ? '' : 'disabled'}>${icon('star')}${g} ${claimed ? icon('check') : `${icon('gem')}${chapterStarReward(i)}`}</button>`;
      }).join('');
      const el = openOverlay('panel', `<div class="dialog"><button class="close-x">${icon('close')}</button>
        <h2>${tl('스테이지')}</h2>
        ${`<div class="tab-row chap-tabs">${CHAPTERS.map((ch) => `<button data-act="chap" data-n="${ch.n}" class="${ch.n === c ? 'active' : ''}">${chapterUnlocked(ch.n) ? '' : icon('lock') + ' '}${ch.n}. ${ch.kr}</button>`).join('')}</div>`}
        <div class="fine" style="margin:-4px 0 10px">${CHAPTERS[c - 1].desc} ${tl('· 스테이지당 {0}웨이브', CHAPTERS[c - 1].waves)}</div>
        <div class="stage-grid">${nodes}</div>
        ${`<div class="section-title"><span>${tl('챕터 별 보상')}</span><span>${icon('star')} ${chStars}/30</span></div>
        <div class="star-goals">${goals}</div>`}</div>`, () => this.render());
      bindActions(el, {
        chap: (b) => { this.selectedChapter = Number(b.dataset.n); draw(); },
        stage: (b) => {
          const id = b.dataset.id!;
          if (!stageUnlocked(id)) { toast(tl('이전 스테이지를 먼저 클리어하세요')); return; }
          this.openStageInfo(id);
        },
        starGoal: async (b) => {
          const n = await act<number>('claimStarReward', { chapter: c, goal: Number(b.dataset.i) });
          if (n) { audio.coin(); toast(tl('별 보상 {0} +{1}', icon('gem'), n)); draw(); }
        },
      });
    };
    draw();
  }

  private openStageInfo(id: string): void {
    const st = STAGE_BY_ID[id];
    const stars = stageStars(id);
    let booster = false;
    const draw = () => {
      const races = (st.races ?? ['troll', 'orc', 'undead']).map((r) => raceIcon(r as Race)).join('');
      const deck = meta.deck.map((j) => `<div class="deck-slot filled">${spriteIcon(unitIconUrl(j))}<div>${UNIT_BY_ID[j].kr}</div></div>`).join('')
        + Array.from({ length: DECK_SIZE - meta.deck.length }, () => tl('<div class="deck-slot">빈 슬롯</div>')).join('');
      const el = openOverlay('modal', `<div class="dialog"><button class="close-x">${icon('close')}</button>
        <h2>${tl('스테이지')} ${id}</h2>
        <div style="text-align:center;font-size:22px;margin:-6px 0 6px">${starIcons(stars)}</div>
        <div class="stage-facts">
          <span>${icon('flag')} ${st.waves}</span><span>${icon('skull')} ${tl('보스')}</span><span class="races">${races}</span>
          <span>${icon('gem')} ${stars ? st.replayReward : st.firstReward}</span>
        </div>
        ${st.unlocks && !unitUnlocked(st.unlocks) ? `<div class="row" style="border:2px solid var(--gold)">${spriteIcon(unitIconUrl(st.unlocks), 'frame-sprite', 'width:40px;height:40px')}<div class="info"><div class="t">${UNIT_BY_ID[st.unlocks].kr} ${icon('lock')} → NEW</div></div></div>` : ''}
        <div class="section-title"><span>${tl('출전 덱')}</span><button class="btn small blue" data-act="editDeck">${tl('덱 편집')}</button></div>
        <div class="deck-row">${deck}</div>
        ${meta.items.goldBooster > 0 ? `<label class="row" style="cursor:pointer"><div class="ic">${icon('bag')}</div><div class="info"><div class="t">${tl('골드 부스터 사용')}</div><div class="d">${tl('시작 골드 2배 · 보유 {0}', meta.items.goldBooster)}</div></div><input type="checkbox" id="booster-chk" ${booster ? 'checked' : ''} style="width:22px;height:22px"></label>` : ''}
        <button class="btn red close" style="font-size:18px" data-act="go">${icon('sword')} ${tl('전투 시작')}</button></div>`);
      const chk = el.querySelector('#booster-chk') as HTMLInputElement | null;
      if (chk) chk.onchange = () => { booster = chk.checked; };
      bindActions(el, {
        editDeck: () => { closeOverlay('modal'); this.openUnits(() => this.openStageInfo(id)); },
        go: () => {
          closeOverlay('modal');
          closeOverlay('panel');
          this.onLaunch({ kind: 'stage', stageId: id, goldBooster: booster });
        },
      });
    };
    draw();
  }

  private openEndless(): void {
    let booster = false;
    const el = openOverlay('modal', `<div class="dialog"><button class="close-x">${icon('close')}</button>
      <h2>${icon('infinity')} ${tl('무한 모드')}</h2>
      <div class="row"><div class="ic">${icon('flag')}</div><div class="info"><div class="t">${tl('50웨이브 생존 도전')}</div><div class="d">${tl('최고 기록 {0}웨이브 · 도달 웨이브만큼 보석 획득', meta.bestWave)}</div></div></div>
      <div class="deck-row">${meta.deck.map((j) => `<div class="deck-slot filled">${spriteIcon(unitIconUrl(j))}<div>${UNIT_BY_ID[j].kr}</div></div>`).join('')}</div>
      ${meta.items.goldBooster > 0 ? `<label class="row"><div class="ic">${icon('bag')}</div><div class="info"><div class="t">${tl('골드 부스터 사용')}</div><div class="d">${tl('보유')} ${meta.items.goldBooster}</div></div><input type="checkbox" id="booster-chk2" style="width:22px;height:22px"></label>` : ''}
      <button class="btn red close" data-act="go">${icon('sword')} ${tl('시작')}</button></div>`);
    const chk = el.querySelector('#booster-chk2') as HTMLInputElement | null;
    if (chk) chk.onchange = () => { booster = chk.checked; };
    bindActions(el, { go: () => { closeOverlay('modal'); this.onLaunch({ kind: 'endless', goldBooster: booster }); } });
  }

  // ======================= 덱 (유닛 덱 · 몹 카드 덱) =======================
  // 카드를 위쪽 덱 칸으로 끌어 넣고, 칸끼리 끌어 바꾸고, 칸을 밖으로 끌어 뺀다. 버튼으로도 할 수 있다.
  private deckTab: 'units' | 'attacks' = 'units';
  private pickAttack: AttackKey | null = null; // 버튼으로 넣을 몹 카드 (칸을 누르면 들어감)
  private openUnits(after?: () => void): void {
    const draw = () => {
      const tab = this.deckTab;
      const tabs = `<div class="tab-row deck-tabs">
        <button class="${tab === 'units' ? 'active' : ''}" data-act="tab" data-tab="units">${icon('helmet')} ${tl('유닛')}</button>
        <button class="${tab === 'attacks' ? 'active' : ''}" data-act="tab" data-tab="attacks">${icon('skull')} ${tl('몹 카드')}</button></div>`;
      const body = tab === 'units' ? this.unitDeckHtml() : this.attackDeckHtml();
      const el = openOverlay('panel', `<div class="dialog deck-dialog"><button class="close-x">${icon('close')}</button>
        <h2>${tl('덱')} <span class="crystal" style="font-size:16px">${icon('gem')} ${meta.crystals}</span></h2>
        ${tabs}${body}</div>`, () => { this.pickAttack = null; this.render(); after?.(); });
      enableDeckDrag(el, (key, _from, to) => {
        let ok: boolean;
        if (tab === 'units') ok = to === 'out' ? removeDeck(key as Job) : placeDeck(key as Job, to);
        else ok = to === 'out' ? false : placeAttack(key as AttackKey, to);
        if (ok) audio.button();
        else if (to === 'out') toast(tab === 'units' ? tl('덱에 최소 1종은 있어야 해요') : tl('몹 카드는 4장 모두 들고 가요. 다른 카드를 칸에 놓아 바꾸세요'));
        draw();
      });
      bindActions(el, {
        tab: (b) => { this.deckTab = b.dataset.tab as 'units' | 'attacks'; this.pickAttack = null; draw(); },
        toggle: (b) => {
          if (!toggleDeck(b.dataset.job as Job)) toast(meta.deck.length >= DECK_SIZE ? tl('덱이 가득 찼어요. 덱 칸에 끌어 놓아 바꾸세요') : tl('덱에 최소 1종은 있어야 해요'));
          else audio.button();
          draw();
        },
        up: async (b) => {
          const j = b.dataset.job as Job;
          const cc = unitCards(j);
          if (cc.have < cc.need) { toast(tl('카드 {0}장이 더 필요해요 · 상자와 뽑기에서 얻어요', cc.need - cc.have)); return; }
          const cost = unitUpgradeCost(unitLevel(j));
          if (meta.crystals < cost) { showShortage(cost - meta.crystals, undefined, draw); return; }
          if (await act<boolean>('upgradeUnit', { job: j })) { audio.merge(); draw(); }
        },
        buy: async (b) => {
          const j = b.dataset.job as Job;
          const need = (UNIT_BY_ID[j].unlockCrystals ?? 0) - meta.crystals;
          if (need > 0) { showShortage(need, j, draw); return; } // 유닛 패키지를 먼저 제안
          if (await confirmModal(tl('유닛 해금'), tl('{0}을(를) {1}{2}로 해금할까요?', UNIT_BY_ID[j].kr, icon('gem'), UNIT_BY_ID[j].unlockCrystals))) {
            if (await act<boolean>('buyUnit', { job: j })) { audio.fanfareUnlock(); toast(tl('{0} 해금!', UNIT_BY_ID[j].kr)); }
          }
          draw();
        },
        pick: (b) => { const k = b.dataset.key as AttackKey; this.pickAttack = this.pickAttack === k ? null : k; audio.button(); draw(); },
        recs: () => { audio.button(); this.openDeckPresets(tab, draw); },
        slot: (b) => {
          if (tab !== 'attacks' || !this.pickAttack) return;
          if (placeAttack(this.pickAttack, Number(b.dataset.dropSlot))) audio.button();
          this.pickAttack = null;
          draw();
        },
      });
    };
    draw();
  }

  /** 추천 덱 목록 - 다 가진 덱은 바로 장착, 없는 카드는 잠금 */
  private openDeckPresets(tab: 'units' | 'attacks', after: () => void): void {
    const units = tab === 'units';
    const list = (units ? UNIT_PRESETS : ATTACK_PRESETS) as DeckPreset<string>[];
    const has = (k: string) => (units ? unitUnlocked(k as Job) : attackUnlocked(k as AttackKey));
    const ic = (k: string) => {
      if (units) return spriteIcon(unitIconUrl(k as Job));
      const a = ATTACK_BY_KEY[k as AttackKey];
      return spriteIcon(mobSprite(a.race, a.variant).url);
    };
    const name = (k: string) => (units ? UNIT_BY_ID[k as Job].kr : ATTACK_BY_KEY[k as AttackKey].kr);
    const cur = units ? meta.deck : meta.attackDeck;
    const rows = list.map((p, i) => {
      const missing = p.cards.filter((k) => !has(k)).length;
      const same = p.cards.length === cur.length && p.cards.every((k) => (cur as string[]).includes(k));
      const cards = p.cards.map((k) => `<div class="pr-card ${has(k) ? '' : 'locked'}" ${units ? `data-tip-unit="${k}"` : ''}>${ic(k)}<span>${name(k)}</span>${has(k) ? '' : `<i class="pr-lock">${icon('lock')}</i>`}</div>`).join('');
      const btn = same ? `<button class="btn small" disabled>${icon('check')} ${tl('사용 중')}</button>`
        : missing ? `<button class="btn small" disabled>${icon('lock')} ${tl('{0}장 없음', missing)}</button>`
        : `<button class="btn small gold" data-act="use" data-i="${i}">${tl('장착')}</button>`;
      return `<div class="preset ${missing ? 'locked' : ''}"><div class="pr-head"><b>${p.name}</b>${btn}</div><div class="pr-desc">${p.desc}</div><div class="pr-cards">${cards}</div></div>`;
    }).join('');
    const el = openOverlay('modal', `<div class="dialog preset-dialog"><button class="close-x">${icon('close')}</button>
      <h2>${tl('추천')} ${units ? tl('유닛') : tl('몹 카드')} ${tl('덱')}</h2><div class="preset-list">${rows}</div></div>`);
    bindActions(el, {
      use: (b) => {
        const p = list[Number(b.dataset.i)];
        if (!p.cards.every(has)) return;
        if (units) meta.deck = [...p.cards] as Job[];
        else meta.attackDeck = [...p.cards] as AttackKey[];
        saveMeta();
        audio.merge();
        toast(tl('{0} 덱 장착', p.name));
        closeOverlay('modal');
        after();
      },
    });
  }

  private unitDeckHtml(): string {
    const slots = Array.from({ length: DECK_SIZE }, (_, i) => {
      const j = meta.deck[i];
      return j
        ? `<div class="deck-slot filled" data-drop-slot="${i}" data-drag="${j}" data-slot="${i}">${spriteIcon(unitIconUrl(j))}<div>${UNIT_BY_ID[j].kr}</div></div>`
        : `<div class="deck-slot" data-drop-slot="${i}">${icon('plus')}</div>`;
    }).join('');
    // 가진 유닛을 위로 (넣기 쉽게), 그 안에서는 원래 순서
    const owned = (id: Job) => (unitLevel(id) > 0 ? 0 : 1);
    const cards = [...UNITS].sort((a, b) => owned(a.id) - owned(b.id)).map((u) => {
      const lv = unitLevel(u.id);
      const unlocked = lv > 0;
      const inDeck = meta.deck.includes(u.id);
      // 카드 막대: 다음 레벨까지 모은 카드 (다 모이면 초록 + '레벨업')
      const cc = unitCards(u.id);
      const maxLv = lv >= UNIT_MAX_LEVEL;
      const ready = unlocked && !maxLv && cc.have >= cc.need;
      const bar = unlocked
        ? `<div class="card-bar ${ready ? 'ready' : ''}"><div style="width:${maxLv ? 100 : Math.min(100, (cc.have / cc.need) * 100)}%"></div><span>${maxLv ? 'MAX' : `${icon('ticket')}${cc.have}/${cc.need}`}</span></div>`
        : `<div class="card-bar locked"><span>${u.unlockCrystals || roadUnlockAt(u.id) || u.unlockStage ? '' : tl('상자·뽑기에서')}</span></div>`;
      let acts: string;
      if (!unlocked) {
        acts = u.unlockCrystals
          ? `<button class="btn small gold ${meta.crystals < u.unlockCrystals ? 'short' : ''}" data-act="buy" data-job="${u.id}">${icon('gem')}${u.unlockCrystals} ${tl('해금')}</button>`
          : '';
      } else {
        const maxed = lv >= UNIT_MAX_LEVEL;
        acts = `<button class="btn small ${inDeck ? 'red' : 'blue'}" data-act="toggle" data-job="${u.id}">${inDeck ? tl('빼기') : tl('넣기')}</button>
          <button class="btn small ${ready ? 'green' : 'gray-btn'} ${ready && meta.crystals < unitUpgradeCost(lv) ? 'short' : ''}" data-act="up" data-job="${u.id}" ${maxed ? 'disabled' : ''}>${maxed ? 'MAX' : `${tl('강화')} ${icon('gem')}${unitUpgradeCost(lv)}`}</button>`;
      }
      return `<div class="unit-card ${inDeck ? 'in-deck' : ''} ${unlocked ? '' : 'locked'} ${ready ? 'can-level' : ''}" ${unlocked ? `data-drag="${u.id}"` : ''} style="--rc:${RARITY_COLOR[u.rarity]}">
        <span class="rarity-tag">${RARITY_KR[u.rarity]}</span>
        <div class="head">${spriteIcon(unitIconUrl(u.id))}
          <div><div class="nm">${u.kr}</div><div class="lv">${unlocked ? `Lv.${lv}` : `${icon('lock')} ${[roadUnlockAt(u.id) ? `${icon('trophy')}${roadUnlockAt(u.id)}` : '', u.unlockStage ?? ''].filter(Boolean).join(' / ') || icon('chest')}`}</div></div></div>
        ${bar}
        <div class="sk" data-tip-skill="${u.id}"><b>${SKILL_KR[u.id]}</b> <span class="info-dot">?</span></div>
        <div class="u-role">${u.role !== SKILL_KR[u.id] ? u.role : ''}</div>
        ${unitStatsHtml(u.id, Math.max(1, lv))}
        <div class="acts">${acts}</div></div>`;
    }).join('');
    const gap = deckMin() - meta.deck.length;
    return `${gap > 0 ? `<div class="deck-warn">${icon('warning')} ${tl('덱에 빈 칸이 {0}개 있어요 · 소환 비용 {1}{2} (4칸을 채우면 {1}{3})', gap, icon('coin'), Math.round(ECONOMY.summonCost * (1 + gap * ECONOMY.deckGapPenalty)), ECONOMY.summonCost)}</div>` : ''}<div class="deck-hint">${icon('pointer')} ${tl('꾹 눌러 칸으로 끌기')}${RECS_BTN}</div>
      <div class="deck-row">${slots}</div>
      <div class="unit-grid">${cards}</div>`;
  }

  private attackDeckHtml(): string {
    const pick = this.pickAttack;
    const mobIc = (k: AttackKey) => { const a = ATTACK_BY_KEY[k]; return spriteIcon(mobSprite(a.race, a.variant).url); };
    const slots = Array.from({ length: ATTACK_DECK_SIZE }, (_, i) => {
      const k = meta.attackDeck[i];
      return `<div class="deck-slot filled ${pick ? 'pickable' : ''}" data-act="slot" data-drop-slot="${i}" data-drag="${k}" data-slot="${i}">
        ${mobIc(k)}<div>${ATTACK_BY_KEY[k].kr}</div></div>`;
    }).join('');
    // 해금된 몹 카드를 위로 (넣기 쉽게), 그 안에서는 원래 순서
    const locked = (k: AttackKey) => (attackUnlocked(k) ? 0 : 1);
    const cards = [...ATTACKS].sort((a, b) => locked(a.key) - locked(b.key)).map((a) => {
      const open = attackUnlocked(a.key);
      const inDeck = meta.attackDeck.includes(a.key);
      const at = attackUnlockAt(a.key);
      const counters = a.counters.map((j) => `<span class="tip-unit" data-tip-unit="${j}">${spriteIcon(unitIconUrl(j), 'frame-sprite mini')}</span>`).join('');
      const act = !open ? `<div class="lock">${icon('lock')} ${icon('trophy')}${at}</div>`
        : inDeck ? `<div class="in">${icon('check')} ${tl('덱')}</div>`
        : `<button class="btn small ${pick === a.key ? 'gold' : 'blue'}" data-act="pick" data-key="${a.key}">${pick === a.key ? tl('칸 선택') : tl('넣기')}</button>`;
      return `<div class="mob-card ${inDeck ? 'in-deck' : ''} ${open ? '' : 'locked'} ${pick === a.key ? 'picked' : ''}" ${open ? `data-drag="${a.key}"` : ''}>
        <div class="head">${mobIc(a.key)}<div><div class="nm">${a.kr}</div><div class="cost">${icon('coin')}${a.cost}${a.cooldown ? ` · ${icon('timer')}${Math.round(a.cooldown / PLAY_SPEED)}s` : ''}</div></div></div>
        <div class="ds">${a.desc}</div>
        ${mobStatsHtml(a)}
        <div class="ctr"><span>${tl('막는 유닛')}</span>${counters}</div>
        <div class="acts">${act}</div></div>`;
    }).join('');
    return `<div class="deck-hint">${pick ? tl('{0} 넣을 칸을 누르세요', icon('pointer')) : tl('{0} 꾹 눌러 칸으로 끌기 · 대전에서 상대에게 던져요', icon('pointer'))}${RECS_BTN}</div>
      <div class="deck-row">${slots}</div>
      <div class="unit-grid">${cards}</div>`;
  }

  // ======================= 연구 =======================
  private openResearch(): void {
    if (!featureUnlocked('research')) return;
    const draw = () => {
      const rows = RESEARCH.map((r) => {
        const lv = researchLevel(r.key);
        const maxed = lv >= r.max;
        const cost = researchCost(lv);
        return `<div class="row"><div class="info"><div class="t">${r.kr} <span class="trophy">Lv.${lv}/${r.max}</span></div>
          <div class="d">${r.desc}</div><div class="lv-pips" style="margin-top:4px">${Array.from({ length: r.max }, (_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('')}</div></div>
          <button class="btn small green ${!maxed && meta.crystals < cost ? 'short' : ''}" data-act="res" data-key="${r.key}" ${maxed ? 'disabled' : ''}>${maxed ? 'MAX' : `${icon('gem')} ${cost}`}</button></div>`;
      }).join('');
      const el = openOverlay('panel', `<div class="dialog"><button class="close-x">${icon('close')}</button>
        <h2>${tl('연구소')} <span class="crystal" style="font-size:16px">${icon('gem')} ${meta.crystals}</span></h2>
        <div class="fine" style="margin:-4px 0 8px">${tl('보석으로 올리면 대전·캠페인·무한 모드 모든 판에 계속 적용돼요')}</div>
        ${rows}</div>`, () => this.render());
      bindActions(el, {
        res: async (b) => {
          const key = b.dataset.key as ResearchKey;
          const lv = researchLevel(key);
          const r = RESEARCH.find((x) => x.key === key)!;
          const cost = researchCost(lv);
          if (lv < r.max && meta.crystals < cost) { showShortage(cost - meta.crystals, undefined, draw); return; }
          if (lv < r.max && meta.crystals >= cost && await act<boolean>('research', { key })) {
            audio.merge();
            draw();
          }
        },
      });
    };
    draw();
  }

  // ======================= 퀘스트 =======================
  private openQuests(): void {
    const draw = () => {
      const daily = DAILY_QUESTS.map((q) => {
        const prog = Math.min(q.goal, meta.daily.progress[q.key] || 0);
        const done = prog >= q.goal;
        const claimed = meta.daily.claimed[q.key];
        return `<div class="row"><div class="info"><div class="t">${q.kr}</div>
          <div class="chap-bar" style="margin-top:4px"><div style="width:${(prog / q.goal) * 100}%"></div></div><div class="d">${prog}/${q.goal}</div></div>
          <button class="btn small ${done && !claimed ? 'gold' : ''}" data-act="daily" data-key="${q.key}" ${!done || claimed ? 'disabled' : ''}>${claimed ? tl('완료') : `${icon('gem')} ${q.reward}`}</button></div>`;
      }).join('');
      const ach = ACHIEVEMENTS.map((a) => `<div class="row"><div class="info"><div class="t">${a.kr}</div><div class="d">${tl('보상')} ${icon('gem')} ${a.reward}</div></div>
        <span class="${meta.achievements[a.key] ? 'trophy' : 'fine'}">${meta.achievements[a.key] ? tl('달성 {0}', icon('check')) : tl('미달성')}</span></div>`).join('');
      const el = openOverlay('panel', `<div class="dialog"><button class="close-x">${icon('close')}</button>
        <h2>${tl('퀘스트')}</h2>
        <div class="section-title">${tl('일일 퀘스트')} <span class="fine">${tl('매일 0시(UTC) 초기화')}</span></div>${daily}
        <div class="section-title">${tl('업적')}</div>${ach}</div>`, () => this.render());
      bindActions(el, {
        daily: async (b) => {
          const key = b.dataset.key!;
          const q = DAILY_QUESTS.find((x) => x.key === key)!;
          if ((meta.daily.progress[key] || 0) >= q.goal && !meta.daily.claimed[key]) {
            meta.daily.claimed[key] = true;
            saveMeta();
            if (await act<number>('claimQuest', { key })) audio.coin();
            draw();
          }
        },
      });
    };
    draw();
  }

  /** 확률 정보 (뽑기·상자) - 규칙은 econ/rules.ts 의 gacha / rollChest 와 같다 */
  private openOdds(): void {
    const pct = (p: number) => `${+(p * 100).toFixed(p * 100 < 1 ? 3 : 2)}%`;
    const rarities = ['common', 'rare', 'epic', 'legendary'] as const;
    const poolSize = (r: (typeof rarities)[number]) => UNITS.filter((u) => u.rarity === r).length;
    const gachaRows = rarities.map((r) => `<tr><td style="color:${RARITY_COLOR[r]}">${RARITY_KR[r]}</td><td>${pct(GACHA.rates[r])}</td><td>${tl('{0}장', GACHA.count[r])}</td><td>${tl('{0}종', poolSize(r))}</td><td>${pct(GACHA.rates[r] / poolSize(r))}</td></tr>`).join('');
    const a = Math.max(0, PVP_TIERS.filter((t) => meta.pvp.trophies >= t.min).length - 1);
    const chestRows = (Object.keys(CHESTS) as (keyof typeof CHESTS)[]).map((k) => {
      const d = CHESTS[k];
      const total = d.cards + d.perArena * a;
      const epicBase = Math.floor(d.epic), epicChance = d.epic % 1;
      const rare = Math.min(total - epicBase, Math.round(d.rare * (1 + a * 0.25)));
      const epicTxt = !epicChance ? tl('{0}장', epicBase) : epicBase ? tl('{0}장 +{1}', epicBase, pct(epicChance)) : tl('{0}로 1장', pct(epicChance));
      return `<tr><td>${d.kr}</td><td>${tl('{0}장', total)}</td><td>${tl('{0}장', rare)}</td><td>${epicTxt}</td><td>${d.legendary >= 1 ? tl('1장') : d.legendary ? tl('{0}로 1장', pct(d.legendary)) : '-'}</td><td>${d.gems[0]}~${d.gems[1]}</td></tr>`;
    }).join('');
    openOverlay('modal', `<div class="dialog odds-dialog"><button class="close-x">${icon('close')}</button>
      <h2>${tl('확률 정보')}</h2>
      <div class="section-title">${tl('유닛 뽑기')}</div>
      <table class="odds"><tr><th>${tl('등급')}</th><th>${tl('확률')}</th><th>${tl('카드')}</th><th>${tl('유닛 수')}</th><th>${tl('유닛 1종')}</th></tr>${gachaRows}</table>
      <div class="fine">${tl('· 1회마다 위 확률로 등급을 정하고, 그 등급 유닛 중 하나가 같은 확률로 나와요.')}<br>
      ${tl('· 10회 뽑기에서 영웅·전설이 하나도 없으면 마지막 1회가 영웅(영웅 {0}종 중 무작위)으로 바뀌어요.', poolSize('epic'))}</div>
      <div class="section-title">${tl('상자')} <span class="fine">${tl('지금 아레나({0}) 기준', PVP_TIERS[a].kr)}</span></div>
      <table class="odds"><tr><th>${tl('상자')}</th><th>${tl('카드')}</th><th>${tl('희귀')}</th><th>${tl('영웅')}</th><th>${tl('전설')}</th><th>${icon('gem')}</th></tr>${chestRows}</table>
      <div class="fine">${tl('· 나머지 카드는 일반이에요. 아레나가 오를수록 카드 장수와 희귀 카드가 늘어요.')}<br>
      ${tl('· 유닛은 같은 등급 안에서 무작위로 정해지고, 일반은 3종·희귀는 2종에 나눠 담겨요. 보석은 범위 안에서 같은 확률이에요.')}<br>
      ${tl('· 금·마법·전설 상자는 상점에서 사면 바로 열려요. 나무·은 상자는 대전 승리로만 얻어요.')}</div>
      <button class="btn red" data-close style="width:100%;margin-top:8px">${tl('확인')}</button></div>`);
  }

  // ======================= 상점 =======================
  openShop(): void {
    markDotSeen('shop'); // 열어 봤으면 로비 점은 끈다 (광고를 안 봐도)
    const plat = getPlatform();
    const price = (id: string) => plat.priceOf(id) ?? 0;
    const draw = () => {
      const vx = plat.getVX();
      const card = (id: string, hot = false) => {
        const p = PRODUCTS.find((x) => x.id === id)!;
        const owned = productOwned(id);
        let extra = '';
        if (id === 'monthly_pass' && monthlyActive()) extra = ` <span class="badge green">${tl('{0}일 남음', monthlyDaysLeft())}</span>`;
        if (p.category === 'offer') extra = ` <span class="badge">${icon('timer')}${tl('{0}시간 {1}분', ...timeLeft(id).split(':').slice(0, 2))}</span>`;
        const eff = owned ? 0 : productEfficiency(p, price(id));
        return `<div class="shop-card ${hot ? 'hot' : ''}">${eff > 100 ? `<span class="eff">${tl('효율')}<b>${eff}%</b></span>` : ''}<img class="shop-img" src="/ui/shop/${p.id}.png" alt="">
          <div class="info"><div class="t"><span class="nm">${p.kr}</span>${p.badge ? `<span class="badge">${p.badge}</span>` : ''}${extra}</div><div class="d">${p.desc}</div></div>
          <button class="btn small ${owned ? '' : 'gold'}" data-act="buy" data-id="${id}" ${owned ? 'disabled' : ''}>${owned ? tl('보유 {0}', icon('check')) : `VX ${price(id)}`}</button></div>`;
      };
      const gems = PRODUCTS.filter((p) => p.category === 'crystal').map((p) => {
        const eff = productEfficiency(p, price(p.id));
        return `<div class="gem-card">
        ${eff > 100 ? `<span class="eff">${tl('효율')}<b>${eff}%</b></span>` : ''}<img class="shop-img" src="/ui/shop/${p.id}.png" alt=""><div>${p.kr}</div>
        <button class="btn small gold" data-act="buy" data-id="${p.id}">VX ${price(p.id)}</button></div>`;
      }).join('');
      const tix = meta.items.gachaTicket || 0;
      // 무료: 광고 보고 뽑기권 (오늘 남은 횟수가 있으면 빨간 점)
      const adLeft = freeTicketAdsLeft();
      const free = rewardedAvailable()
        ? `<div class="section-title">${tl('무료')}</div>
          <div class="row free-row"><div class="ic">${icon('tv')}${adLeft ? '<span class="dot"></span>' : ''}</div><div class="info"><div class="t">${tl('광고 보고 뽑기권 {0}장', FREE_TICKET_AMOUNT)}</div><div class="d">${tl('오늘 {0}회 남음', adLeft)}</div></div>
            <button class="btn small blue" data-act="adTicket" ${adLeft ? '' : 'disabled'}>${tl('받기')}</button></div>` : '';
      const items = Object.entries(meta.items).map(([k, n]) => `<span class="tip-item" data-tip-item="${k}">${icon(ITEM_KR[k as keyof typeof ITEM_KR].icon)}${n}</span>`).join(' · ');
      const el = openOverlay('panel', `<div class="dialog"><button class="close-x">${icon('close')}</button>
        <h2>${tl('상점')}</h2>
        <div class="balance"><span class="crystal">${icon('gem')} ${meta.crystals.toLocaleString()}</span>${vx !== null ? `<span class="vx-badge">VX ${vx.toLocaleString()}</span>` : ''}</div>
        <div class="fine" style="margin:-4px 0 6px">${tl('보유: {0}', items)}</div>
        ${free}
        ${activeOffers().length ? `<div class="section-title hot-title">${icon('timer')} ${tl('한정 특가')}</div>${activeOffers().map((o) => card(o.id, true)).join('')}` : ''}
        <div class="section-title">${tl('유닛 뽑기')} <span class="fine">${tl('카드로 해금·레벨업')}</span><button class="btn small odds-btn" data-act="odds">${tl('확률 정보')}</button></div>
        <div class="gacha-row">
          <button class="btn blue gacha-btn" data-act="gacha" data-n="1"${tix >= 1 ? ' data-ticket="1"' : ''}>${tl('1회')}<small>${tix >= 1 ? `${icon('ticket')}1 ${tl('(보유 {0})', tix)}` : `${icon('gem')}${GACHA.one}`}</small></button>
          <button class="btn gold gacha-btn" data-act="gacha" data-n="10"${tix >= 10 ? ' data-ticket="1"' : ''}>${tl('10회')}<small>${tix >= 10 ? `${icon('ticket')}10` : `${icon('gem')}${GACHA.ten}`}</small><small class="g-note">${tl('영웅+ 보장')}</small></button>
        </div>
        <div class="fine" style="margin:-4px 0 8px">${(['common', 'rare', 'epic', 'legendary'] as const).map((r) => `<span style="color:${RARITY_COLOR[r]}">${RARITY_KR[r]} ${Math.round(GACHA.rates[r] * 100)}%</span>`).join(' · ')}</div>
        ${card('summon_ticket_pack')}
        <div class="section-title">${tl('상자')} <button class="btn small odds-btn" data-act="odds">${tl('확률 정보')}</button></div>
        ${card('chest_gold')}${card('chest_magic')}${card('chest_legend', true)}
        <div class="section-title">${tl('추천 패키지')}</div>
        ${!productOwned('starter_pack') ? card('starter_pack', true) : ''}
        ${card('monthly_pass', true)}
        ${card('ad_remove')}
        ${UNITS.some((u) => unitPackAvailable(u.id)) ? `<div class="section-title">${tl('유닛 패키지')} <span class="fine">${tl('바로 해금 + Lv5')}</span></div>${UNITS.filter((u) => unitPackAvailable(u.id)).map((u) => card(UNIT_PACK[u.id]!)).join('')}` : ''}
        <div class="section-title">${tl('PvP 시즌 패스')}</div>${card('season_premium')}
        <div class="section-title">${tl('부스터')} <span class="fine">${tl('캠페인·무한 모드 전용')}</span></div>
        ${card('gold_booster_pack')}
        <div class="section-title">${tl('보석')}</div><div class="gem-grid">${gems}</div>
        <div class="fine">${vx !== null ? tl('* 로컬 개발 환경: 데모 VX 로 결제를 흉내냅니다.') : tl('* 결제는 Verse8 VX 로 진행되며, 결제 완료 후 자동 지급됩니다.')}</div></div>`, () => this.render());
      bindActions(el, {
        odds: () => { audio.button(); this.openOdds(); },
        adTicket: async () => {
          if (await watchForTickets()) { audio.coin(); toast(tl('뽑기권 +{0} {1}', FREE_TICKET_AMOUNT, icon('ticket'))); }
          draw();
        },
        buy: async (b) => {
          const id = b.dataset.id!;
          (b as HTMLButtonElement).disabled = true;
          const got = await purchase(id);
          if (got.length) {
            audio.fanfareUnlock();
            toast(tl('구매 완료: {0}', got.map((g) => PRODUCTS.find((p) => p.id === g)?.kr).join(', ')));
          } else {
            toast(tl('결제가 완료되지 않았어요'));
          }
          draw();
          if (pendingReveals.length) flushReveals(draw); // 상자를 샀으면 바로 공개
        },
        gacha: async (b) => {
          const n = Number(b.dataset.n) as 1 | 10;
          const ticket = b.dataset.ticket === '1'; // 뽑기권이 있으면 보석 대신 뽑기권
          const cost = n === 1 ? GACHA.one : GACHA.ten;
          if (!ticket && meta.crystals < cost) { showShortage(cost - meta.crystals, undefined, draw); return; }
          const r = await act<Reveal | null>('gacha', { n, ticket });
          if (r) { draw(); showReveal(r, draw); }
        },
      });
    };
    draw();
  }

  // ======================= PvP =======================
  /** 랭킹 / 시즌 패스 창 (대전은 로비의 '대전 시작') */
  private spScroll: number | null = null; // 시즌 패스 띠 스크롤 위치 (창을 다시 그릴 때 유지)
  openPvp(tab: 'pass' | 'rank' = 'rank'): void {
    this.spScroll = null;
    const draw = async () => {
      let body = '';
      if (tab === 'pass') {
        const t = seasonTier();
        const inTier = meta.season.xp % SEASON_XP_PER_TIER;
        // 단계마다 큰 카드 (위: 프리미엄, 아래: 무료). 옆으로 넘기는 띠 - 열면 지금 단계로 이동
        const bigIc = (r: SeasonReward) => icon(r.items?.gachaTicket ? 'ticket' : r.items?.goldBooster ? 'bag' : 'gem');
        const cell = (r: SeasonReward, n: number, prem: boolean, cls: string) => `<button class="sp-cell ${prem ? 'prem' : 'free'} ${cls}" data-act="claim" data-n="${n}" data-p="${prem ? 1 : 0}">
            <span class="sp-tag">${prem ? tl('프리미엄') : tl('무료')}</span>
            <span class="sp-ic">${bigIc(r)}</span><span class="sp-amt">${rewardText(r)}</span>
            <span class="sp-state">${cls === 'done' ? tl('{0} 받음', icon('check')) : cls === 'ready' ? tl('받기!') : icon('lock')}</span></button>`;
        const tiers = SEASON_TIERS.map((def, i) => {
          const n = i + 1;
          const reached = n <= t;
          const fCls = meta.season.claimedFree.includes(n) ? 'done' : reached ? 'ready' : 'lock';
          const pCls = meta.season.claimedPremium.includes(n) ? 'done' : reached && meta.season.premium ? 'ready' : 'lock';
          return `<div class="sp-tier ${reached ? 'reached' : ''} ${n === Math.max(1, t) ? 'current' : ''}" data-n="${n}">
            <div class="sp-n">${n}</div>${cell(def.premium, n, true, pCls)}${cell(def.free, n, false, fCls)}</div>`;
        }).join('');
        body = `<div class="pass-head"><div class="lvl">${t}</div><div style="flex:1">
            <div class="fine fit" style="text-align:left">${tl('시즌')} ${currentSeasonId().slice(1)} ${tl('· 다음 단계까지')} ${SEASON_XP_PER_TIER - inTier} XP</div>
            <div class="pass-bar"><div style="width:${t >= SEASON_TIERS.length ? 100 : (inTier / SEASON_XP_PER_TIER) * 100}%"></div></div></div></div>
          ${meta.season.premium ? '' : `<button class="btn gold close" data-act="buyPass" style="margin:0 0 10px">${icon('trophy')} ${tl('프리미엄 패스 구매')}</button>`}
          <div class="sp-wrap"><button class="sp-arrow l" data-act="spMove" data-d="-1" aria-label="${tl('이전')}">${icon('play')}</button>
            <div class="sp-track" id="sp-track">${tiers}</div>
            <button class="sp-arrow r" data-act="spMove" data-d="1" aria-label="${tl('다음')}">${icon('play')}</button></div>
          <div class="fine" style="margin-top:6px">${tl('옆으로 넘겨 보세요 · 대전에서 이기면 XP')}</div>`;
      } else {
        body = tl('<div class="fine">불러오는 중...</div>');
      }
      const el = openOverlay('panel', `<div class="dialog"><button class="close-x">${icon('close')}</button>
        <h2>${tab === 'pass' ? tl('시즌 패스') : tl('랭킹')}</h2>
        <div id="pvp-body">${body}</div></div>`, () => this.render());
      // 시즌 패스 띠: 처음 열 때는 지금 단계를 가운데로, 다시 그릴 때(보상 받기)는 보던 위치 그대로
      const track = el.querySelector<HTMLElement>('#sp-track');
      if (track) {
        if (this.spScroll === null) {
          const cur = track.querySelector<HTMLElement>('.sp-tier.current');
          if (cur) track.scrollLeft = cur.offsetLeft - (track.clientWidth - cur.offsetWidth) / 2;
        } else track.scrollLeft = this.spScroll;
        track.addEventListener('scroll', () => { this.spScroll = track.scrollLeft; }, { passive: true });
      }
      bindActions(el, {
        spMove: (b) => {
          // 지금 가운데 카드에서 2장 옆 카드를 가운데로 (스냅과 싸우지 않게 정확한 위치로 이동)
          const tr = el.querySelector<HTMLElement>('#sp-track');
          if (!tr) return;
          const cards = Array.from(tr.querySelectorAll<HTMLElement>('.sp-tier'));
          const mid = tr.scrollLeft + tr.clientWidth / 2;
          let cur = 0;
          cards.forEach((c, i) => { if (Math.abs(c.offsetLeft + c.offsetWidth / 2 - mid) < Math.abs(cards[cur].offsetLeft + cards[cur].offsetWidth / 2 - mid)) cur = i; });
          const to = cards[Math.max(0, Math.min(cards.length - 1, cur + Number(b.dataset.d) * 2))];
          // 부드러운 스크롤은 스냅과 부딪혀 중간에 멈추므로, 이동하는 동안 스냅을 끄고 직접 움직인다
          const from = tr.scrollLeft, target = Math.max(0, to.offsetLeft - (tr.clientWidth - to.offsetWidth) / 2), t0 = performance.now();
          tr.style.scrollSnapType = 'none';
          const step = (now: number) => {
            const k = Math.min(1, (now - t0) / 260);
            tr.scrollLeft = from + (target - from) * (1 - (1 - k) ** 3);
            if (k < 1) requestAnimationFrame(step); else tr.style.scrollSnapType = '';
          };
          requestAnimationFrame(step);
        },
        claim: async (b) => {
          const ok = await claimSeasonReward(Number(b.dataset.n), b.dataset.p === '1');
          if (ok) { audio.coin(); toast(tl('시즌 보상 획득!')); void draw(); }
        },
        buyPass: async () => {
          const got = await purchase('season_premium');
          if (got.length) { audio.fanfareUnlock(); toast(tl('프리미엄 시즌 패스 활성화!')); }
          void draw();
        },
      });
      if (tab === 'rank') await this.drawRanking();
    };
    void draw();
  }

  /**
   * 랭킹: 받아 온 목록을 기억해 두고 창을 열면 바로 그린 뒤 새로 받아 바꾼다 (서버 응답을 기다리는 동안 빈 창이 보이지 않게).
   * 로비에 들어올 때 미리 한 번 받아 둔다 (prefetchRanking).
   */
  private rankHtml = '';
  private rankFetch: Promise<string> | null = null;
  private fetchRanking(): Promise<string> {
    if (this.rankFetch) return this.rankFetch;
    this.rankFetch = (async () => {
      const net = await import('./net/server');
      const res = await net.callGlobal<{ top: { account: string; nick: string; trophies: number }[]; me: { trophies: number } }>('pvpLeaderboard');
      const mine = net.myAccount();
      this.rankHtml = res.top.length
        ? res.top.map((r, i) => `<div class="rank-row ${r.account === mine ? 'me' : ''}"><span class="r">${i < 3 ? icon((['medal', 'medal_silver', 'medal_bronze'] as const)[i]) : i + 1}</span>
            <span>${esc(r.nick)} <span class="fine">${pvpTier(r.trophies).kr}</span></span><span class="trophy">${icon('trophy')} ${r.trophies}</span></div>`).join('')
        : tl('<div class="fine">아직 기록이 없습니다. 첫 승리를 차지하세요!</div>');
      return this.rankHtml;
    })().finally(() => { this.rankFetch = null; });
    return this.rankFetch;
  }
  prefetchRanking(): void {
    if (onlineAvailable() && !this.rankHtml) void this.fetchRanking().catch(() => {});
  }
  private async drawRanking(): Promise<void> {
    const body = $('pvp-body');
    if (!onlineAvailable()) {
      body.innerHTML = `<div class="fine">${tl('랭킹은 Verse8 환경(게임서버 연결)에서 표시됩니다.')}</div>
        <div class="rank-row me"><span class="r">-</span><span>${esc(meta.nick)}</span><span class="trophy">${icon('trophy')} ${meta.pvp.trophies}</span></div>`;
      return;
    }
    if (this.rankHtml) body.innerHTML = this.rankHtml; // 지난번 목록을 바로
    try {
      const html = await this.fetchRanking();
      if (document.body.contains(body)) body.innerHTML = html;
    } catch {
      if (!this.rankHtml) body.innerHTML = tl('<div class="fine">랭킹을 불러오지 못했어요.</div>');
    }
  }

  private startMatchmaking(): void {
    // 첫 대전(배우는 판): 매칭 화면 없이 바로 봇과 시작
    if (meta.pvp.wins + meta.pvp.losses === 0) {
      closeOverlay('panel');
      this.onLaunch({ kind: 'pvp', session: createBotSession() });
      return;
    }
    const signal = { cancelled: false };
    const el = openOverlay('modal', `<div class="dialog matching"><h2>${tl('상대를 찾는 중...')}</h2>
      <div class="spinner"></div><div id="mm-time" class="fine">${tl('0초')}</div>
      <div class="fine">${icon('trophy')} ${meta.pvp.trophies} ${tl('근처의 상대를 찾고 있어요')}</div>
      <button class="btn close" data-act="cancel">${tl('취소')}</button></div>`, () => { signal.cancelled = true; });
    bindActions(el, { cancel: () => closeOverlay('modal') });
    findMatch((sec) => { const t = document.getElementById('mm-time'); if (t) t.textContent = tl('{0}초', Math.floor(sec)); }, signal)
      .then((session) => { if (!signal.cancelled) this.launchPvp(session); })
      .catch((e) => {
        if (signal.cancelled) return;
        closeOverlay('modal');
        console.warn(e);
        toast(tl('대전을 시작하지 못했어요'));
      });
  }

  private launchPvp(session: PvpSession): void {
    const m = session.match;
    const myTier = pvpTier(meta.pvp.trophies);
    const opTier = pvpTier(m.opponent.trophies);
    openOverlay('modal', `<div class="dialog matching"><h2>${tl('매칭 완료!')}</h2>
      <div class="vs"><div class="p"><div class="nm">${esc(meta.nick)}</div><div class="tier-name" style="color:${myTier.color}">${icon('trophy')} ${meta.pvp.trophies}</div></div>
      <div class="x">VS</div>
      <div class="p"><div class="nm">${esc(m.opponent.nick)}</div><div class="tier-name" style="color:${opTier.color}">${icon('trophy')} ${m.opponent.trophies}</div></div></div>
      <div class="fine">${tl('곧 전투가 시작됩니다')}</div></div>`);
    audio.sendAttack();
    setTimeout(() => {
      closeOverlay('modal');
      closeOverlay('panel');
      this.onLaunch({ kind: 'pvp', session });
    }, 1400);
  }
}

// ---------- 로비 메뉴 빨간 점 ----------
// 상점·덱: 알릴 게 있으면 지금 상태를 나타내는 키를 만든다. 그 메뉴를 열면 키를 seenFeatures 에 남겨 점을 끄고,
// 상태가 바뀌어 키가 달라지면(새 날, 새로 레벨업 가능한 유닛) 다시 뜬다.
// 퀘스트 점은 여기 없다 - 공짜 보상이라 받을 때까지 계속 띄운다 (questClaimable)
type DotMenu = 'shop' | 'units';
function dotKey(m: DotMenu): string | null {
  if (m === 'shop') return rewardedAvailable() && freeTicketAdsLeft() > 0 ? `shop:${todayStr()}` : null; // 오늘 받을 광고 소환권
  const ready = UNITS.filter((u) => canUpgradeUnit(u.id)).map((u) => `${u.id}${unitLevel(u.id)}`);
  return ready.length ? `units:${ready.join(',')}` : null; // 레벨업할 수 있는 유닛 (레벨까지 - 올린 뒤 또 가능해지면 다시)
}
function menuDot(m: DotMenu): boolean {
  const k = dotKey(m);
  return !!k && !meta.seenFeatures.includes(k);
}
function markDotSeen(m: DotMenu): void {
  const k = dotKey(m);
  if (!k || meta.seenFeatures.includes(k)) return;
  meta.seenFeatures = meta.seenFeatures.filter((s) => !s.startsWith(`${m}:`)).concat(k);
  saveMeta();
}

/**
 * 덱 유닛 카드 능력치 3칸: 공격력(일반 등급 기준, 지금 레벨) · 초당 공격 · 사거리.
 * 판 안에서는 등급이 오를수록 공격력이 3배씩 오른다 (GRADES.atk).
 */
function unitStatsHtml(job: Job, lv: number): string {
  const u = UNIT_BY_ID[job];
  const base = (GRADES[0].atk[0] + GRADES[0].atk[1]) / 2;
  const atk = Math.round(base * u.atkMult * RARITY_ATK[u.rarity] * (1 + (lv - 1) * UNIT_LEVEL_ATK)); // 희귀도 보너스 포함 (engine unitDamage 와 같은 식)
  const cell = (label: string, v: string) => `<div><span>${label}</span><b>${v}</b></div>`;
  return `<div class="u-stats">${cell(tl('공격력'), String(atk))}${cell(tl('공속'), `${(1 / u.cooldown).toFixed(1)}<small>${tl('/초')}</small>`)}${cell(tl('사거리'), `${Math.round(u.rangeMult * 100)}%`)}</div>`;
}

/** 몹 카드 능력치 3칸: 마리 수 · 한 마리 체력 · 이동 속도 (체력·속도는 같은 웨이브 일반 몹 대비 %) */
function mobStatsHtml(a: (typeof ATTACKS)[number]): string {
  const cell = (label: string, v: string) => `<div><span>${label}</span><b>${v}</b></div>`;
  return `<div class="u-stats">${cell(tl('마리'), String(a.count))}${cell(tl('체력'), `${Math.round(a.hpMult * 100)}%`)}${cell(tl('속도'), `${Math.round(a.speed * 100)}%`)}</div>`;
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}
