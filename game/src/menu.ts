// ============================================================
//  메인 화면 - 게임시작 / 상점 / 연구소 (게임 밖 메타 화면)
// ============================================================
import {
  DAILY_QUESTS, ACHIEVEMENTS,
  CRYSTAL_PACKAGES, AD_REMOVE_VX,
  GACHA, GRADES, GRADE_BY_KEY, GRADE_INDEX, JOBS, JOB_SPRITE, starUpCost,
  rollJob, rollGachaGrade, rollGachaMythicPlus, rollGachaLegendaryPlus,
} from './config';
import {
  meta, saveMeta, collectionCount, collectionLevelOf, addToCollection,
} from './meta';
import { getPlatform } from './platform';
import { audio } from './audio';
import { t, jobName, gradeName } from './i18n';
import { openProbabilityPanel } from './probabilityPanel';
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
    const render = () => {
      const body = tab === 'collection' ? this.collectionHtml() : this.questHtml();
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
      this.bindCollectionButtons(panel, render);
      this.bindQuestButtons(panel, render);
      this.bindDragScroll(panel.querySelector<HTMLElement>('.dialog'));
      (panel.querySelector('.close') as HTMLElement).onclick = () => {
        panel.classList.add('hidden');
        this.refresh();
      };
    };
    render();
    panel.classList.remove('hidden');
  }

  // 유닛 컬렉션 탭: 직업×등급 18종 스타업
  private collectionHtml(): string {
    let html = `<div class="d" style="color:#bbb;font-size:12px;margin-bottom:6px">${t('lab.hint')}</div>`;
    for (const job of JOBS) {
      html += `<div style="font-weight:700;margin:8px 0 4px">${jobName(job)}</div>`;
      for (const grade of GRADES) {
        const lv = collectionLevelOf(job, grade.key);
        const have = collectionCount(job, grade.key);
        const maxed = lv >= GACHA.maxLevel;
        const need = starUpCost(lv);
        const bonusNow = Math.round(lv * GACHA.bonusPerLevel * 100);
        const canUp = !maxed && have >= need;
        html += `<div class="row">
          <div class="info" style="display:flex;align-items:center;gap:8px">
            <div class="frame-sprite" style="width:34px;height:34px;flex:0 0 34px;background-image:url(sprites/${JOB_SPRITE[job]}_${grade.spriteIndex}.png)"></div>
            <div>
              <div class="t" style="color:${grade.color}">${gradeName(grade.key)} <span style="color:#ffd54f">★${lv}</span> <span style="color:#7ee87e;font-size:11px">${t('lab.atkBonus', { n: bonusNow })}</span></div>
              <div class="d">${maxed ? t('lab.ownedMax', { have }) : t('lab.owned', { have, need })}</div>
            </div>
          </div>
          <button data-star="${job}_${grade.key}" ${canUp ? '' : 'disabled'}>${maxed ? t('common.max') : t('lab.starUp')}</button>
        </div>`;
      }
    }
    return html;
  }

  private bindCollectionButtons(panel: HTMLElement, render: () => void): void {
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
          render();
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

  private bindQuestButtons(panel: HTMLElement, render: () => void): void {
    panel.querySelectorAll<HTMLButtonElement>('[data-daily]').forEach((b) => {
      b.onclick = () => {
        const key = b.dataset.daily as string;
        const q = DAILY_QUESTS.find((x) => x.key === key)!;
        const prog = meta.daily.progress[key] || 0;
        if (prog >= q.goal && !meta.daily.claimed[key]) {
          meta.daily.claimed[key] = true;
          meta.crystals += q.reward;
          saveMeta();
          render();
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
  private openShop(): void {
    const panel = $('shop-panel');
    const plat = getPlatform();
    const render = () => {
      const vx = plat.getVX();
      const owned = plat.isAdRemoved();
      const pkgs = CRYSTAL_PACKAGES.map((p, i) => `
        <div class="row">
          <div class="info">
            <div class="t"><span class="gem"></span> ${t('shop.gemPack', { n: p.crystals.toLocaleString() })}${p.bonus ? ` <span style="color:#7ee87e">+${p.bonus}%</span>` : ''}</div>
            <div class="d">VX ${p.vx}</div>
          </div>
          <button data-pkg="${i}" ${vx < p.vx ? 'disabled' : ''}>VX ${p.vx}</button>
        </div>`).join('');
      panel.innerHTML = `
        <div class="dialog">
          <h2>${t('shop.title')}</h2>
          <div class="shop-balance">
            <span class="crystal"><span class="gem"></span> ${meta.crystals.toLocaleString()}</span>
            <span class="vx-badge">VX ${vx.toLocaleString()}</span>
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
            <button id="buy-adremove" ${owned || vx < AD_REMOVE_VX ? 'disabled' : ''}>${owned ? t('shop.owned') : `VX ${AD_REMOVE_VX}`}</button>
          </div>
          <div class="d" style="color:#888;font-size:12px;margin-top:8px">
            ${t('shop.vxNote')}
          </div>
          <button class="close">${t('common.close')}</button>
        </div>`;

      // 보석 패키지 구매 (VX 차감 → 크리스탈 지급)
      panel.querySelectorAll<HTMLButtonElement>('[data-pkg]').forEach((b) => {
        b.onclick = async () => {
          const p = CRYSTAL_PACKAGES[Number(b.dataset.pkg)];
          if (await plat.spendVX(p.vx)) {
            meta.crystals += p.crystals;
            saveMeta();
            this.refresh();
            render();
          }
        };
      });

      // 유닛 가챠 (크리스탈 차감 → 컬렉션 적립)
      const g1 = panel.querySelector('#gacha-1') as HTMLButtonElement | null;
      const g10 = panel.querySelector('#gacha-10') as HTMLButtonElement | null;
      if (g1) g1.onclick = () => { if (this.pullGacha(1)) render(); };
      if (g10) g10.onclick = () => { if (this.pullGacha(10)) render(); };
      const probBtn = panel.querySelector('#btn-prob-info-shop') as HTMLButtonElement | null;
      if (probBtn) probBtn.onclick = () => openProbabilityPanel('gacha');

      // 광고제거 패키지 (VX 차감 → 소유 등록)
      const buy = panel.querySelector('#buy-adremove') as HTMLButtonElement | null;
      if (buy && !owned) buy.onclick = async () => {
        if (await plat.spendVX(AD_REMOVE_VX)) {
          await plat.purchaseAdRemoval();
          render();
        }
      };

      (panel.querySelector('.close') as HTMLElement).onclick = () => {
        panel.classList.add('hidden');
        this.refresh();
      };
    };
    render();
    panel.classList.remove('hidden');
  }

  // ---------- 유닛 가챠 ----------
  // 확률은 config.GACHA_GRADE_RATES (게임 내 20골드 소환과는 분리된 전용 표).
  // 천장 2종: ① 신화 이상이 GACHA.mythicPityCount 회 연속 안 나오면 다음 뽑기 신화 이상 확정
  //          ② 10연 뽑기는 전설 이상이 하나도 없으면 마지막 결과를 전설 이상으로 승급
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
    // 10연 보장: 전설 이상이 하나도 없으면 마지막 슬롯을 전설 이상으로 승급
    if (n >= 10 && !results.some((r) => GRADE_INDEX[r.grade] >= GRADE_INDEX['legendary'])) {
      const last = results[results.length - 1];
      last.grade = rollGachaLegendaryPlus();
      if (GRADE_INDEX[last.grade] >= GRADE_INDEX['mythic']) meta.gachaPity = 0;
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
