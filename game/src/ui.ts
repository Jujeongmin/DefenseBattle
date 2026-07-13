// ============================================================
//  DOM UI - 상단바/소환/강화/판매/연구소/퀘스트/드래그
// ============================================================
import {
  JOBS, GRADES, JOB_SPRITE, DMG_MULT, ECONOMY, WAVE, crystalReward,
} from './config';
import { MAP, Game } from './engine';
import { mobPortraitSrc } from './assets';
import { meta, saveMeta } from './meta';
import { getPlatform } from './platform';
import { audio } from './audio';
import { GRADE_INDEX } from './config';
import { t, jobName, gradeName, raceName } from './i18n';
import { openProbabilityPanel } from './probabilityPanel';
import { openSettingsPanel } from './settingsPanel';
import { GameServer } from '@agent8/gameserver';
import { getLocalNickname, setLocalNickname } from './rankPanel';
import type { Job, Race, GradeKey, GameOverData } from './types';

// 상성 % 색상
function pctColor(pct: number): string {
  if (pct >= 100) return '#7ee87e';
  if (pct >= 80) return '#ffd54f';
  return '#ff7b7b';
}

const $ = <T extends HTMLElement = HTMLElement>(id: string): T =>
  document.getElementById(id) as T;

export class UI {
  private game: Game;
  private onExit: () => void;
  private speeds: number[];
  private speedIdx = 0;
  private lastRace: Race | null = null;
  private lastUpgradeGold = -1;
  private summonHoldTimer: number | null = null;

  constructor(game: Game, onExit: () => void) {
    this.game = game;
    this.onExit = onExit;
    // 3배속은 광고제거 패키지 보유 시 해금 (상점)
    this.speeds = getPlatform().isAdRemoved() ? [1, 2, 3] : [1, 2];
    this.bind();
    game.on('roster', () => this.renderStacks());
    game.on('gameover', (d) => this.showGameOver(d));
    game.on('achievement', (a) => this.toast(t('toast.achievement', { name: t(`a.${a.key}`), n: a.reward })));
    // 사운드
    game.on('shoot', () => audio.attack());
    game.on('kill', (boss) => audio.kill(boss));
    game.on('bossSpawn', () => audio.boss());
    game.on('gameover', (d) => audio.gameEnd(d.cleared));
  }

  private bind(): void {
    this.bindHoldSummon();
    $('btn-prob-info-game').onclick = () => openProbabilityPanel('summon');
    $('btn-pause').onclick = () => {
      audio.button();
      this.game.paused = !this.game.paused;
      $('btn-pause').textContent = this.game.paused ? '▶' : '❚❚';
    };
    $('btn-speed').onclick = () => {
      audio.button();
      this.speedIdx = (this.speedIdx + 1) % this.speeds.length;
      this.game.speed = this.speeds[this.speedIdx];
      $('btn-speed').textContent = this.game.speed + 'x';
    };
    $('btn-sell-panel').onclick = () => { audio.button(); this.openSell(); };
    $('btn-menu').onclick = () => { audio.button(); this.openExitConfirm(); };
    $('btn-settings').onclick = () => { audio.button(); openSettingsPanel(); };
    // 상단바 버튼은 DOM 이 판마다 재사용되므로, 새 게임 시작 시 이전 판의 표시값을 초기화한다.
    this.speedIdx = 0;
    this.game.speed = this.speeds[this.speedIdx];
    $('btn-speed').textContent = this.game.speed + 'x';
    $('btn-pause').textContent = '❚❚';
    this.bindDebug();
    this.setupDrag();
  }

