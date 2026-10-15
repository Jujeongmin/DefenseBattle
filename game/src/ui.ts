// ============================================================
//  게임 화면 DOM UI - 상단바/소환/강화/합성·판매/PvP HUD/결과/튜토리얼
// ============================================================
import {
  JOB_KR, RACE_KR, GRADES, DMG_MULT, WAVE, GRADE_INDEX, MERGE_COUNT, PLAY_SPEED, ATTACKS, JOBS,
} from './config';
import { MAP, Game, pathPosNear, pathAt, type BoardSnapshot } from './engine';
import { mobPortraitSrc, unitIconUrl, mobSprite, preloadUnits } from './assets';
import { meta, saveMeta } from './meta';
import { audio } from './audio';
import { $, toast, spriteIcon, popIn, fitAll } from './dom';
import { icon } from './icons';
import { OppRenderer } from './oppRender';
import type { Job, Race, GradeKey } from './types';



import { tl } from './i18n';
const SPEED_KEY = 'randomdefense.speed.v1'; // 기기 설정 (계정 진행이 아님)

export interface UIContext {
  kind: 'stage' | 'endless' | 'pvp';
  stageId?: string;
  onExit: () => void;
  /** 첫 튜토리얼 판(1-1 미클리어): 나가기 버튼을 숨긴다 */
  tutorial?: boolean;
}

export interface ResultView {
  win: boolean;
  title: string;
  sub: string;
  stars?: number;
  rewards: string[];
  unlocked?: Job;
  extraHtml?: string;
  buttons: { label: string; cls: string; action: () => void; id?: string }[];
}

/**
 * 상대 전장 크게 보기: 마우스를 올리고 있거나(PC) 누르고 있으면(휴대폰) 펼친다.
 * 판마다 UI 를 새로 만들므로 같은 요소에 핸들러를 덮어써서 겹치지 않게 한다.
 */
let peekReleaseBound = false;
function bindOppPeek(): void {
  const frame = $('game-frame');
  const oc = $('opp-canvas');
  let hold: ReturnType<typeof setTimeout> | null = null;
  const on = () => frame.classList.add('peek');
  const off = () => { if (hold) { clearTimeout(hold); hold = null; } frame.classList.remove('peek'); };
  oc.onpointerenter = (e) => { if (e.pointerType === 'mouse') on(); };
  oc.onpointerleave = (e) => { if (e.pointerType === 'mouse') off(); };
  oc.onpointerdown = (e) => { if (e.pointerType !== 'mouse') { if (hold) clearTimeout(hold); hold = setTimeout(on, 150); } };
  oc.oncontextmenu = (e) => e.preventDefault();
  if (!peekReleaseBound) {
    peekReleaseBound = true;
    const release = (e: PointerEvent) => { if (e.pointerType !== 'mouse') off(); };
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
  }
}

/** 지금 판의 소환 꾹 누르기 멈춤 (window pointerup 하나가 이걸 부른다) */
let stopSummonHold: (() => void) | null = null;
let summonReleaseBound = false;

/** 값이 바뀔 때만 DOM 에 쓴다 (매 프레임 같은 값을 써서 레이아웃을 다시 계산하지 않게) */
const domCache = new WeakMap<HTMLElement, string>();
function setText(el: HTMLElement, v: string): void { if (domCache.get(el) !== v) { domCache.set(el, v); el.textContent = v; } }
function setHtml(el: HTMLElement, v: string): void { if (domCache.get(el) !== v) { domCache.set(el, v); el.innerHTML = v; } }
const widthCache = new WeakMap<HTMLElement, string>();
function setWidth(el: HTMLElement, pct: number): void { const v = pct.toFixed(1) + '%'; if (widthCache.get(el) !== v) { widthCache.set(el, v); el.style.width = v; } }
function setDisabled(b: HTMLButtonElement, v: boolean): void { if (b.disabled !== v) b.disabled = v; }

export class UI {
  private game: Game;
  private ctx: UIContext;
  private speeds: number[];
  private speedIdx = 0;
  private lastRace: Race | null = null;
  private lastMergeKey = '';
  private sellOpen: (() => void) | null = null;
  private coachTimer: ReturnType<typeof setTimeout> | null = null;
  private opp: OppRenderer | null = null; // PvP 상대 전장

