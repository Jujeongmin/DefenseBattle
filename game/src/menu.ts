// ============================================================
//  메인 화면 - 게임시작 / 상점 / 연구소 (게임 밖 메타 화면)
// ============================================================
import {
  DAILY_QUESTS, ACHIEVEMENTS,
  CRYSTAL_PACKAGES, AD_REMOVE_VX, AD_REMOVAL_PRODUCT_ID, AD_SHOP_REWARD_GEMS,
  TEST_PRODUCT_ID, TEST_PRODUCT_CRYSTALS, isTestProductVisible,
  GACHA, GRADES, GRADE_BY_KEY, GRADE_INDEX, JOBS, JOB_SPRITE, starUpCost,
  rollJob, rollGachaGrade, rollGachaMythicPlus,
} from './config';
import {
  meta, saveMeta, collectionCount, collectionLevelOf, addToCollection,
  gachaPityRemaining, resetProgress,
} from './meta';
import { getPlatform } from './platform';
import { audio } from './audio';
import { t, jobName, gradeName } from './i18n';
import { openProbabilityPanel } from './probabilityPanel';
import { openRankPanel } from './rankPanel';
import { adManager } from './ad';
import { buyItem, setOnPurchaseSettled } from './vxshop';
import type { AchievementDef, Job, GradeKey } from './types';

const $ = <T extends HTMLElement = HTMLElement>(id: string): T =>
  document.getElementById(id) as T;

export class Menu {
  private onStart: () => void;

  constructor(onStart: () => void) {
    this.onStart = onStart;
    $('menu-start').onclick = () => { audio.button(); this.onStart(); };
    $('menu-shop').onclick = () => { audio.button(); this.openShop(); };
    $('menu-lab').onclick = () => { audio.button(); this.openLab(); };
    $('menu-rank').onclick = () => { audio.button(); this.openRank(); };
    $('menu-reset').onclick = () => { audio.button(); this.openResetConfirm(); };
  }

  private openRank(): void {
    openRankPanel();
  }

  private openResetConfirm(): void {
    const panel = $('confirm-panel');
    panel.innerHTML = `
      <div class="dialog">
        <h2>${t('set.resetTitle')}</h2>
        <div class="d" style="color:#bbb;text-align:center">${t('set.resetBody')}</div>
        <div class="confirm-btns">
          <button class="cancel">${t('common.cancel')}</button>
          <button class="danger">${t('set.resetBtn')}</button>
        </div>
      </div>`;
    (panel.querySelector('.cancel') as HTMLElement).onclick = () => {
      audio.button();
      panel.classList.add('hidden');
    };
    (panel.querySelector('.danger') as HTMLElement).onclick = () => {
      audio.button();
      resetProgress();
      this.refresh();
      panel.classList.add('hidden');
    };
    panel.classList.remove('hidden');
  }

  show(): void {
    $('main-menu').classList.remove('hidden');
    this.refresh();
  }
  hide(): void {
    $('main-menu').classList.add('hidden');
  }
  refresh(): void {
    $('menu-crystal-amount').textContent = String(meta.crystals);
    $('menu-best').textContent = String(meta.bestWave || 0);
  }

  // ---------- 연구소 (연구 + 퀘스트) ----------
  private openLab(): void {
    const panel = $('lab-panel');
    let tab: 'collection' | 'quest' = 'collection';
    let jobTab: Job = JOBS[0]; // 컬렉션 탭: 직업별로 나눠 스크롤 없이 6등급만 표시
    // keepScroll: 스타업/보상수령 후 재렌더 시 스크롤 위치 유지 (탭 전환은 맨 위로)
    const render = (keepScroll = false) => {
      const prevScroll = keepScroll ? (panel.querySelector<HTMLElement>('.dialog')?.scrollTop ?? 0) : 0;
      const body = tab === 'collection' ? this.collectionHtml(jobTab) : this.questHtml();
      panel.innerHTML = `
        <div class="dialog drag-scroll">
          <h2>${t('lab.title')} <span class="crystal"><span class="gem"></span> ${meta.crystals}</span></h2>
          <div class="tab-row">
            <button data-tab="collection" class="${tab === 'collection' ? 'active' : ''}">${t('lab.tabUnits')}</button>
            <button data-tab="quest" class="${tab === 'quest' ? 'active' : ''}">${t('lab.tabQuest')}</button>
          </div>
          ${body}
          <button class="close">${t('common.close')}</button>
        </div>`;
      panel.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((b) => {
        b.onclick = () => { tab = b.dataset.tab as typeof tab; render(); };
      });
      panel.querySelectorAll<HTMLButtonElement>('[data-job]').forEach((b) => {
        b.onclick = () => { jobTab = b.dataset.job as Job; audio.button(); render(); };
      });
      this.bindCollectionButtons(panel, render);
      this.bindQuestButtons(panel, render);
      this.bindDragScroll(panel.querySelector<HTMLElement>('.dialog'));
      (panel.querySelector('.close') as HTMLElement).onclick = () => {
        panel.classList.add('hidden');
        this.refresh();
      };
      const dlg = panel.querySelector<HTMLElement>('.dialog');
      if (dlg && prevScroll) dlg.scrollTop = prevScroll;
    };
    render();
    panel.classList.remove('hidden');
  }