  private bindHoldSummon(): void {
    const btn = $('btn-summon') as HTMLButtonElement;
    const summonOnce = (): boolean => {
      const u = this.game.summon();
      if (u) {
        audio.summon(u.gradeIndex >= GRADE_INDEX['mythic']);
        return true;
      }
      if (this.game.gold < ECONOMY.summonCost) this.flashGold();
      return false;
    };
    const stop = () => {
      if (this.summonHoldTimer !== null) {
        window.clearTimeout(this.summonHoldTimer);
        this.summonHoldTimer = null;
      }
      btn.classList.remove('holding');
    };
    // 꾹 누르고 있을수록 소환 간격이 점점 짧아진다(가속): 340ms → 최소 60ms
    const HOLD_START_MS = 340, HOLD_MIN_MS = 60, HOLD_ACCEL_MS = 28;
    const start = (ev: PointerEvent) => {
      if (btn.disabled || this.summonHoldTimer !== null) return;
      ev.preventDefault();
      btn.setPointerCapture(ev.pointerId);
      btn.classList.add('holding');
      if (!summonOnce()) { stop(); return; }
      let delay = HOLD_START_MS;
      const tick = () => {
        if (btn.disabled || !summonOnce()) { stop(); return; }
        delay = Math.max(HOLD_MIN_MS, delay - HOLD_ACCEL_MS);
        this.summonHoldTimer = window.setTimeout(tick, delay);
      };
      this.summonHoldTimer = window.setTimeout(tick, delay);
    };
    btn.onpointerdown = start;
    btn.onpointerup = stop;
    btn.onpointercancel = stop;
    btn.onlostpointercapture = stop;
    btn.oncontextmenu = (ev) => ev.preventDefault();
  }

  // 개발 서버에서만 노출되는 테스트용 강제 소환 버튼 (배포 빌드엔 표시 안 됨)
  private bindDebug(): void {
    if (!import.meta.env.DEV) return;
    $('debug-panel').classList.remove('hidden');
    $('debug-mythic').onclick = () => {
      const u = this.game.summonDebug('mythic');
      if (u) audio.summon(true);
    };
    $('debug-eternal').onclick = () => {
      const u = this.game.summonDebug('eternal');
      if (u) audio.summon(true);
    };
  }

  // ---------- 매 프레임 갱신 ----------
  update(): void {
    const g = this.game;
    $('wave-label').textContent = t('hud.wave', { n: Math.max(1, g.wave) });
    $('mob-race').textContent = raceName(g.currentRace);
    const portrait = $('mob-portrait');
    if (portrait.dataset.race !== g.currentRace) {
      portrait.dataset.race = g.currentRace;
      portrait.style.backgroundImage = `url(${mobPortraitSrc(g.currentRace)})`;
    }
    // 웨이브 몹 종족이 바뀌면 카드 상성 % 갱신
    if (this.lastRace !== g.currentRace) {
      this.lastRace = g.currentRace;
      this.renderStacks();
    }

    $('gold-amount').textContent = String(Math.floor(g.gold));

    const pct = Math.min(100, (g.mobs.length / WAVE.gameOverMobCount) * 100);
    $('mob-progress-fill').style.width = pct + '%';
    $('mob-count-label').textContent = `${g.mobs.length} / ${WAVE.gameOverMobCount}`;

    const bt = $('boss-timer');
    if (g.waveState === 'waiting_boss' || (g.isBossWave && g.waveState === 'spawning')) {
      // 보스 웨이브: 제한 시간(초과 시 게임오버) 표시
      bt.classList.remove('hidden', 'rest');
      bt.textContent = `⏱ ${g.bossTimer.toFixed(1)}s`;
    } else if (g.waveState === 'rest') {
      // 웨이브 사이 휴식: 다음 웨이브 시작까지 남은 시간 표시
      bt.classList.remove('hidden');
      bt.classList.add('rest');
      bt.textContent = t('hud.nextWave', { s: Math.max(0, Math.ceil(g.restTimer)) });
    } else {
      bt.classList.add('hidden');
    }

    $('summon-log').innerHTML = g.log.map((l) => `<div>${l.text}</div>`).join('');

    const banner = $('mythic-banner');
    if (g.mythicBanner) {
      banner.classList.remove('hidden');
      banner.textContent = g.mythicBanner.text;
    } else {
      banner.classList.add('hidden');
    }

    ($('btn-summon') as HTMLButtonElement).disabled = g.gold < ECONOMY.summonCost;
    if (Math.floor(g.gold) !== this.lastUpgradeGold) {
      this.lastUpgradeGold = Math.floor(g.gold);
      this.updateUpgradeButtons();
    }
  }