  constructor(game: Game, ctx: UIContext) {
    this.game = game;
    this.ctx = ctx;
    const pvp = ctx.kind === 'pvp';
    // 3배속은 광고제거 패키지 보유 시 해금 (상점). PvP 는 1배속 고정
    this.speeds = pvp ? [1] : meta.adRemoved ? [1, 2, 3] : [1, 2];
    this.bind();
    game.on('roster', () => { this.renderStacks(); this.sellOpen?.(); });
    game.on('achievement', (a) => toast(tl('{0} 업적 달성: {1} (+{2}{3})', icon('medal'), a.kr, a.reward, icon('gem'))));
    game.on('shoot', (job) => audio.attack(job === 'archer' || job === 'ranger' ? 'archer' : job === 'wizard' || job === 'frost' || job === 'bomber' ? 'wizard' : 'warrior'));
    game.on('kill', (boss) => audio.kill(boss));
    game.on('bossSpawn', () => { audio.boss(); if (!pvp) audio.switchBgm('boss'); });
    game.on('wave', () => { if (!pvp && !game.isBossWave) audio.switchBgm('battle'); });
    game.on('merge', () => audio.merge());
    game.on('attack', () => audio.sendAttack());
    game.on('gameover', () => this.hideThrowHint());
    game.on('incoming', () => audio.incoming());

    $('pvp-hud').classList.toggle('hidden', !pvp);
    $('game-frame').classList.toggle('pvp', pvp);
    this.opp = pvp ? new OppRenderer($<HTMLCanvasElement>('opp-canvas')) : null;
    if (pvp) bindOppPeek();
    $('attack-row').classList.toggle('hidden', !pvp);
    $('btn-menu').style.visibility = ctx.tutorial ? 'hidden' : ''; // 자리는 남겨 소환 버튼 배치가 그대로
    $('btn-speed').classList.toggle('hidden', pvp);
    $('btn-pause').classList.toggle('hidden', pvp);
    // 배속은 판이 바뀌어도 마지막으로 고른 값 유지 (일반 모드만, 쓸 수 없는 배속이면 1배속)
    let saved = 1;
    try { saved = Number(localStorage.getItem(SPEED_KEY)) || 1; } catch { /* 기본 1배속 */ }
    this.speedIdx = Math.max(0, this.speeds.indexOf(saved));
    game.speed = this.speeds[this.speedIdx];
    $('btn-speed').textContent = `${game.speed}x`;
    $('btn-pause').innerHTML = icon('pause');
    $('stage-label').textContent = ctx.kind === 'stage' ? ctx.stageId ?? '' : ctx.kind === 'endless' ? tl('무한') : 'PvP';
    if (pvp) this.buildAttackCards();
    $('sell-panel').classList.add('hidden');
    $('coach').classList.add('hidden');
    $('countdown').classList.add('hidden');
    this.renderStacks();
  }

  private bind(): void {
    // 소환: 탭하면 1번, 꾹 누르고 있으면 골드가 떨어질 때까지 계속 (0.38초 뒤부터 0.14초마다)
    const summonBtn = $('btn-summon') as HTMLButtonElement;
    const summonOnce = () => {
      if (this.summonLock || this.countingDown()) return false;
      const u = this.game.summon();
      if (u) audio.summon(u.gradeIndex >= GRADE_INDEX['mythic']);
      else if (this.game.gold < this.game.summonCost) this.flashGold();
      return !!u;
    };
    let holdTimer: ReturnType<typeof setTimeout> | null = null;
    let repeatTimer: ReturnType<typeof setInterval> | null = null;
    let held = false; // 꾹 눌러 연속 소환했으면 손을 뗄 때의 click 은 무시
    const stopHold = () => {
      if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
      if (repeatTimer) { clearInterval(repeatTimer); repeatTimer = null; }
    };
    // 판마다 UI 를 새로 만들므로 addEventListener 대신 on* 로 덮어쓴다 (지난 판 핸들러·게임이 쌓이지 않게)
    summonBtn.onclick = () => { if (held) { held = false; return; } summonOnce(); };
    summonBtn.onpointerdown = () => {
      held = false;
      stopHold();
      holdTimer = setTimeout(() => {
        held = true;
        if (!summonOnce()) return;
        repeatTimer = setInterval(() => {
          if (this.game.over || this.game.paused || !summonOnce()) stopHold();
        }, 140);
      }, 380);
    };
    summonBtn.onpointerup = summonBtn.onpointerleave = summonBtn.onpointercancel = stopHold;
    stopSummonHold = stopHold; // 골드가 떨어져 버튼이 꺼진 뒤 손을 떼도 멈추게 (window 리스너는 한 번만)
    if (!summonReleaseBound) { summonReleaseBound = true; window.addEventListener('pointerup', () => stopSummonHold?.()); }
    summonBtn.oncontextmenu = (e) => e.preventDefault(); // 길게 누를 때 휴대폰 메뉴가 뜨지 않게
    $('btn-pause').onclick = () => {
      audio.button();
      this.game.paused = !this.game.paused;
      $('btn-pause').innerHTML = icon(this.game.paused ? 'play' : 'pause');
    };
    $('btn-speed').onclick = () => {
      audio.button();
      if (this.speeds.length === 2 && this.speedIdx === 1 && !meta.adRemoved) toast(tl('3배속은 광고 제거 패키지로 해금돼요'));
      this.speedIdx = (this.speedIdx + 1) % this.speeds.length;
      this.game.speed = this.speeds[this.speedIdx];
      $('btn-speed').textContent = this.game.speed + 'x';
      try { localStorage.setItem(SPEED_KEY, String(this.game.speed)); } catch { /* 저장 못 해도 이번 판은 그대로 */ }
    };
    $('btn-sell-panel').onclick = () => { audio.button(); this.openHeroes(); };
    $('btn-menu').onclick = () => { audio.button(); this.ctx.onExit(); };
    $('btn-mute').onclick = () => {
      const muted = audio.toggleMute();
      $('btn-mute').innerHTML = icon(muted ? 'mute' : 'sound');
    };
    $('btn-mute').innerHTML = icon(audio.isMuted() ? 'mute' : 'sound');
    this.setupDrag();
  }