  // 유닛 컬렉션 탭: 직업 서브탭으로 나눠 한 화면에 6등급만 표시 (스크롤 불필요)
  private collectionHtml(jobTab: Job): string {
    const jobBtns = JOBS.map((j) => {
      const sprite = `sprites/${JOB_SPRITE[j]}_${GRADES[0].spriteIndex}.png`;
      return `<button data-job="${j}" class="job-tab ${j === jobTab ? 'active' : ''}">
        <span class="frame-sprite" style="background-image:url(${sprite})"></span>${jobName(j)}
      </button>`;
    }).join('');
    let html = `<div class="d" style="color:#bbb;font-size:12px;margin-bottom:6px">${t('lab.hint')}</div>
      <div class="job-tab-row">${jobBtns}</div>`;
    for (const grade of GRADES) {
      const lv = collectionLevelOf(jobTab, grade.key);
      const have = collectionCount(jobTab, grade.key);
      const maxed = lv >= GACHA.maxLevel;
      const need = starUpCost(lv);
      const bonusNow = Math.round(lv * GACHA.bonusPerLevel * 100);
      const canUp = !maxed && have >= need;
      html += `<div class="row">
        <div class="info" style="display:flex;align-items:center;gap:8px">
          <div class="frame-sprite" style="width:34px;height:34px;flex:0 0 34px;background-image:url(sprites/${JOB_SPRITE[jobTab]}_${grade.spriteIndex}.png)"></div>
          <div>
            <div class="t" style="color:${grade.color}">${gradeName(grade.key)} <span style="color:#ffd54f">★${lv}</span> <span style="color:#7ee87e;font-size:11px">${t('lab.atkBonus', { n: bonusNow })}</span></div>
            <div class="d">${maxed ? t('lab.ownedMax', { have }) : t('lab.owned', { have, need })}</div>
          </div>
        </div>
        <button data-star="${jobTab}_${grade.key}" ${canUp ? '' : 'disabled'}>${maxed ? t('common.max') : t('lab.starUp')}</button>
      </div>`;
    }
    return html;
  }

  private bindCollectionButtons(panel: HTMLElement, render: (keepScroll?: boolean) => void): void {
    panel.querySelectorAll<HTMLButtonElement>('[data-star]').forEach((b) => {
      b.onclick = () => {
        const [job, grade] = (b.dataset.star as string).split('_') as [Job, GradeKey];
        const key = `${job}_${grade}`;
        const lv = collectionLevelOf(job, grade);
        const need = starUpCost(lv);
        if (lv < GACHA.maxLevel && (meta.collection[key] || 0) >= need) {
          meta.collection[key] -= need;              // 스타업: 개수 소모
          meta.collectionLevel[key] = lv + 1;
          saveMeta();
          audio.button();
          render(true); // 스크롤 위치 유지
        }
      };
    });
  }

  private questHtml(): string {
    const daily = DAILY_QUESTS.map((q) => {
      const prog = Math.min(q.goal, meta.daily.progress[q.key] || 0);
      const done = prog >= q.goal;
      const claimed = meta.daily.claimed[q.key];
      return `<div class="row">
        <div class="info"><div class="t">${t(`q.${q.key}`)}</div><div class="d">${prog}/${q.goal}</div></div>
        <button data-daily="${q.key}" ${!done || claimed ? 'disabled' : ''}>${claimed ? t('quest.done') : done ? `<span class="gem"></span> ${q.reward}` : t('quest.inProgress')}</button></div>`;
    }).join('');
    const ach = ACHIEVEMENTS.map((a: AchievementDef) => {
      const done = meta.achievements[a.key];
      return `<div class="row">
        <div class="info"><div class="t">${t(`a.${a.key}`)}</div><div class="d">${t('quest.rewardPre')} <span class="gem"></span> ${a.reward}</div></div>
        <button disabled>${done ? t('quest.unlocked') : t('quest.locked')}</button></div>`;
    }).join('');
    return `<div style="font-weight:700;margin:4px 0 6px">${t('quest.daily')}</div>${daily}
            <div style="font-weight:700;margin:10px 0 6px">${t('quest.achievements')}</div>${ach}`;
  }