  private flashGold(): void {
    const el = $('gold-badge');
    el.style.transition = 'transform 0.1s';
    el.style.transform = 'scale(1.3)';
    el.style.color = '#ff5252';
    setTimeout(() => { el.style.transform = ''; el.style.color = ''; }, 150);
  }

  // ---------- 유닛 강화 패널 (하단, 직업 단위) ----------
  // 소환 전에도 3직업 카드를 항상 표시(common 스프라이트). 유닛 0이면 강화 비활성.
  renderStacks(): void {
    const el = $('unit-stacks');
    const order: Job[] = ['wizard', 'archer', 'warrior']; // 마법사/궁수/전사
    const common = GRADES[0]; // 일반 등급 스프라이트/색
    const pct = (job: Job) => Math.round(DMG_MULT[job][this.game.currentRace] * 100);
    el.innerHTML = '';
    for (const job of order) {
      const count = this.game.units.reduce((n, u) => n + (u.job === job ? 1 : 0), 0);
      const level = this.game.levels[job] || 1;
      const cost = this.game.upgradeCost(job);
      const p = pct(job);
      const div = document.createElement('div');
      div.className = 'stack';
      div.style.borderColor = common.color;
      div.innerHTML = `
        <div class="count">${count}</div>
        <div class="dmg-pct" style="color:${pctColor(p)}">${p}%</div>
        <div class="frame-sprite" style="background-image:url(sprites/${JOB_SPRITE[job]}_${common.spriteIndex}.png)"></div>
        <div class="name">${jobName(job)} Lv.${level}</div>
        <button class="up-btn" data-upgrade-cost="${cost}" data-unit-count="${count}">${t('hud.upgrade')} <span class="coin"></span>${cost}</button>`;
      const btn = div.querySelector('.up-btn') as HTMLButtonElement;
      btn.disabled = count === 0 || this.game.gold < cost;
      btn.onclick = () => { if (this.game.upgrade(job)) audio.button(); };
      el.appendChild(div);
    }
    this.lastUpgradeGold = Math.floor(this.game.gold);
  }

  private updateUpgradeButtons(): void {
    document.querySelectorAll<HTMLButtonElement>('[data-upgrade-cost]').forEach((btn) => {
      const cost = Number(btn.dataset.upgradeCost);
      const count = Number(btn.dataset.unitCount);
      btn.disabled = count === 0 || this.game.gold < cost;
    });
  }

  // ---------- 판매 패널 (영웅 판매) ----------
  private openSell(): void {
    const panel = $('sell-panel');
    let job: Job = JOBS[0];
    let qty = 1; // 1 | 10 | Infinity(ALL)
    let firstOpen = true; // 처음 열 때만 슬라이드업
    const render = () => {
      const cards = GRADES.map((gr) => {
        const cnt = this.game.countOf(job, gr.key);
        const sellQty = qty === Infinity ? cnt : Math.min(qty, cnt);
        const gold = sellQty * gr.sellGold;
        return `<div class="grade-card${cnt === 0 ? ' empty' : ''}" data-grade="${gr.key}">
          <div class="gc-name" style="color:${gr.color}">${gradeName(gr.key)}</div>
          <div class="frame-sprite" style="background-image:url(sprites/${JOB_SPRITE[job]}_${gr.spriteIndex}.png)"></div>
          <div class="gc-count">${cnt}</div>
          <div class="gc-gold">+${gold}</div>
        </div>`;
      }).join('');
      panel.innerHTML = `
        <div class="dialog sell-dialog${firstOpen ? ' anim' : ''}">
          <button class="close-x">✕</button>
          <div class="sell-hint">${t('sell.hint')}</div>
          <div class="sell-head">
            <h2>${t('sell.title')}</h2>
            <div class="qty-row">
              <button data-qty="1" class="${qty === 1 ? 'active' : ''}">1</button>
              <button data-qty="10" class="${qty === 10 ? 'active' : ''}">10</button>
              <button data-qty="all" class="${qty === Infinity ? 'active' : ''}">${t('sell.all')}</button>
            </div>
          </div>
          <div class="grade-row">${cards}</div>
          <div class="job-tabs">
            ${JOBS.map((j) => `<button data-job="${j}" class="${j === job ? 'active' : ''}">${jobName(j)}</button>`).join('')}
          </div>
        </div>`;
      firstOpen = false; // 이후 재렌더(탭/수량 전환)에는 애니메이션 미적용
      panel.querySelectorAll<HTMLButtonElement>('[data-qty]').forEach((b) => {
        b.onclick = () => { const v = b.dataset.qty; qty = v === 'all' ? Infinity : Number(v); render(); };
      });
      panel.querySelectorAll<HTMLButtonElement>('[data-job]').forEach((b) => {
        b.onclick = () => { job = b.dataset.job as Job; render(); };
      });
      panel.querySelectorAll<HTMLElement>('[data-grade]').forEach((b) => {
        b.onclick = () => {
          if (this.game.sellMany(job, b.dataset.grade as GradeKey, qty) > 0) audio.button();
          render();
        };
      });
      (panel.querySelector('.close-x') as HTMLElement).onclick = () => panel.classList.add('hidden');
    };
    render();
    // 배경(바텀 시트 바깥) 탭 시 닫기
    panel.onclick = (e) => { if (e.target === panel) panel.classList.add('hidden'); };
    panel.classList.remove('hidden');
  }