  // ---------- 매 프레임 갱신 ----------
  update(): void {
    const g = this.game;
    this.opp?.draw();
    const total = g.totalWaves;
    setText($('wave-label'), total === Infinity ? `Wave ${Math.max(1, g.wave)}` : `Wave ${Math.max(1, Math.min(g.wave, total))}/${total}`);
    setText($('mob-race'), RACE_KR[g.currentRace]);
    const portrait = $('mob-portrait');
    if (portrait.dataset.race !== g.currentRace) {
      portrait.dataset.race = g.currentRace;
      portrait.style.backgroundImage = `url(${mobPortraitSrc(g.currentRace)})`;
    }
    if (this.lastRace !== g.currentRace) {
      this.lastRace = g.currentRace;
      this.renderStacks();
    }

    setText($('gold-amount'), String(Math.floor(g.gold)));

    const pct = Math.min(100, (g.mobs.length / WAVE.gameOverMobCount) * 100);
    const fill = $('mob-progress-fill');
    setWidth(fill, pct);
    fill.classList.toggle('warn', pct >= 70);
    setText($('mob-count-label'), `${g.mobs.length} / ${WAVE.gameOverMobCount}`);
    if (g.isPvp) {
      const my = $('my-fill');
      setWidth(my, pct);
      my.classList.toggle('warn', pct >= 70);
      setText($('my-count'), `${g.mobs.length}/${WAVE.gameOverMobCount}`);
    }

    // 대전 경과 시간: 서버가 정한 시작 시각부터 (두 사람 화면이 같게), 판이 끝나면 멈춤
    const mt = $('match-timer');
    mt.classList.toggle('hidden', !g.isPvp);
    if (g.isPvp) {
      if (g.over && !this.matchEndAt) this.matchEndAt = Date.now();
      const sec = this.matchStartAt ? Math.max(0, Math.floor(((this.matchEndAt || Date.now()) - this.matchStartAt) / 1000)) : 0;
      const txt = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
      if (mt.dataset.t !== txt) { mt.dataset.t = txt; mt.innerHTML = `${icon('timer')}${txt}`; }
    }

    const bt = $('boss-timer');
    if (g.waveState === 'waiting_boss' || (g.isBossWave && g.waveState === 'spawning')) {
      bt.classList.remove('hidden');
      setHtml(bt, `${icon('timer')} ${(g.bossTimer / PLAY_SPEED).toFixed(1)}s`);
    } else {
      bt.classList.add('hidden');
    }

    setHtml($('summon-log'), g.log.map((l) => `<div>${l.text}</div>`).join(''));

    const banner = $('mythic-banner');
    if (g.mythicBanner) {
      banner.classList.remove('hidden');
      setHtml(banner, g.mythicBanner.text);
    } else {
      banner.classList.add('hidden');
    }

    setDisabled($('btn-summon') as HTMLButtonElement, g.gold < g.summonCost || g.over || this.summonLock || this.countingDown());
    const costEl = document.querySelector('#btn-summon .summon-cost');
    const costHtml = `${icon('coin')}${g.summonCost}`;
    if (costEl && costEl.innerHTML !== costHtml) costEl.innerHTML = costHtml;
    if (g.isPvp) {
      document.querySelectorAll<HTMLButtonElement>('#attack-row .attack-card').forEach((b) => {
        const t = Number(b.dataset.card);
        const cd = g.attackCooldown(t);
        setDisabled(b, g.gold < g.attackCost(t) || cd > 0 || g.over || this.countingDown());
        const label = cd > 0 ? String(Math.ceil(cd / PLAY_SPEED)) : '';
        const cdEl = b.querySelector('.cd')!;
        if (cdEl.textContent !== label) cdEl.textContent = label;
      });
    }
    // 합성 가능 상태가 바뀌면 카드/점 갱신 (매 프레임 DOM 재생성 방지)
    const mk = g.mergeable().map((m) => m.job + m.grade).join(',');
    if (mk !== this.lastMergeKey) {
      this.lastMergeKey = mk;
      $('merge-dot').classList.toggle('hidden', !mk);
      this.renderStacks();
    }
    // 강화 버튼 활성 상태는 골드에 따라 변하므로 가볍게 갱신
    document.querySelectorAll<HTMLButtonElement>('#unit-stacks .up-btn').forEach((b) => {
      const job = b.dataset.job as Job;
      setDisabled(b, !g.units.some((u) => u.job === job) || g.gold < g.upgradeCost(job));
    });
  }

  private flashGold(): void {
    const el = $('gold-badge');
    el.style.transition = 'transform 0.1s';
    el.style.transform = 'scale(1.3)';
    el.style.color = '#ff5252';
    setTimeout(() => { el.style.transform = ''; el.style.color = ''; }, 150);
  }

  // ---------- PvP 몹 던지기: 카드를 위쪽 상대 전장으로 끌어다 놓는다 ----------
  /** PvP 시작 카운트다운 중 (판이 멈춰 있는 동안 소환·던지기를 받지 않는다) */
  private countingDown(): boolean {
    return this.game.isPvp && this.game.paused && !this.game.over;
  }

