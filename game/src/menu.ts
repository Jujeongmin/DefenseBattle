// ============================================================
//  로비(메인 화면) - 스테이지 / 유닛·덱 / 연구 / 퀘스트 / 상점 / PvP(시즌패스·랭킹)
// ============================================================
import {
  RESEARCH, researchCost, DAILY_QUESTS, ACHIEVEMENTS, PRODUCTS, ITEM_KR,
  UNITS, UNIT_BY_ID, UNIT_MAX_LEVEL, unitUpgradeCost, SKILL_KR,
  DECK_SIZE, STAGES, STAGE_BY_ID, CHAPTERS, ATTACKS, ATTACK_BY_KEY, ATTACK_DECK_SIZE, PLAY_SPEED, UNIT_PACK, CHESTS, RARITY_KR, RARITY_COLOR, GACHA, chestOpenCost, type RoadStep, type AttackKey,
  SEASON_TIERS, SEASON_XP_PER_TIER, pvpTier, productEfficiency,
  CAMPAIGN, TROPHY_ROAD, PVP_TIERS, UNIT_PRESETS, ATTACK_PRESETS, type DeckPreset,
} from './config';
import { meta, saveMeta, researchLevel, currentSeasonId } from './meta';
import { getPlatform } from './platform';
import { audio } from './audio';
import { unitIconUrl, mobPortraitSrc, mobSprite } from './assets';
import { icon, stars as starIcons } from './icons';
import {
  stageStars, stageUnlocked, nextStageId, chapterStars, chapterUnlocked, CHAPTER_STAR_GOALS,
  chapterStarReward, starRewardClaimed, featureUnlocked, featureNew, markFeatureSeen,
  nextRoadStep, roadUnlockAt,
  unitUnlocked, unitLevel, canUpgradeUnit, toggleDeck,
  placeDeck, removeDeck, attackUnlocked, attackUnlockAt, placeAttack, unitCards,
} from './progress';
import {
  purchase, productOwned, monthlyActive, monthlyDaysLeft, canClaimMonthly, claimMonthly,
  seasonTier, claimSeasonReward, rewardText,
} from './shop';
import { freeTicketAdsLeft, watchForTickets, rewardedAvailable, FREE_TICKET_AMOUNT } from './ads';
import { onlineAvailable, findMatch, type PvpSession } from './pvp';
import { $, toast, openOverlay, closeOverlay, bindActions, spriteIcon, confirmModal } from './dom';
import { enableDeckDrag } from './dragdeck';
import { Spotlight } from './tutorial';
import { act, online, type Reveal } from './econ';
import { showShortage, activeOffers, unitPackAvailable, timeLeft } from './offers';
import { chestState, chestLeftMs, leftText, clockText, opening, showReveal, flushReveals, pendingReveals } from './chests';
import type { Job, Race, ResearchKey } from './types';