  // ---------- 메인으로 나가기 확인 ----------
  private openExitConfirm(): void {
    const panel = $('confirm-panel');
    const wasPaused = this.game.paused;
    this.game.paused = true; // 결정하는 동안 웨이브가 계속 진행되지 않도록 일시정지
    panel.innerHTML = `
      <div class="dialog">
        <h2>${t('exit.title')}</h2>
        <div class="d" style="color:#bbb;text-align:center">
          ${t('exit.body', { n: Math.max(1, this.game.wave) })}
        </div>
        <div class="confirm-btns">
          <button class="cancel">${t('common.continue')}</button>
          <button class="danger">${t('common.leave')}</button>
        </div>
      </div>`;
    const close = () => {
      panel.classList.add('hidden');
      this.game.paused = wasPaused;
    };
    (panel.querySelector('.cancel') as HTMLElement).onclick = () => { audio.button(); close(); };
    (panel.querySelector('.danger') as HTMLElement).onclick = () => {
      audio.button();
      panel.classList.add('hidden'); // 메인화면으로 전환된 뒤에도 이 패널이 남아있지 않도록 직접 닫는다.
      this.onExit();
    };
    panel.classList.remove('hidden');
  }

  // ---------- 게임 오버 ----------
  private showGameOver(d: GameOverData): void {
    const panel = $('gameover-panel');
    const reward = crystalReward(d.wave);
    meta.crystals += reward;
    saveMeta();

    const currentNick = getLocalNickname();

    panel.innerHTML = `
      <div class="dialog big-result" style="max-height: 90vh; overflow-y: auto; padding: 20px;">
        <h2>${d.cleared ? t('over.clear') : t('over.gameover')}</h2>
        <div class="d" style="color:#bbb; margin-bottom: 8px;">${d.reason}</div>
        <div class="wave-big" style="font-size: 32px; font-weight: 800; color: #ffcf3f; margin-bottom: 12px;">${t('hud.wave', { n: d.wave })}</div>
        <div class="reward" style="margin-bottom: 4px;">${t('over.reward')} <span class="crystal"><span class="gem"></span> ${reward}</span></div>
        <div class="d" style="color:#bbb; margin-bottom: 16px;">${t('over.owned')} <span class="gem"></span> ${meta.crystals}</div>
        
        <!-- 랭킹 등록 카드 -->
        <div style="background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 12px; padding: 12px 16px; margin-bottom: 16px; text-align: center;">
          <div style="font-weight: 800; font-size: 14px; color: #ffcf3f; margin-bottom: 6px;">🏆 실시간 랭킹 등록</div>
          <div style="font-size: 12px; color: #aaa; margin-bottom: 10px;">이번 판 기록(${d.wave}웨이브)을 랭킹에 올리세요!</div>
          <div style="display: flex; gap: 8px; justify-content: center; align-items: stretch; height: 38px; max-width: 280px; margin: 0 auto;">
            <input type="text" id="gameover-nickname" value="${currentNick}" style="flex: 1; min-width: 0; padding: 6px 12px; border: 1px solid #555; background: #222; color: #fff; border-radius: 8px; font-size: 13px; text-align: center;" maxLength="15" />
            <button id="btn-submit-rank" class="wood-btn" style="padding: 0 16px; font-size: 13px; font-weight: 800; border-radius: 0;">기록 등록</button>
          </div>
          <div id="gameover-submit-status" style="font-size: 11px; color: #8892b0; margin-top: 6px; min-height: 16px;"></div>
        </div>

        <button class="close" id="btn-restart" style="width: 100%; max-width: 280px; margin: 0 auto;">${t('over.toMain')}</button>
      </div>`;

    const submitBtn = panel.querySelector('#btn-submit-rank') as HTMLButtonElement;
    const nickInput = panel.querySelector('#gameover-nickname') as HTMLInputElement;
    const statusDiv = panel.querySelector('#gameover-submit-status') as HTMLDivElement;

    submitBtn.onclick = async () => {
      audio.button();
      const nick = nickInput.value.trim();
      if (nick.length < 1) {
        statusDiv.textContent = '⚠️ 닉네임을 입력해 주세요.';
        statusDiv.style.color = '#ff5252';
        return;
      }
      if (nick.length > 15) {
        statusDiv.textContent = '⚠️ 닉네임은 최대 15자까지 가능합니다.';
        statusDiv.style.color = '#ff5252';
        return;
      }

      setLocalNickname(nick);
      submitBtn.disabled = true;
      nickInput.disabled = true;
      statusDiv.textContent = '⏳ 서버에 등록하는 중...';
      statusDiv.style.color = '#ffd54f';

      try {
        const server = GameServer.getInstance();
        if (!server.connected) {
          await server.connect();
        }
        const res = await server.remoteFunction('submitWave', [d.wave, nick]);
        statusDiv.textContent = `✅ ${res.message}`;
        statusDiv.style.color = '#4caf50';
      } catch (e: any) {
        console.error(e);
        statusDiv.textContent = `❌ 등록 실패: ${e.message || '네트워크 오류'}`;
        statusDiv.style.color = '#ff5252';
        submitBtn.disabled = false;
        nickInput.disabled = false;
      }
    };

    $('btn-restart').onclick = () => {
      audio.button();
      panel.classList.add('hidden');
      this.onExit();
    };
    panel.classList.remove('hidden');
  }