  /** 화면이 보인 뒤 긴 이름·버튼 글자를 칸에 맞춘다 (숨겨진 채로는 폭을 잴 수 없다) */
  refit(): void {
    fitAll($('game-frame'));
  }

  private buildAttackCards(): void {
    const row = $('attack-row');
    // 내 공격 덱 4장 (로비 '덱' 에서 편성)
    row.innerHTML = this.game.attackCards.map((c, i) => {
      const a = ATTACKS[c];
      return `<button class="attack-card c${i}" data-card="${c}" aria-label="${a.kr}: ${a.desc}">
      ${spriteIcon(mobSprite(a.race, a.variant).url, 'frame-sprite')}<b>${a.kr}</b><span>${icon('coin')}${a.cost}</span><i class="cd"></i></button>`;
    }).join('');
    const opp = $<HTMLCanvasElement>('opp-canvas');
    // 손가락 위치 → 상대 길 위치 (상대 전장 밖이면 null)
    const posAt = (x: number, y: number): number | null => {
      const r = opp.getBoundingClientRect();
      if (x < r.left || x > r.right || y < r.top || y > r.bottom) return null;
      return pathPosNear(((x - r.left) / r.width) * MAP.size, ((y - r.top) / r.height) * MAP.size);
    };
    row.querySelectorAll<HTMLButtonElement>('.attack-card').forEach((card) => {
      const tier = Number(card.dataset.card);
      let ghost: HTMLElement | null = null;
      let x0 = 0, y0 = 0;
      const move = (e: PointerEvent) => {
        if (!ghost) return;
        ghost.style.left = `${e.clientX}px`;
        ghost.style.top = `${e.clientY}px`;
        this.opp?.setAim(posAt(e.clientX, e.clientY));
      };
      const end = () => { ghost?.remove(); ghost = null; this.opp?.setAim(null); $('game-frame').classList.remove('aiming'); };
      card.onpointerdown = (e) => {
        if (card.disabled) { this.flashGold(); return; }
        e.preventDefault();
        try { card.setPointerCapture(e.pointerId); } catch { /* 합성 이벤트 등 */ }
        x0 = e.clientX; y0 = e.clientY;
        $('game-frame').classList.add('aiming'); // 상대 전장을 크게 펼친다
        ghost = document.createElement('div');
        ghost.className = 'throw-ghost';
        const a = ATTACKS[tier];
        ghost.innerHTML = spriteIcon(mobSprite(a.race, a.variant).url, 'frame-sprite');
        document.body.appendChild(ghost);
        move(e);
      };
      card.onpointermove = move;
      card.onpointerup = (e) => {
        if (!ghost) return;
        const pos = posAt(e.clientX, e.clientY);
        const moved = Math.hypot(e.clientX - x0, e.clientY - y0);
        end();
        if (pos !== null) {
          if (this.game.sendAttack(tier, pos)) {
            const land = this.oppPoint(pos); // 손을 뗀 곳이 아니라 작아진 미니맵 위 실제 착지 지점으로
            this.flyThrow(card, land.x, land.y, tier);
            this.opp?.markThrow(pos, tier);
            this.hideThrowHint();
          } else this.flashGold();
        } else if (moved < 12) {
          toast(tl('카드를 위쪽 <b>상대 전장</b>으로 끌어다 던지세요'));
        }
      };
      card.onpointercancel = end;
    });
  }

  /**
   * 상대 전장(미니맵) 위에서 길 위치 pos 의 화면 좌표. 끄는 동안 크게 펼친 창은 손을 떼면 작아지므로
   * 줄어드는 애니메이션을 건너뛰고 최종 크기로 잰다 (그래야 날아가는 몹이 미니맵 바로 그 자리에 떨어진다).
   */
  private oppPoint(pos: number): { x: number; y: number } {
    const c = $('opp-canvas');
    const tr = c.style.transition;
    c.style.transition = 'none';
    const r = c.getBoundingClientRect();
    c.style.transition = tr;
    const b = c.clientLeft;
    const p = pathAt(pos);
    return { x: r.left + b + (p.x / MAP.size) * c.clientWidth, y: r.top + b + (p.y / MAP.size) * c.clientHeight };
  }

  /** 던진 몹이 카드에서 놓은 자리까지 포물선으로 날아가고, 상대 창이 흔들린다 */
  private flyThrow(card: HTMLElement, x: number, y: number, c: number): void {
    const a = ATTACKS[c];
    const r = card.getBoundingClientRect();
    const fly = document.createElement('div');
    fly.className = 'throw-fly';
    fly.innerHTML = spriteIcon(mobSprite(a.race, a.variant).url, 'frame-sprite');
    document.body.appendChild(fly);
    const x0 = r.left + r.width / 2, y0 = r.top + r.height / 2;
    const top = Math.min(y0, y) - 90;
    const anim = fly.animate([
      { left: `${x0}px`, top: `${y0}px`, transform: 'translate(-50%,-50%) scale(1) rotate(0deg)' },
      { left: `${(x0 + x) / 2}px`, top: `${top}px`, transform: 'translate(-50%,-50%) scale(1.4) rotate(200deg)', offset: 0.5 },
      { left: `${x}px`, top: `${y}px`, transform: 'translate(-50%,-50%) scale(0.7) rotate(400deg)' },
    ], { duration: 380, easing: 'ease-in' });
    anim.onfinish = () => {
      fly.remove();
      const opp = $('opp-canvas');
      opp.classList.remove('hit'); void opp.offsetWidth; opp.classList.add('hit');
    };
  }