/** 덱 화면 안내 줄의 '추천 덱' 버튼 */
const RECS_BTN = `<button class="btn small gold rec-btn" data-act="recs">${icon('star')} 추천 덱</button>`;

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
  if (s.attack) return `몹 카드 ${ATTACK_BY_KEY[s.attack].kr}`;
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
        toast(`트로피 로드 보상: ${r.steps.map((s) => roadRewardText(s)).join(' · ')}`, 3200);
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
        <button class="gear-btn" data-act="settings" aria-label="설정">${icon('settings')}</button>
      </div>
      <div class="lobby-body v1">
        <h1 class="game-title">디펜스 배틀</h1>
        <div class="parade">${parade}</div>
        ${canClaimMonthly() ? `<div class="notice">${icon('calendar')} 월정액 오늘의 보석 <button class="btn small green" data-act="monthly">받기 ${icon('gem')}</button></div>` : ''}
        ${pvpOn ? `<div class="play-card arena-card">
          <div class="arena-name tier-name" style="color:${tier.color}">${icon('trophy')} ${tier.kr} 아레나 <span>${p.trophies}</span></div>
          <div class="road-bar"><div style="width:${pct}%"></div></div>
          ${next ? `<div class="road-next">다음 보상 ${nextIc} <span>${icon('trophy')}${next.at}</span></div>` : ''}
          <button class="btn red play-btn" data-act="battle">${icon('sword')} 대전 시작</button>
          <div class="arena-sub">${p.wins}승 ${p.losses}패${p.streak > 1 ? ` · ${p.streak}연승` : ''}
            <button class="btn small gold pass-btn" data-act="pass">${icon('trophy')} 시즌 패스${this.seasonClaimable() ? dot : ''}</button></div>
          <div class="arena-chests"><div class="ac-title">${icon('chest')} 내 상자 <span class="ac-hint">한 번에 하나씩 열려요</span></div><div class="chest-row">${this.chestSlotsHtml()}</div></div>
        </div>
        <div class="mode-row">
          <button class="mode-card camp" data-act="stages">
            <div class="ic">${icon('map')}</div><div class="t">캠페인</div><div class="d">${allCleared ? `${icon('check')} 모두 클리어` : `스테이지 ${nextStage.id}`}</div>
          </button>
          ${endlessOn ? `<button class="mode-card endless" data-act="endless">
            <div class="ic">${icon('infinity')}</div><div class="t">무한 모드</div><div class="d">${icon('flag')} ${meta.bestWave || 0}</div>${tag('endless')}
          </button>` : ''}
        </div>` : `<button class="btn red play-btn tut-start" data-act="tutorial">${icon('play')} 튜토리얼 시작</button>`}
      </div>
      <nav class="lobby-nav">
        <button data-act="shop"><span class="ic">${icon('shop')}</span>상점${!productOwned('starter_pack') ? dot : ''}</button>
        ${featureUnlocked('units') ? `<button data-act="units"><span class="ic">${icon('helmet')}</span>덱${tag('units') || (UNITS.some((u) => canUpgradeUnit(u.id)) ? dot : '')}</button>` : ''}
        ${featureUnlocked('research') ? `<button data-act="research"><span class="ic">${icon('flask')}</span>연구${tag('research')}</button>` : ''}
        ${featureUnlocked('quests') ? `<button data-act="quests"><span class="ic">${icon('scroll')}</span>퀘스트${tag('quests') || (this.questClaimable() ? dot : '')}</button>` : ''}
        ${pvpOn ? `<button data-act="road"><span class="ic">${icon('trophy')}</span>로드</button>` : ''}
        ${pvpOn ? `<button data-act="rank"><span class="ic">${icon('medal')}</span>랭킹</button>` : ''}
      </nav>`;
    bindActions(root, {
      profile: () => this.openProfile(),
      settings: () => this.openSettings(),
      units: () => { markFeatureSeen('units'); this.openUnits(); },
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
      monthly: async () => { const n = await claimMonthly(); if (n) { audio.coin(); toast(`월정액 보석 +${n} ${icon('gem')}`); this.render(); } },
    });
    root.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => audio.button(), { capture: true }));
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
   * 순서: 대전 → 캠페인 → 덱 → 연구 → 퀘스트 → 무한 모드 (스테이지 1-1 튜토리얼을 마친 뒤부터)
   */
  private maybeGuide(): void {
    if (this.guiding || !featureUnlocked('pvp') || meta.tutorial < 2) return;
    if (['modal', 'panel'].some((id) => { const c = $(id).classList; return !c.contains('hidden') && !c.contains('closing'); })) return; // 닫히는 중이면 닫힌 것
    const steps: { key: string; sel: string; text: string; on: boolean }[] = [
      { key: 'pvp', sel: '[data-act="battle"]', on: true,
        text: '<b>대전 시작</b>을 눌러 보세요!<br>상대 전장에 몹을 던지고, 이기면 상자를 받아요' },
      { key: 'campaign', sel: '[data-act="stages"]', on: stageStars('1-2') === 0,
        text: '<b>캠페인</b>에서 스테이지를 깨면<br>새 유닛과 보석을 얻어요' },
      { key: 'units', sel: '.lobby-nav [data-act="units"]', on: featureUnlocked('units'),
        text: '<b>덱</b>에서 유닛과 몹 카드를 고르고<br>모은 카드로 강화해요' },
      { key: 'research', sel: '.lobby-nav [data-act="research"]', on: featureUnlocked('research'),
        text: '<b>연구소</b>가 열렸어요!<br>보석으로 캠페인·무한 모드 능력을 올려요' },
      { key: 'quests', sel: '.lobby-nav [data-act="quests"]', on: featureUnlocked('quests'),
        text: '<b>퀘스트</b>가 열렸어요!<br>매일 목표를 채우면 보석을 받아요' },
      { key: 'endless', sel: '[data-act="endless"]', on: featureUnlocked('endless'),
        text: '<b>무한 모드</b>가 열렸어요!<br>얼마나 오래 버티는지 도전해 보세요' },
    ];
    const g = steps.find((s) => s.on && !meta.seenFeatures.includes(s.key) && document.querySelector(s.sel));
    if (!g) return;
    this.guiding = true;
    setTimeout(async () => {
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
      if (!c) return `<div class="chest-slot empty">${icon('chest')}<span class="es">대전 승리 시<br>획득</span></div>`;
      const d = CHESTS[c.kind];
      const ic = `<span class="chest-ic" style="--cc:${d.color}">${icon('chest')}</span>`;
      const label = st === 'ready' ? '<b class="open">열기!</b>'
        : st === 'opening' ? `<span class="clock" data-chest-left="${i}">${clockText(chestLeftMs(i))}</span><small>${icon('gem')}${chestOpenCost(chestLeftMs(i))}</small>`
        : `<span>${leftText(chestLeftMs(i))}</span><small>${opening() < 0 ? '탭해서 열기' : '차례 대기'}</small>`;
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
      ? `상자는 <b>한 번에 하나씩</b>만 열 수 있어요.<br>지금 여는 상자가 끝나면 이 상자를 열 수 있어요.<br><br>${CHESTS[meta.chests[i]!.kind].kr}를 ${icon('gem')}${cost}로 바로 열까요?`
      : `${CHESTS[meta.chests[i]!.kind].kr}를 ${icon('gem')}${cost}로 바로 열까요?`;
    if (await confirmModal(waiting ? '상자 대기 중' : '바로 열기', msg)) {
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
      return `${arena ? `<div class="road-arena tier-name" style="color:${arena.color}">${arena.kr} 아레나</div>` : ''}<div class="road-row ${done ? 'done' : reached ? 'ready' : ''}">
        <span class="road-at">${icon('trophy')}${s.at}</span><span class="road-rw">${reward}</span>
        <span class="road-st">${done ? icon('check') : reached ? '' : icon('lock')}</span></div>`;
    }).join('');
    openOverlay('panel', `<div class="dialog"><button class="close-x">${icon('close')}</button>
      <h2>트로피 로드</h2>
      <div class="fine" style="margin:-4px 0 10px">${icon('trophy')} ${p.trophies} · 대전에서 이기면 트로피가 올라요</div>
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
        <h2>설정</h2>
        ${row('music', '배경음악', 'bgm', audio.getBgmVolume())}
        ${row('sound', '효과음', 'sfx', audio.getSfxVolume())}
        <div class="row"><div class="ic">${icon('play')}</div><div class="info"><div class="t">튜토리얼</div></div>
          <button class="btn small blue" data-act="replayTutorial">다시 하기</button></div>
        <div class="row"><div class="ic">${icon('trophy')}</div><div class="info"><div class="t">${esc(meta.nick)}</div></div>
          <button class="btn small blue" data-act="profile">프로필</button></div></div>`, () => this.render());
      bindActions(el, {
        profile: () => { closeOverlay('panel'); this.openProfile(); },
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
      <h2>프로필</h2>
      <div class="row"><div class="info"><div class="t">닉네임</div><div class="d">PvP 상대와 랭킹에 표시됩니다</div></div>
        <input id="nick-input" maxlength="12" value="${esc(meta.nick)}" style="width:120px;padding:8px;border-radius:8px;border:none;font-family:inherit;font-size:15px"></div>
      <div class="row"><div class="info"><div class="t tier-name" style="color:${tier.color}">${icon('trophy')} ${tier.kr} · ${p.trophies}</div><div class="d">${p.wins}승 ${p.losses}패 · 연승 ${p.streak}</div></div></div>
      <div class="row"><div class="info"><div class="t">${icon('star')} 캠페인 별 ${stars} / ${STAGES.length * 3}</div><div class="d">무한 모드 최고 ${meta.bestWave}웨이브</div></div></div>
      <button class="btn green close" data-act="save">저장</button></div>`, () => this.render());
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
        <h2>스테이지</h2>
        ${`<div class="tab-row chap-tabs">${CHAPTERS.map((ch) => `<button data-act="chap" data-n="${ch.n}" class="${ch.n === c ? 'active' : ''}">${chapterUnlocked(ch.n) ? '' : icon('lock') + ' '}${ch.n}. ${ch.kr}</button>`).join('')}</div>`}
        <div class="fine" style="margin:-4px 0 10px">${CHAPTERS[c - 1].desc} · 스테이지당 ${CHAPTERS[c - 1].waves}웨이브</div>
        <div class="stage-grid">${nodes}</div>
        ${`<div class="section-title"><span>챕터 별 보상</span><span>${icon('star')} ${chStars}/30</span></div>
        <div class="star-goals">${goals}</div>`}</div>`, () => this.render());
      bindActions(el, {
        chap: (b) => { this.selectedChapter = Number(b.dataset.n); draw(); },
        stage: (b) => {
          const id = b.dataset.id!;
          if (!stageUnlocked(id)) { toast('이전 스테이지를 먼저 클리어하세요'); return; }
          this.openStageInfo(id);
        },
        starGoal: async (b) => {
          const n = await act<number>('claimStarReward', { chapter: c, goal: Number(b.dataset.i) });
          if (n) { audio.coin(); toast(`별 보상 ${icon('gem')} +${n}`); draw(); }
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
        + Array.from({ length: DECK_SIZE - meta.deck.length }, () => '<div class="deck-slot">빈 슬롯</div>').join('');
      const el = openOverlay('modal', `<div class="dialog"><button class="close-x">${icon('close')}</button>
        <h2>스테이지 ${id}</h2>
        <div style="text-align:center;font-size:22px;margin:-6px 0 6px">${starIcons(stars)}</div>
        <div class="stage-facts">
          <span>${icon('flag')} ${st.waves}</span><span>${icon('skull')} 보스</span><span class="races">${races}</span>
          <span>${icon('gem')} ${stars ? st.replayReward : st.firstReward}</span>
        </div>
        ${st.unlocks && !unitUnlocked(st.unlocks) ? `<div class="row" style="border:2px solid var(--gold)">${spriteIcon(unitIconUrl(st.unlocks), 'frame-sprite', 'width:40px;height:40px')}<div class="info"><div class="t">${UNIT_BY_ID[st.unlocks].kr} ${icon('lock')} → NEW</div></div></div>` : ''}
        <div class="section-title"><span>출전 덱</span><button class="btn small blue" data-act="editDeck">덱 편집</button></div>
        <div class="deck-row">${deck}</div>
        ${meta.items.goldBooster > 0 ? `<label class="row" style="cursor:pointer"><div class="ic">${icon('bag')}</div><div class="info"><div class="t">골드 부스터 사용</div><div class="d">시작 골드 2배 · 보유 ${meta.items.goldBooster}</div></div><input type="checkbox" id="booster-chk" ${booster ? 'checked' : ''} style="width:22px;height:22px"></label>` : ''}
        <button class="btn red close" style="font-size:18px" data-act="go">${icon('sword')} 전투 시작</button></div>`);
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
      <h2>${icon('infinity')} 무한 모드</h2>
      <div class="row"><div class="ic">${icon('flag')}</div><div class="info"><div class="t">50웨이브 생존 도전</div><div class="d">최고 기록 ${meta.bestWave}웨이브 · 도달 웨이브만큼 보석 획득</div></div></div>
      <div class="deck-row">${meta.deck.map((j) => `<div class="deck-slot filled">${spriteIcon(unitIconUrl(j))}<div>${UNIT_BY_ID[j].kr}</div></div>`).join('')}</div>
      ${meta.items.goldBooster > 0 ? `<label class="row"><div class="ic">${icon('bag')}</div><div class="info"><div class="t">골드 부스터 사용</div><div class="d">보유 ${meta.items.goldBooster}</div></div><input type="checkbox" id="booster-chk2" style="width:22px;height:22px"></label>` : ''}
      <button class="btn red close" data-act="go">${icon('sword')} 시작</button></div>`);
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
        <button class="${tab === 'units' ? 'active' : ''}" data-act="tab" data-tab="units">${icon('helmet')} 유닛</button>
        <button class="${tab === 'attacks' ? 'active' : ''}" data-act="tab" data-tab="attacks">${icon('skull')} 몹 카드</button></div>`;
      const body = tab === 'units' ? this.unitDeckHtml() : this.attackDeckHtml();
      const el = openOverlay('panel', `<div class="dialog deck-dialog"><button class="close-x">${icon('close')}</button>
        <h2>덱 <span class="crystal" style="font-size:16px">${icon('gem')} ${meta.crystals}</span></h2>
        ${tabs}${body}</div>`, () => { this.pickAttack = null; this.render(); after?.(); });
      enableDeckDrag(el, (key, _from, to) => {
        let ok: boolean;
        if (tab === 'units') ok = to === 'out' ? removeDeck(key as Job) : placeDeck(key as Job, to);
        else ok = to === 'out' ? false : placeAttack(key as AttackKey, to);
        if (ok) audio.button();
        else if (to === 'out') toast(tab === 'units' ? '덱에 최소 1종은 있어야 해요' : '몹 카드는 4장 모두 들고 가요. 다른 카드를 칸에 놓아 바꾸세요');
        draw();
      });
      bindActions(el, {
        tab: (b) => { this.deckTab = b.dataset.tab as 'units' | 'attacks'; this.pickAttack = null; draw(); },
        toggle: (b) => {
          if (!toggleDeck(b.dataset.job as Job)) toast(meta.deck.length >= DECK_SIZE ? '덱이 가득 찼어요. 덱 칸에 끌어 놓아 바꾸세요' : '덱에 최소 1종은 있어야 해요');
          else audio.button();
          draw();
        },
        up: async (b) => {
          const j = b.dataset.job as Job;
          const cc = unitCards(j);
          if (cc.have < cc.need) { toast(`카드 ${cc.need - cc.have}장이 더 필요해요 · 상자와 뽑기에서 얻어요`); return; }
          const cost = unitUpgradeCost(unitLevel(j));
          if (meta.crystals < cost) { showShortage(cost - meta.crystals, undefined, draw); return; }
          if (await act<boolean>('upgradeUnit', { job: j })) { audio.merge(); draw(); }
        },
        buy: async (b) => {
          const j = b.dataset.job as Job;
          const need = (UNIT_BY_ID[j].unlockCrystals ?? 0) - meta.crystals;
          if (need > 0) { showShortage(need, j, draw); return; } // 유닛 패키지를 먼저 제안
          if (await confirmModal('유닛 해금', `${UNIT_BY_ID[j].kr}을(를) ${icon('gem')}${UNIT_BY_ID[j].unlockCrystals}로 해금할까요?`)) {
            if (await act<boolean>('buyUnit', { job: j })) { audio.fanfareUnlock(); toast(`${UNIT_BY_ID[j].kr} 해금!`); }
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
      const btn = same ? `<button class="btn small" disabled>${icon('check')} 사용 중</button>`
        : missing ? `<button class="btn small" disabled>${icon('lock')} ${missing}장 없음</button>`
        : `<button class="btn small gold" data-act="use" data-i="${i}">장착</button>`;
      return `<div class="preset ${missing ? 'locked' : ''}"><div class="pr-head"><b>${p.name}</b>${btn}</div><div class="pr-desc">${p.desc}</div><div class="pr-cards">${cards}</div></div>`;
    }).join('');
    const el = openOverlay('modal', `<div class="dialog preset-dialog"><button class="close-x">${icon('close')}</button>
      <h2>추천 ${units ? '유닛' : '몹 카드'} 덱</h2><div class="preset-list">${rows}</div></div>`);
    bindActions(el, {
      use: (b) => {
        const p = list[Number(b.dataset.i)];
        if (!p.cards.every(has)) return;
        if (units) meta.deck = [...p.cards] as Job[];
        else meta.attackDeck = [...p.cards] as AttackKey[];
        saveMeta();
        audio.merge();
        toast(`${p.name} 덱 장착`);
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
    const cards = UNITS.map((u) => {
      const lv = unitLevel(u.id);
      const unlocked = lv > 0;
      const inDeck = meta.deck.includes(u.id);
      // 카드 막대: 다음 레벨까지 모은 카드 (다 모이면 초록 + '레벨업')
      const cc = unitCards(u.id);
      const maxLv = lv >= UNIT_MAX_LEVEL;
      const ready = unlocked && !maxLv && cc.have >= cc.need;
      const bar = unlocked
        ? `<div class="card-bar ${ready ? 'ready' : ''}"><div style="width:${maxLv ? 100 : Math.min(100, (cc.have / cc.need) * 100)}%"></div><span>${maxLv ? 'MAX' : `${icon('ticket')}${cc.have}/${cc.need}`}</span></div>`
        : `<div class="card-bar locked"><span>${u.unlockCrystals || roadUnlockAt(u.id) || u.unlockStage ? '' : '상자·뽑기에서'}</span></div>`;
      let acts: string;
      if (!unlocked) {
        acts = u.unlockCrystals
          ? `<button class="btn small gold ${meta.crystals < u.unlockCrystals ? 'short' : ''}" data-act="buy" data-job="${u.id}">${icon('gem')}${u.unlockCrystals} 해금</button>`
          : '';
      } else {
        const maxed = lv >= UNIT_MAX_LEVEL;
        acts = `<button class="btn small ${inDeck ? 'red' : 'blue'}" data-act="toggle" data-job="${u.id}">${inDeck ? '빼기' : '넣기'}</button>
          <button class="btn small ${ready ? 'green' : 'gray-btn'} ${ready && meta.crystals < unitUpgradeCost(lv) ? 'short' : ''}" data-act="up" data-job="${u.id}" ${maxed ? 'disabled' : ''}>${maxed ? 'MAX' : `${icon('gem')}${unitUpgradeCost(lv)}`}</button>`;
      }
      return `<div class="unit-card ${inDeck ? 'in-deck' : ''} ${unlocked ? '' : 'locked'} ${ready ? 'can-level' : ''}" ${unlocked ? `data-drag="${u.id}"` : ''} style="--rc:${RARITY_COLOR[u.rarity]}">
        <span class="rarity-tag">${RARITY_KR[u.rarity]}</span>
        <div class="head">${spriteIcon(unitIconUrl(u.id))}
          <div><div class="nm">${u.kr}</div><div class="lv">${unlocked ? `Lv.${lv}` : `${icon('lock')} ${[roadUnlockAt(u.id) ? `${icon('trophy')}${roadUnlockAt(u.id)}` : '', u.unlockStage ?? ''].filter(Boolean).join(' / ') || icon('chest')}`}</div></div></div>
        ${bar}
        <div class="sk" data-tip-skill="${u.id}"><b>${SKILL_KR[u.id]}</b> <span class="info-dot">?</span></div>
        <div class="acts">${acts}</div></div>`;
    }).join('');
    return `<div class="deck-hint">${icon('pointer')} 끌어서 칸에 놓기${RECS_BTN}</div>
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
    const cards = ATTACKS.map((a) => {
      const open = attackUnlocked(a.key);
      const inDeck = meta.attackDeck.includes(a.key);
      const at = attackUnlockAt(a.key);
      const counters = a.counters.map((j) => `<span class="tip-unit" data-tip-unit="${j}">${spriteIcon(unitIconUrl(j), 'frame-sprite mini')}</span>`).join('');
      const act = !open ? `<div class="lock">${icon('lock')} ${icon('trophy')}${at}</div>`
        : inDeck ? `<div class="in">${icon('check')} 덱</div>`
        : `<button class="btn small ${pick === a.key ? 'gold' : 'blue'}" data-act="pick" data-key="${a.key}">${pick === a.key ? '칸 선택' : '넣기'}</button>`;
      return `<div class="mob-card ${inDeck ? 'in-deck' : ''} ${open ? '' : 'locked'} ${pick === a.key ? 'picked' : ''}" ${open ? `data-drag="${a.key}"` : ''}>
        <div class="head">${mobIc(a.key)}<div><div class="nm">${a.kr}</div><div class="cost">${icon('coin')}${a.cost}${a.cooldown ? ` · ${icon('timer')}${Math.round(a.cooldown / PLAY_SPEED)}s` : ''}</div></div></div>
        <div class="ds">${a.desc}</div>
        <div class="ctr"><span>막는 유닛</span>${counters}</div>
        <div class="acts">${act}</div></div>`;
    }).join('');
    return `<div class="deck-hint">${pick ? `${icon('pointer')} 넣을 칸을 누르세요` : `${icon('pointer')} 끌어서 칸에 놓기 · 대전에서 상대에게 던져요`}${RECS_BTN}</div>
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
        <h2>연구소 <span class="crystal" style="font-size:16px">${icon('gem')} ${meta.crystals}</span></h2>
        <div class="fine" style="margin:-4px 0 8px">보석으로 올리면 계속 적용돼요 · 캠페인·무한 모드 전용 (대전 제외)</div>
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
          <button class="btn small ${done && !claimed ? 'gold' : ''}" data-act="daily" data-key="${q.key}" ${!done || claimed ? 'disabled' : ''}>${claimed ? '완료' : `${icon('gem')} ${q.reward}`}</button></div>`;
      }).join('');
      const adLeft = freeTicketAdsLeft();
      const adRow = rewardedAvailable()
        ? `<div class="row"><div class="ic">${icon('tv')}</div><div class="info"><div class="t">광고 보고 소환권 ${FREE_TICKET_AMOUNT}장</div><div class="d">오늘 ${adLeft}회 남음</div></div>
            <button class="btn small blue" data-act="adTicket" ${adLeft ? '' : 'disabled'}>받기</button></div>` : '';
      const ach = ACHIEVEMENTS.map((a) => `<div class="row"><div class="info"><div class="t">${a.kr}</div><div class="d">보상 ${icon('gem')} ${a.reward}</div></div>
        <span class="${meta.achievements[a.key] ? 'trophy' : 'fine'}">${meta.achievements[a.key] ? `달성 ${icon('check')}` : '미달성'}</span></div>`).join('');
      const el = openOverlay('panel', `<div class="dialog"><button class="close-x">${icon('close')}</button>
        <h2>퀘스트</h2>
        <div class="section-title">일일 퀘스트 <span class="fine">매일 0시(UTC) 초기화</span></div>${daily}${adRow}
        <div class="section-title">업적</div>${ach}</div>`, () => this.render());
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
        adTicket: async () => {
          if (await watchForTickets()) { audio.coin(); toast(`소환권 +${FREE_TICKET_AMOUNT} ${icon('ticket')}`); }
          draw();
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
    const gachaRows = rarities.map((r) => `<tr><td style="color:${RARITY_COLOR[r]}">${RARITY_KR[r]}</td><td>${pct(GACHA.rates[r])}</td><td>${GACHA.count[r]}장</td><td>${poolSize(r)}종</td><td>${pct(GACHA.rates[r] / poolSize(r))}</td></tr>`).join('');
    const a = Math.max(0, PVP_TIERS.filter((t) => meta.pvp.trophies >= t.min).length - 1);
    const chestRows = (Object.keys(CHESTS) as (keyof typeof CHESTS)[]).map((k) => {
      const d = CHESTS[k];
      const total = d.cards + d.perArena * a;
      const epicBase = Math.floor(d.epic), epicChance = d.epic % 1;
      const rare = Math.min(total - epicBase, Math.round(d.rare * (1 + a * 0.25)));
      const epicTxt = !epicChance ? `${epicBase}장` : epicBase ? `${epicBase}장 +${pct(epicChance)}` : `${pct(epicChance)}로 1장`;
      return `<tr><td>${d.kr}</td><td>${total}장</td><td>${rare}장</td><td>${epicTxt}</td><td>${d.legendary >= 1 ? '1장' : d.legendary ? `${pct(d.legendary)}로 1장` : '-'}</td><td>${d.gems[0]}~${d.gems[1]}</td></tr>`;
    }).join('');
    openOverlay('modal', `<div class="dialog odds-dialog"><button class="close-x">${icon('close')}</button>
      <h2>확률 정보</h2>
      <div class="section-title">유닛 뽑기</div>
      <table class="odds"><tr><th>등급</th><th>확률</th><th>카드</th><th>유닛 수</th><th>유닛 1종</th></tr>${gachaRows}</table>
      <div class="fine">· 1회마다 위 확률로 등급을 정하고, 그 등급 유닛 중 하나가 같은 확률로 나와요.<br>
      · 10회 뽑기에서 영웅·전설이 하나도 없으면 마지막 1회가 영웅(영웅 ${poolSize('epic')}종 중 무작위)으로 바뀌어요.</div>
      <div class="section-title">상자 <span class="fine">지금 아레나(${PVP_TIERS[a].kr}) 기준</span></div>
      <table class="odds"><tr><th>상자</th><th>카드</th><th>희귀</th><th>영웅</th><th>전설</th><th>${icon('gem')}</th></tr>${chestRows}</table>
      <div class="fine">· 나머지 카드는 일반이에요. 아레나가 오를수록 카드 장수와 희귀 카드가 늘어요.<br>
      · 유닛은 같은 등급 안에서 무작위로 정해지고, 일반은 3종·희귀는 2종에 나눠 담겨요. 보석은 범위 안에서 같은 확률이에요.<br>
      · 금·마법·전설 상자는 상점에서 사면 바로 열려요. 나무·은 상자는 대전 승리로만 얻어요.</div>
      <button class="btn red" data-close style="width:100%;margin-top:8px">확인</button></div>`);
  }

  // ======================= 상점 =======================
  openShop(): void {
    const plat = getPlatform();
    const price = (id: string) => plat.priceOf(id) ?? 0;
    const draw = () => {
      const vx = plat.getVX();
      const card = (id: string, hot = false) => {
        const p = PRODUCTS.find((x) => x.id === id)!;
        const owned = productOwned(id);
        let extra = '';
        if (id === 'monthly_pass' && monthlyActive()) extra = ` <span class="badge green">${monthlyDaysLeft()}일 남음</span>`;
        if (p.category === 'offer') extra = ` <span class="badge">${icon('timer')}${timeLeft(id).split(':').slice(0, 2).join('시간 ')}분</span>`;
        const eff = owned ? 0 : productEfficiency(p, price(id));
        return `<div class="shop-card ${hot ? 'hot' : ''}">${eff > 100 ? `<span class="eff">효율<b>${eff}%</b></span>` : ''}<img class="shop-img" src="/ui/shop/${p.id}.png" alt="">
          <div class="info"><div class="t"><span class="nm">${p.kr}</span>${p.badge ? `<span class="badge">${p.badge}</span>` : ''}${extra}</div><div class="d">${p.desc}</div></div>
          <button class="btn small ${owned ? '' : 'gold'}" data-act="buy" data-id="${id}" ${owned ? 'disabled' : ''}>${owned ? `보유 ${icon('check')}` : `VX ${price(id)}`}</button></div>`;
      };
      const gems = PRODUCTS.filter((p) => p.category === 'crystal').map((p) => {
        const eff = productEfficiency(p, price(p.id));
        return `<div class="gem-card">
        ${eff > 100 ? `<span class="eff">효율<b>${eff}%</b></span>` : ''}<img class="shop-img" src="/ui/shop/${p.id}.png" alt=""><div>${p.kr}</div>
        <button class="btn small gold" data-act="buy" data-id="${p.id}">VX ${price(p.id)}</button></div>`;
      }).join('');
      const items = Object.entries(meta.items).map(([k, n]) => `<span class="tip-item" data-tip-item="${k}">${icon(ITEM_KR[k as keyof typeof ITEM_KR].icon)}${n}</span>`).join(' · ');
      const el = openOverlay('panel', `<div class="dialog"><button class="close-x">${icon('close')}</button>
        <h2>상점</h2>
        <div class="balance"><span class="crystal">${icon('gem')} ${meta.crystals.toLocaleString()}</span>${vx !== null ? `<span class="vx-badge">VX ${vx.toLocaleString()}</span>` : ''}</div>
        <div class="fine" style="margin:-4px 0 6px">보유: ${items}</div>
        ${activeOffers().length ? `<div class="section-title hot-title">${icon('timer')} 한정 특가</div>${activeOffers().map((o) => card(o.id, true)).join('')}` : ''}
        <div class="section-title">유닛 뽑기 <span class="fine">카드로 해금·레벨업</span><button class="btn small odds-btn" data-act="odds">확률 정보</button></div>
        <div class="gacha-row">
          <button class="btn blue gacha-btn" data-act="gacha" data-n="1">1회<small>${icon('gem')}${GACHA.one}</small></button>
          <button class="btn gold gacha-btn" data-act="gacha" data-n="10">10회<small>${icon('gem')}${GACHA.ten} · 영웅+ 보장</small></button>
        </div>
        <div class="fine" style="margin:-4px 0 8px">${(['common', 'rare', 'epic', 'legendary'] as const).map((r) => `<span style="color:${RARITY_COLOR[r]}">${RARITY_KR[r]} ${Math.round(GACHA.rates[r] * 100)}%</span>`).join(' · ')}</div>
        <div class="section-title">상자 <button class="btn small odds-btn" data-act="odds">확률 정보</button></div>
        ${card('chest_gold')}${card('chest_magic')}${card('chest_legend', true)}
        <div class="section-title">추천 패키지</div>
        ${!productOwned('starter_pack') ? card('starter_pack', true) : ''}
        ${card('monthly_pass', true)}
        ${card('ad_remove')}
        ${UNITS.some((u) => unitPackAvailable(u.id)) ? `<div class="section-title">유닛 패키지 <span class="fine">바로 해금 + Lv5</span></div>${UNITS.filter((u) => unitPackAvailable(u.id)).map((u) => card(UNIT_PACK[u.id]!)).join('')}` : ''}
        <div class="section-title">PvP 시즌 패스</div>${card('season_premium')}
        <div class="section-title">부스터 <span class="fine">캠페인·무한 모드 전용</span></div>
        ${card('summon_ticket_pack')}${card('mythic_ticket')}${card('gold_booster_pack')}
        <div class="section-title">보석</div><div class="gem-grid">${gems}</div>
        <div class="fine">${vx !== null ? '* 로컬 개발 환경: 데모 VX 로 결제를 흉내냅니다.' : '* 결제는 Verse8 VX 로 진행되며, 결제 완료 후 자동 지급됩니다.'}</div></div>`, () => this.render());
      bindActions(el, {
        odds: () => { audio.button(); this.openOdds(); },
        buy: async (b) => {
          const id = b.dataset.id!;
          (b as HTMLButtonElement).disabled = true;
          const got = await purchase(id);
          if (got.length) {
            audio.fanfareUnlock();
            toast(`구매 완료: ${got.map((g) => PRODUCTS.find((p) => p.id === g)?.kr).join(', ')}`);
          } else {
            toast('결제가 완료되지 않았어요');
          }
          draw();
          if (pendingReveals.length) flushReveals(draw); // 상자를 샀으면 바로 공개
        },
        gacha: async (b) => {
          const n = Number(b.dataset.n) as 1 | 10;
          const cost = n === 1 ? GACHA.one : GACHA.ten;
          if (meta.crystals < cost) { showShortage(cost - meta.crystals, undefined, draw); return; }
          const r = await act<Reveal | null>('gacha', { n });
          if (r) { draw(); showReveal(r, draw); }
        },
      });
    };
    draw();
  }

  // ======================= PvP =======================
  /** 랭킹 / 시즌 패스 창 (대전은 로비의 '대전 시작') */
  openPvp(tab: 'pass' | 'rank' = 'rank'): void {
    const draw = async () => {
      let body = '';
      if (tab === 'pass') {
        const t = seasonTier();
        const inTier = meta.season.xp % SEASON_XP_PER_TIER;
        const rows = SEASON_TIERS.map((def, i) => {
          const n = i + 1;
          const reached = n <= t;
          const fDone = meta.season.claimedFree.includes(n);
          const pDone = meta.season.claimedPremium.includes(n);
          const fCls = fDone ? 'done' : reached ? 'ready' : 'lock';
          const pCls = pDone ? 'done' : reached && meta.season.premium ? 'ready' : 'lock';
          return `<div class="pass-row"><div class="n ${reached ? 'on' : ''}">${n}</div>
            <button class="pass-cell ${fCls}" data-act="claim" data-n="${n}" data-p="0">${rewardText(def.free)}</button>
            <button class="pass-cell prem ${pCls}" data-act="claim" data-n="${n}" data-p="1">${meta.season.premium ? '' : icon('lock')}${rewardText(def.premium)}</button></div>`;
        }).join('');
        body = `<div class="pass-head"><div class="lvl">${t}</div><div style="flex:1">
            <div class="fine" style="text-align:left">시즌 ${currentSeasonId().slice(1)} · 다음 단계까지 ${SEASON_XP_PER_TIER - inTier} XP</div>
            <div class="pass-bar"><div style="width:${t >= SEASON_TIERS.length ? 100 : (inTier / SEASON_XP_PER_TIER) * 100}%"></div></div></div></div>
          ${meta.season.premium ? '' : `<button class="btn gold close" data-act="buyPass" style="margin:0 0 10px">${icon('trophy')} 프리미엄 패스 구매</button>`}
          <div class="pass-row"><div></div><div class="fine">무료</div><div class="fine trophy">프리미엄</div></div>${rows}`;
      } else {
        body = '<div class="fine">불러오는 중...</div>';
      }
      const el = openOverlay('panel', `<div class="dialog"><button class="close-x">${icon('close')}</button>
        <h2>${tab === 'pass' ? '시즌 패스' : '랭킹'}</h2>
        <div id="pvp-body">${body}</div></div>`, () => this.render());
      bindActions(el, {
        claim: async (b) => {
          const ok = await claimSeasonReward(Number(b.dataset.n), b.dataset.p === '1');
          if (ok) { audio.coin(); toast('시즌 보상 획득!'); void draw(); }
        },
        buyPass: async () => {
          const got = await purchase('season_premium');
          if (got.length) { audio.fanfareUnlock(); toast('프리미엄 시즌 패스 활성화!'); }
          void draw();
        },
      });
      if (tab === 'rank') await this.drawRanking();
    };
    void draw();
  }

  private async drawRanking(): Promise<void> {
    const body = $('pvp-body');
    if (!onlineAvailable()) {
      body.innerHTML = `<div class="fine">랭킹은 Verse8 환경(게임서버 연결)에서 표시됩니다.</div>
        <div class="rank-row me"><span class="r">-</span><span>${esc(meta.nick)}</span><span class="trophy">${icon('trophy')} ${meta.pvp.trophies}</span></div>`;
      return;
    }
    try {
      const net = await import('./net/server');
      const res = await net.callGlobal<{ top: { account: string; nick: string; trophies: number }[]; me: { trophies: number } }>('pvpLeaderboard');
      const mine = net.myAccount();
      body.innerHTML = res.top.length
        ? res.top.map((r, i) => `<div class="rank-row ${r.account === mine ? 'me' : ''}"><span class="r">${i < 3 ? icon((['medal', 'medal_silver', 'medal_bronze'] as const)[i]) : i + 1}</span>
            <span>${esc(r.nick)} <span class="fine">${pvpTier(r.trophies).kr}</span></span><span class="trophy">${icon('trophy')} ${r.trophies}</span></div>`).join('')
        : '<div class="fine">아직 기록이 없습니다. 첫 승리를 차지하세요!</div>';
    } catch {
      body.innerHTML = '<div class="fine">랭킹을 불러오지 못했어요.</div>';
    }
  }

  private startMatchmaking(): void {
    const signal = { cancelled: false };
    const el = openOverlay('modal', `<div class="dialog matching"><h2>상대를 찾는 중...</h2>
      <div class="spinner"></div><div id="mm-time" class="fine">0초</div>
      <div class="fine">${icon('trophy')} ${meta.pvp.trophies} 근처의 상대를 찾고 있어요</div>
      <button class="btn close" data-act="cancel">취소</button></div>`, () => { signal.cancelled = true; });
    bindActions(el, { cancel: () => closeOverlay('modal') });
    findMatch((sec) => { const t = document.getElementById('mm-time'); if (t) t.textContent = `${Math.floor(sec)}초`; }, signal)
      .then((session) => { if (!signal.cancelled) this.launchPvp(session); })
      .catch((e) => {
        if (signal.cancelled) return;
        closeOverlay('modal');
        console.warn(e);
        toast('대전을 시작하지 못했어요');
      });
  }

  private launchPvp(session: PvpSession): void {
    const m = session.match;
    const myTier = pvpTier(meta.pvp.trophies);
    const opTier = pvpTier(m.opponent.trophies);
    openOverlay('modal', `<div class="dialog matching"><h2>매칭 완료!</h2>
      <div class="vs"><div class="p"><div class="nm">${esc(meta.nick)}</div><div class="tier-name" style="color:${myTier.color}">${icon('trophy')} ${meta.pvp.trophies}</div></div>
      <div class="x">VS</div>
      <div class="p"><div class="nm">${esc(m.opponent.nick)}</div><div class="tier-name" style="color:${opTier.color}">${icon('trophy')} ${m.opponent.trophies}</div></div></div>
      <div class="fine">곧 전투가 시작됩니다</div></div>`);
    audio.sendAttack();
    setTimeout(() => {
      closeOverlay('modal');
      closeOverlay('panel');
      this.onLaunch({ kind: 'pvp', session });
    }, 1400);
  }
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}