  private toast(msg: string): void {
    const t = document.createElement('div');
    t.textContent = msg;
    t.style.cssText = `position:absolute;left:50%;top:12%;transform:translateX(-50%);
      background:rgba(0,0,0,0.85);color:#ffd54f;padding:8px 16px;border-radius:10px;
      font-weight:700;z-index:60;font-size:14px;`;
    $('battlefield').appendChild(t);
    setTimeout(() => t.remove(), 2500);
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
    const down = (e: MouseEvent | TouchEvent) => {
      const p = toLogical(e);
      startZone = zoneAt(p);
      if (startZone !== null) {
        this.game.drag = { from: startZone, to: null, x: p.x, y: p.y };
      }
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
      if (endZone !== null && endZone !== startZone) this.game.swapZones(startZone, endZone);
      startZone = null;
      this.game.drag = null;
    };
    const cancel = () => { startZone = null; this.game.drag = null; };
    canvas.addEventListener('mousedown', down);
    canvas.addEventListener('mousemove', move);
    canvas.addEventListener('mouseup', up);
    canvas.addEventListener('mouseleave', cancel);
    canvas.addEventListener('touchstart', down, { passive: true });
    canvas.addEventListener('touchmove', move, { passive: true });
    canvas.addEventListener('touchend', up);
    canvas.addEventListener('touchcancel', cancel);
  }
}