  // ---------- 첫 대전: 몹 카드를 끌어 던지는 법 (던질 때까지 손가락이 반복해서 보여 준다) ----------
  // 시작하자마자 보여 주고, 한 번 던질 때까지 소환을 잠근다 (소환에 골드를 다 써서 못 던지는 일이 없게)
  private hintEl: HTMLElement | null = null;
  private hintTimer: ReturnType<typeof setInterval> | null = null;
  private summonLock = false;
  private matchStartAt = 0; // 대전 시작 시각 (Date.now() 기준, 서버 시각에 맞춤)
  private matchEndAt = 0;
  showThrowHint(): void {
    if (this.hintTimer) return;
    this.summonLock = true;
    this.hintTimer = setInterval(() => {
      const card = document.querySelector<HTMLButtonElement>('#attack-row .attack-card:not(:disabled)');
      if (!card || this.game.over || this.game.paused) {
        if (!card && !this.game.paused) this.summonLock = false; // 던질 카드가 없으면 막아 둘 이유가 없다
        this.hintEl?.classList.add('hidden');
        return;
      }
      if (!this.hintEl) {
        this.hintEl = document.createElement('div');
        this.hintEl.className = 'throw-hint';
        this.hintEl.innerHTML = `<div class="bubble">${tl('카드를 끌어서<br><b>상대 전장</b>에 던지세요!')}</div><div class="hand">${icon('pointer')}</div>`;
        $('game-frame').appendChild(this.hintEl);
      }
      const f = $('game-frame').getBoundingClientRect();
      const c = card.getBoundingClientRect(), o = $('opp-canvas').getBoundingClientRect();
      const h = this.hintEl;
      h.classList.remove('hidden');
      h.style.setProperty('--x0', `${c.left - f.left + c.width / 2}px`);
      h.style.setProperty('--y0', `${c.top - f.top + c.height / 2}px`);
      h.style.setProperty('--x1', `${o.left - f.left + o.width / 2}px`);
      h.style.setProperty('--y1', `${o.top - f.top + o.height / 2}px`);
    }, 500);
  }
  hideThrowHint(): void {
    if (this.hintTimer) clearInterval(this.hintTimer);
    this.hintTimer = null;
    this.summonLock = false;
    this.hintEl?.remove();
    this.hintEl = null;
  }

  // ---------- 하단 유닛 카드 (덱 순서, 직업 단위 강화) ----------
  renderStacks(): void {
    const el = $('unit-stacks');
    const deck = this.game.opts.deck;
    const merges = new Set(this.game.mergeable().map((m) => m.job));
    el.innerHTML = '';
    for (const job of deck) {
      const units = this.game.units.filter((u) => u.job === job);
      const count = units.length;
      const top = units.reduce((g, u) => Math.max(g, u.gradeIndex), 0);
      const level = this.game.levels[job] || 1;
      const cost = this.game.upgradeCost(job);
      const strong = DMG_MULT[job][this.game.currentRace] >= 1; // 상성: 유리 ▲ / 불리 ▼
      const div = document.createElement('div');
      div.className = `stack${count ? '' : ' empty'}`;
      div.style.borderColor = count ? GRADES[top].color : '';
      div.innerHTML = `
        ${merges.has(job) ? tl('<div class="merge-tag">합성!</div>') : ''}
        <div class="count">${count}</div>
        <div class="dmg-pct">${icon(strong ? 'up' : 'down')}</div>
        ${spriteIcon(unitIconUrl(job, top))}
        <div class="name">${JOB_KR[job]} Lv.${level}</div>
        <button class="up-btn fit" data-job="${job}">${tl('강화')} ${icon('coin')}${cost}</button>`;
      const btn = div.querySelector('.up-btn') as HTMLButtonElement;
      btn.disabled = count === 0 || this.game.gold < cost;
      btn.onclick = () => { if (this.game.upgrade(job)) audio.button(); };
      div.onclick = (e) => { if (e.target !== btn && merges.has(job)) this.openHeroes(job, 'merge'); };
      el.appendChild(div);
    }
    // 'Lv Up 20'·긴 유닛 이름도 칸 안에 (카드가 다 붙어 폭이 정해진 뒤에 잰다)
    fitAll(el);
  }