  private bindQuestButtons(panel: HTMLElement, render: (keepScroll?: boolean) => void): void {
    panel.querySelectorAll<HTMLButtonElement>('[data-daily]').forEach((b) => {
      b.onclick = () => {
        const key = b.dataset.daily as string;
        const q = DAILY_QUESTS.find((x) => x.key === key)!;
        const prog = meta.daily.progress[key] || 0;
        if (prog >= q.goal && !meta.daily.claimed[key]) {
          meta.daily.claimed[key] = true;
          meta.crystals += q.reward;
          saveMeta();
          render(true); // 스크롤 위치 유지
        }
      };
    });
  }

  private bindDragScroll(el: HTMLElement | null): void {
    if (!el) return;
    let pointerId = -1;
    let startY = 0;
    let startScrollTop = 0;

    el.onpointerdown = (ev) => {
      if ((ev.target as HTMLElement).closest('button')) return;
      pointerId = ev.pointerId;
      startY = ev.clientY;
      startScrollTop = el.scrollTop;
      el.classList.add('dragging');
      el.setPointerCapture(pointerId);
    };

    el.onpointermove = (ev) => {
      if (ev.pointerId !== pointerId) return;
      const dy = ev.clientY - startY;
      if (Math.abs(dy) > 2) ev.preventDefault();
      el.scrollTop = startScrollTop - dy;
    };

    const stop = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      if (el.hasPointerCapture(pointerId)) el.releasePointerCapture(pointerId);
      pointerId = -1;
      el.classList.remove('dragging');
    };