  // ---------- 영웅 관리 (합성 / 판매) ----------
  private openHeroes(startJob?: Job, startMode?: 'merge' | 'sell'): void {
    const panel = $('sell-panel');
    const g = this.game;
    const jobs = (): Job[] => {
      const set = new Set<Job>(g.opts.deck);
      for (const u of g.units) set.add(u.job);
      return [...set];
    };
    let job: Job = startJob ?? g.mergeable()[0]?.job ?? jobs()[0];
    let mode: 'merge' | 'sell' = startMode ?? (g.mergeable().length ? 'merge' : 'sell');
    let qty = 1; // 판매 수량 1 | 10 | Infinity(ALL)
    let firstOpen = true;
    const render = () => {
      const mergeJobs = new Set(g.mergeable().map((m) => m.job));
      const cards = GRADES.map((gr, gi) => {
        const cnt = g.countOf(job, gr.key);
        if (mode === 'merge') {
          const can = g.canMerge(job, gr.key);
          const isTop = gi === GRADES.length - 1;
          return `<div class="grade-card${can ? ' ready' : ''}${cnt === 0 ? ' empty' : ''}" data-grade="${gr.key}">
            <div class="gc-name fit" style="color:${gr.color}">${gr.kr}</div>
            ${spriteIcon(unitIconUrl(job, gi))}
            <div class="gc-count">${cnt}/${MERGE_COUNT}</div>
            <div class="gc-gold" style="color:${isTop ? '#888' : GRADES[gi + 1].color}">${isTop ? tl('최고') : `→${GRADES[gi + 1].kr}`}</div>
          </div>`;
        }
        const sellQty = qty === Infinity ? cnt : Math.min(qty, cnt);
        return `<div class="grade-card${cnt === 0 ? ' empty' : ''}" data-grade="${gr.key}">
          <div class="gc-name fit" style="color:${gr.color}">${gr.kr}</div>
          ${spriteIcon(unitIconUrl(job, gi))}
          <div class="gc-count">${cnt}</div>
          <div class="gc-gold">+${sellQty * gr.sellGold}</div>
        </div>`;
      }).join('');
      panel.innerHTML = `
        <div class="dialog sell-dialog${firstOpen ? ' anim' : ''}">
          <button class="close-x">${icon('close')}</button>
          <div class="sell-head">
            <h2>${tl('영웅 관리')}</h2>
          </div>
          <div class="job-tabs">
            ${jobs().map((j) => `<button data-job="${j}" class="${j === job ? 'active' : ''}">${JOB_KR[j]}${mergeJobs.has(j) ? '<span class="dot"></span>' : ''}</button>`).join('')}
          </div>
          <div class="sell-hint">${mode === 'merge' ? tl('같은 카드 {0}장 → 한 등급 위로', MERGE_COUNT) : `<span>${tl('팔아서 골드 얻기')}</span>
            <span class="qty-row">
              <button data-qty="1" class="${qty === 1 ? 'active' : ''}">1</button>
              <button data-qty="10" class="${qty === 10 ? 'active' : ''}">10</button>
              <button data-qty="all" class="${qty === Infinity ? 'active' : ''}">ALL</button></span>`}</div>
          <div class="grade-row">${cards}</div>
          <div class="mode-tabs">
            <button data-mode="merge" class="merge ${mode === 'merge' ? 'active' : ''}">${icon('hammer')} ${tl('합성')}${mergeJobs.size ? ' •' : ''}</button>
            <button data-mode="sell" class="sell ${mode === 'sell' ? 'active' : ''}">${icon('coin')} ${tl('판매')}</button>
          </div>
        </div>`;
      firstOpen = false;
      fitAll(panel); // 등급 이름이 칸보다 길면(영어 Legendary 등) 글자를 줄여 맞춘다
      panel.querySelectorAll<HTMLButtonElement>('[data-qty]').forEach((b) => {
        b.onclick = () => { const v = b.dataset.qty; qty = v === 'all' ? Infinity : Number(v); render(); };
      });
      panel.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((b) => {
        b.onclick = () => { mode = b.dataset.mode as 'merge' | 'sell'; render(); };
      });
      panel.querySelectorAll<HTMLButtonElement>('[data-job]').forEach((b) => {
        b.onclick = () => { job = b.dataset.job as Job; render(); };
      });
      panel.querySelectorAll<HTMLElement>('[data-grade]').forEach((b) => {
        b.onclick = () => {
          const gk = b.dataset.grade as GradeKey;
          if (mode === 'merge') {
            if (!g.merge(job, gk)) toast(tl('같은 등급 {0}개가 필요해요', MERGE_COUNT));
          } else if (g.sellMany(job, gk, qty) > 0) {
            audio.coin();
          }
          render();
        };
      });
      (panel.querySelector('.close-x') as HTMLElement).onclick = close;
    };
    const close = () => { panel.classList.add('hidden'); this.sellOpen = null; };
    this.sellOpen = render;
    render();
    panel.onclick = (e) => { if (e.target === panel) close(); };
    panel.classList.remove('hidden');
    fitAll(panel); // 처음 열 때는 보인 뒤에야 폭을 잴 수 있다
  }

  // ---------- PvP: 상대 상태 ----------
  private oppDeckKey = '';
  setOpponentInfo(nick: string, trophies: number, bot: boolean): void {
    // 지난 판 상대 상태가 남지 않게 (카운트다운 동안 이전 판 몹 수가 보였다)
    $('opp-fill').style.width = '0%';
    $('opp-fill').classList.remove('warn');
    $('opp-count').textContent = `0/${WAVE.gameOverMobCount}`;
    $('opp-sub').textContent = '';
    $('opp-deck').innerHTML = '';
    this.oppDeckKey = '';
    $('opp-nick').textContent = nick;
    $('my-nick').textContent = meta.nick;
    void bot; // 봇도 실제 유저처럼 보여 준다
    $('opp-bot').classList.add('hidden');
    $('opp-trophy').innerHTML = `${icon('trophy')}${trophies}`;
  }

  setOpponent(s: BoardSnapshot): void {
    const pct = Math.min(100, (s.mobCount / WAVE.gameOverMobCount) * 100);
    $('opp-fill').style.width = pct + '%';
    $('opp-count').textContent = `${s.mobCount}/${WAVE.gameOverMobCount}`;
    $('opp-fill').classList.toggle('warn', pct >= 70);
    $('opp-sub').textContent = tl('Wave {0} · 유닛 {1}{2}', s.wave, s.unitCount, s.bossHp >= 0 ? tl(' · 보스 {0}%', Math.round(s.bossHp * 100)) : '');
    this.opp?.push(s);
    // 상대 덱: 무엇이 날아올지(몹 카드)와 무엇으로 막는지(유닛) - 상성을 보고 카드를 고른다
    const key = `${s.atk?.join(',')}|${s.deck?.join(',')}`;
    if (s.atk && key !== this.oppDeckKey) {
      this.oppDeckKey = key;
      const atk = s.atk.map((c) => ATTACKS[c]).filter(Boolean)
        .map((a) => spriteIcon(mobSprite(a.race, a.variant).url, 'frame-sprite', '')).join('');
      const oppJobs = (s.deck ?? []).map((j) => JOBS[j]).filter(Boolean);
      preloadUnits(oppJobs); // 상대 전장 그림
      const deck = oppJobs.map((j) => spriteIcon(unitIconUrl(j))).join('');
      $('opp-deck').innerHTML = `<div class="od-row" title="${tl('상대 몹 카드')}">${atk}</div><div class="od-row units" title="${tl('상대 유닛')}">${deck}</div>`;
    }
  }

  /** PvP 연결 끊김 안내 (null 이면 숨김) */
  setNetBanner(html: string | null): void {
    const el = $('net-banner');
    el.classList.toggle('hidden', !html);
    if (html) setHtml(el, html);
  }

  // ---------- 카운트다운 ----------
  countdown(startAt: number, onGo: () => void): void {
    this.matchStartAt = startAt; // 서버 시각에 맞춘 시작 시각 (pvp.ts 가 기기 시계로 바꿔 줌)
    this.matchEndAt = 0;
    const el = $('countdown');
    el.classList.remove('hidden');
    const tick = () => {
      const left = (startAt - Date.now()) / 1000;
      if (left <= 0) {
        el.innerHTML = 'GO!';
        audio.sendAttack();
        onGo();
        setTimeout(() => el.classList.add('hidden'), 500);
        return;
      }
      el.innerHTML = `${Math.ceil(left)}<small>${this.ctx.kind === 'pvp' ? tl('몹을 보내 상대를 무너뜨리세요!') : ''}</small>`;
      setTimeout(tick, 100);
    };
    tick();
  }

  // ---------- 판 안 한 번씩 나오는 안내 (빈틈 · 상대 전장 크게 보기 · 후반엔 몹 보내기) ----------
  private tipShowing = false;
  /** 매 프레임 호출. 다른 안내가 떠 있지 않을 때 조건에 맞는 것을 하나 6초 동안 보여 주고, 다시는 안 띄운다 */
  maybeTip(gapCount: number): void {
    const g = this.game;
    if (g.over || g.paused || this.tipShowing || this.hintTimer || !$('coach').classList.contains('hidden')) return;
    const seen = (k: string) => meta.seenFeatures.includes(`tip:${k}`);
    let tip: { key: string; text: string; target?: string } | null = null;
    if (gapCount > 0 && g.units.length >= 3 && g.time > 6 && !seen('gap')) {
      tip = { key: 'gap', text: `${icon('warning')} ${tl('길의 <b>빨간 곳</b>은 유닛 공격이 닿지 않는 빈틈이에요.<br>유닛을 끌어 옮겨서 빈틈을 막아요')}` };
    } else if (g.isPvp && g.time > 25 && !seen('peek')) {
      tip = { key: 'peek', target: 'opp-canvas', text: tl('상대 전장을 <b>누르고 있으면</b>(PC는 마우스를 올리면)<br>크게 볼 수 있어요') };
    } else if (g.isPvp && g.wave >= 8 && !seen('late')) {
      tip = { key: 'late', target: 'attack-row', text: tl('웨이브가 지날수록 몹 체력이 크게 늘어요.<br>후반엔 소환보다 <b>몹 카드로 상대를 압박</b>하는 게 효율적이에요') };
    }
    if (!tip) return;
    meta.seenFeatures.push(`tip:${tip.key}`);
    saveMeta();
    this.tipShowing = true;
    this.coach(tip.text, tip.target);
    setTimeout(() => { if (this.game === g) this.coach(null); this.tipShowing = false; }, 6500);
  }