    el.onpointerup = stop;
    el.onpointercancel = stop;
  }

  // ---------- 상점 (VX 로 보석 구매 / 광고제거 패키지) ----------
  private shopAdHtml(): string {
    const cd = adManager.getShopAdCooldownRemaining();
    const available = cd <= 0;
    const removed = adManager.isAdRemoved();

    const btnLabel = !available
      ? t('shop.adCooldownBtn', { time: this.formatCooldown(cd) })
      : removed
        ? `${t('shop.adFreeBtn')} <span class="gem"></span> ${AD_SHOP_REWARD_GEMS}`
        : `${t('shop.adWatchBtn')} <span class="gem"></span> ${AD_SHOP_REWARD_GEMS}`;

    const infoText = removed ? t('shop.adRemovedInfo') : t('shop.adInfo');

    return `
      <div class="shop-section" style="margin-top:14px;">${t('shop.adSection')}</div>
      <div class="shop-ad-box">
        <div class="shop-ad-info">${infoText}</div>
        <button id="btn-shop-ad" class="wood-btn shop-ad-btn" ${available ? '' : 'disabled'}>
          ${btnLabel}
        </button>
      </div>`;
  }

  private formatCooldown(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return t('shop.minSec', { m, s });
  }

  private refreshShopAdCooldown(btn: HTMLButtonElement): void {
    const update = () => {
      const cd = adManager.getShopAdCooldownRemaining();
      if (cd <= 0) {
        btn.disabled = false;
        btn.innerHTML = `${t('shop.adWatchBtn')} <span class="gem"></span> ${AD_SHOP_REWARD_GEMS}`;
        return;
      }
      btn.disabled = true;
      btn.innerHTML = t('shop.adCooldownBtn', { time: this.formatCooldown(cd) });
      setTimeout(update, 1000);
    };
    update();
  }

  private openShop(): void {
    const panel = $('shop-panel');
    const plat = getPlatform();
    const render = () => {
      const owned = plat.isAdRemoved();
      const pkgs = CRYSTAL_PACKAGES.map((p) => `
        <div class="row">
          <div class="info">
            <div class="t"><span class="gem"></span> ${t('shop.gemPack', { n: p.crystals.toLocaleString() })}${p.bonus ? ` <span style="color:#7ee87e">+${p.bonus}%</span>` : ''}</div>
            <div class="d">VX ${p.vx}</div>
          </div>
          <button data-pkg-id="${p.id}">VX ${p.vx}</button>
        </div>`).join('');
      panel.innerHTML = `
        <div class="dialog drag-scroll">
          <h2>${t('shop.title')}</h2>
          <div class="shop-balance">
            <span class="crystal"><span class="gem"></span> ${meta.crystals.toLocaleString()}</span>
          </div>
          <div class="gacha-hero">
            <div class="gacha-hero-top">
              <div class="chest big"></div>
              <div class="gacha-hero-info">
                <div class="gh-title">${t('shop.gachaTitle')}</div>
                <div class="gh-desc">${t('shop.gachaDesc')}</div>
              </div>
            </div>
            <div class="gacha-hero-btns">
              <button id="gacha-1" ${meta.crystals < GACHA.singleCost ? 'disabled' : ''}>
                ${t('shop.pull1')}<br><span class="gh-cost"><span class="gem"></span> ${GACHA.singleCost}</span>
              </button>
              <button id="gacha-10" class="best" ${meta.crystals < GACHA.tenCost ? 'disabled' : ''}>
                ${t('shop.pull10')} <span class="gh-sale">10%↓</span><br><span class="gh-cost"><span class="gem"></span> ${GACHA.tenCost}</span>
              </button>
            </div>
            <div class="gacha-pity">${
              gachaPityRemaining() <= 0 ? t('shop.pityReady') : t('shop.pityHint', { rem: gachaPityRemaining() })
            }</div>
            <button id="btn-prob-info-shop" class="prob-info-link">${t('hud.probInfo')}</button>
          </div>
          <div class="shop-section">${t('shop.buyGems')}</div>
          ${pkgs}
          <div class="shop-section">${t('shop.packages')}</div>
          <div class="row">
            <div class="info">
              <div class="t">${t('shop.adTitle')}</div>
              <div class="d">${t('shop.adDesc', { n: AD_REMOVE_VX })}</div>
            </div>
            <button id="buy-adremove" ${owned ? 'disabled' : ''}>${owned ? t('shop.owned') : `VX ${AD_REMOVE_VX}`}</button>
          </div>
          ${isTestProductVisible() ? `
          <div class="row">
            <div class="info">
              <div class="t">${t('shop.testTitle')}</div>
              <div class="d">${t('shop.testDesc', { n: TEST_PRODUCT_CRYSTALS })}</div>
            </div>
            <button id="buy-test-free">VX 0</button>
          </div>` : ''}
          <div class="d" style="color:#888;font-size:12px;margin-top:8px">
            ${t('shop.vxNote')}
          </div>
          ${this.shopAdHtml()}
          <button class="close">${t('common.close')}</button>
        </div>`;

      // 보석 패키지 구매: Verse8 결제창을 띄운다. 지급은 서버(server/src/server.ts 의
      // $onItemPurchased)가 담당하고, 결제창이 닫히면 vxshop.ts 가 서버 상태를 다시 받아와
      // meta 에 반영한 뒤 setOnPurchaseSettled 로 등록해둔 render() 가 호출된다.
      panel.querySelectorAll<HTMLButtonElement>('[data-pkg-id]').forEach((b) => {
        b.onclick = () => { audio.button(); buyItem(b.dataset.pkgId as string); };
      });

      // 유닛 가챠 (크리스탈 차감 → 컬렉션 적립)
      const g1 = panel.querySelector('#gacha-1') as HTMLButtonElement | null;
      const g10 = panel.querySelector('#gacha-10') as HTMLButtonElement | null;
      if (g1) g1.onclick = () => { if (this.pullGacha(1)) render(); };
      if (g10) g10.onclick = () => { if (this.pullGacha(10)) render(); };
      const probBtn = panel.querySelector('#btn-prob-info-shop') as HTMLButtonElement | null;
      if (probBtn) probBtn.onclick = () => openProbabilityPanel('gacha');

      // 광고제거 패키지: 결제창을 띄운다 (지급/소유 등록은 서버가 처리)
      const buy = panel.querySelector('#buy-adremove') as HTMLButtonElement | null;
      if (buy && !owned) buy.onclick = () => { audio.button(); buyItem(AD_REMOVAL_PRODUCT_ID); };

      // QA 검증용 0 VX 상품 (?vxtest=1 일 때만 렌더됨)
      const buyTest = panel.querySelector('#buy-test-free') as HTMLButtonElement | null;
      if (buyTest) buyTest.onclick = () => { audio.button(); buyItem(TEST_PRODUCT_ID); };

      this.bindDragScroll(panel.querySelector<HTMLElement>('.dialog'));

      // 상점 보상형 광고 버튼
      const shopAdBtn = panel.querySelector('#btn-shop-ad') as HTMLButtonElement | null;
      if (shopAdBtn && adManager.isRewardAvailable()) {
        this.refreshShopAdCooldown(shopAdBtn);
        shopAdBtn.onclick = async () => {
          audio.button();
          shopAdBtn.disabled = true;
          try {
            const ok = await adManager.watchShopRewardedAd();
            if (ok) {
              meta.crystals += AD_SHOP_REWARD_GEMS;
              saveMeta();
              this.refresh();
              render();
            }
          } catch { /* ignore */ }
          shopAdBtn.disabled = false;
          this.refreshShopAdCooldown(shopAdBtn);
        };
      }

      (panel.querySelector('.close') as HTMLElement).onclick = () => {
        panel.classList.add('hidden');
        setOnPurchaseSettled(null);
        this.refresh();
      };
    };
    // 결제창이 닫혀 서버 지급이 반영된 뒤(vxshop.ts) 상점이 아직 열려있으면 다시 그린다.
    setOnPurchaseSettled(() => { this.refresh(); render(); });
    render();
    panel.classList.remove('hidden');
  }

  // ---------- 유닛 가챠 ----------
  // 확률은 config.GACHA_GRADE_RATES (게임 내 20골드 소환과는 분리된 전용 표).
  // 천장: 신화 이상이 GACHA.mythicPityCount 회 연속 안 나오면 다음 뽑기 신화 이상 확정
  //       (확정 시 신화:태초 = 4:1 = 신화 80% / 태초 20%).
  private pullGacha(n: number): boolean {
    const cost = n === 1 ? GACHA.singleCost : GACHA.tenCost;
    if (meta.crystals < cost) return false;
    meta.crystals -= cost;

    const results: { job: Job; grade: GradeKey }[] = [];
    for (let i = 0; i < n; i++) {
      meta.gachaPity = (meta.gachaPity || 0) + 1;
      let grade: GradeKey;
      if (meta.gachaPity >= GACHA.mythicPityCount) {
        grade = rollGachaMythicPlus();
        meta.gachaPity = 0;
      } else {
        grade = rollGachaGrade();
        if (GRADE_INDEX[grade] >= GRADE_INDEX['mythic']) meta.gachaPity = 0;
      }
      results.push({ job: rollJob(), grade });
    }
    for (const r of results) addToCollection(r.job, r.grade);
    saveMeta();

    // 최고 등급에 맞춰 사운드
    const best = Math.max(...results.map((r) => GRADE_INDEX[r.grade]));
    audio.summon(best >= GRADE_INDEX['mythic']);
    this.showGacha(results);
    this.refresh();
    return true;
  }

  private showGacha(results: { job: Job; grade: GradeKey }[]): void {
    const panel = $('gacha-panel');
    const cards = results
      .slice()
      .sort((a, b) => GRADE_INDEX[b.grade] - GRADE_INDEX[a.grade])
      .map((r) => {
        const g = GRADE_BY_KEY[r.grade];
        const shiny = GRADE_INDEX[r.grade] >= GRADE_INDEX['legendary'] ? ' shiny' : '';
        return `<div class="gacha-card${shiny}" style="border-color:${g.color}">
          <div class="frame-sprite" style="background-image:url(sprites/${JOB_SPRITE[r.job]}_${g.spriteIndex}.png)"></div>
          <div class="gc-grade" style="color:${g.color}">${gradeName(r.grade)}</div>
          <div class="gc-job">${jobName(r.job)}</div>
        </div>`;
      }).join('');
    panel.innerHTML = `
      <div class="dialog">
        <h2><span class="chest"></span> ${t('gacha.got')}</h2>
        <div class="gacha-grid">${cards}</div>
        <button class="close">${t('common.confirm')}</button>
      </div>`;
    (panel.querySelector('.close') as HTMLElement).onclick = () => panel.classList.add('hidden');
    panel.classList.remove('hidden');
  }
}