  // ---------- 튜토리얼 코치 ----------
  coach(text: string | null, targetId?: string): void {
    document.querySelectorAll('.coach-target').forEach((e) => e.classList.remove('coach-target'));
    const el = $('coach');
    if (this.coachTimer) { clearTimeout(this.coachTimer); this.coachTimer = null; }
    if (!text) { el.classList.add('hidden'); return; }
    el.innerHTML = text;
    el.classList.remove('hidden');
    if (targetId) document.getElementById(targetId)?.classList.add('coach-target');
  }

  // ---------- 결과 ----------
  showResult(v: ResultView): void {
    this.coach(null);
    $('sell-panel').classList.add('hidden');
    const panel = $('gameover-panel');
    const stars = v.stars !== undefined
      ? `<div class="stars">${[0, 1, 2].map((i) => `<span class="${i < v.stars! ? '' : 'off'}">${icon('star')}</span>`).join('')}</div>` : '';
    const unlock = v.unlocked ? `<div class="unlock">${spriteIcon(unitIconUrl(v.unlocked, 2))}
      <div><div style="font-size:18px">${tl('새 유닛 해금:')} ${JOB_KR[v.unlocked]}</div><div class="fine" style="text-align:left">${tl('덱에 넣어 보세요')}</div></div></div>` : '';
    panel.innerHTML = `<div class="dialog result">
      <h2 class="${v.win ? 'win' : 'lose'}">${v.title}</h2>
      ${stars}
      <div class="sub">${v.sub}</div>
      <div class="rewards">${v.rewards.map((r) => `<div class="rw">${r}</div>`).join('')}</div>
      ${unlock}${v.extraHtml ?? ''}
      <div class="btns">${v.buttons.map((b, i) => `<button class="btn fit ${b.cls}" data-i="${i}" ${b.id ? `id="${b.id}"` : ''}>${b.label}</button>`).join('')}</div>
    </div>`;
    panel.querySelectorAll<HTMLButtonElement>('[data-i]').forEach((b) => {
      b.onclick = () => { audio.button(); v.buttons[Number(b.dataset.i)].action(); };
    });
    panel.classList.remove('hidden');
    popIn(panel); // 결과 창도 통통 튀며 열리고 보상이 차례로 등장
    fitAll(panel); // 버튼 글자는 한 줄로 (길면 글자를 줄인다)
  }

  hideResult(): void {
    $('gameover-panel').classList.add('hidden');
  }

  // ---------- 존 교환 드래그 ----------
  private setupDrag(): void {
    const canvas = $<HTMLCanvasElement>('game-canvas');
    let startZone: number | null = null;
    const toLogical = (e: MouseEvent | TouchEvent): { x: number; y: number } => {
      const rect = canvas.getBoundingClientRect();
      const te = e as TouchEvent;
      const pt = (te.touches && te.touches[0]) || (te.changedTouches && te.changedTouches[0]) || (e as MouseEvent);
      const cx = pt.clientX - rect.left;
      const cy = pt.clientY - rect.top;
      const scale = Math.min(rect.width / MAP.size, rect.height / MAP.size);
      const dispW = MAP.size * scale, dispH = MAP.size * scale;
      const offX = (rect.width - dispW) / 2, offY = (rect.height - dispH) / 2;
      return { x: (cx - offX) / scale, y: (cy - offY) / scale };
    };
    const zoneAt = (p: { x: number; y: number }): number | null => {
      const center = MAP.size / 2;
      const dx = p.x - center, dy = p.y - center;
      if (Math.abs(dx) > MAP.size / 2 || Math.abs(dy) > MAP.size / 2) return null;
      if (dy < 0 && Math.abs(dx) < Math.abs(dy)) return 0;
      if (dx > 0 && Math.abs(dy) < Math.abs(dx)) return 1;
      if (dy > 0 && Math.abs(dx) < Math.abs(dy)) return 2;
      if (dx < 0 && Math.abs(dy) < Math.abs(dx)) return 3;
      return null;
    };
    // 캔버스는 게임마다 재사용되므로 이전 핸들러를 덮어쓴다 (on* 프로퍼티)
    const down = (e: MouseEvent | TouchEvent) => {
      const p = toLogical(e);
      startZone = zoneAt(p);
      if (startZone !== null) this.game.drag = { from: startZone, to: null, x: p.x, y: p.y };
    };
    const move = (e: MouseEvent | TouchEvent) => {
      if (startZone === null || !this.game.drag) return;
      const p = toLogical(e);
      const z = zoneAt(p);
      this.game.drag.x = p.x;
      this.game.drag.y = p.y;
      this.game.drag.to = z !== null && z !== startZone ? z : null;
    };
    const up = (e: MouseEvent | TouchEvent) => {
      if (startZone === null) return;
      const endZone = zoneAt(toLogical(e));
      if (endZone !== null && endZone !== startZone) { this.game.swapZones(startZone, endZone); audio.button(); }
      startZone = null;
      this.game.drag = null;
    };
    const cancel = () => { startZone = null; this.game.drag = null; };
    canvas.onmousedown = down;
    canvas.onmousemove = move;
    canvas.onmouseup = up;
    canvas.onmouseleave = cancel;
    canvas.ontouchstart = down;
    canvas.ontouchmove = move;
    canvas.ontouchend = up;
    canvas.ontouchcancel = cancel;
  }
}
