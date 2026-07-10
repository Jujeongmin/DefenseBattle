// ============================================================
//  메인 화면 - 게임시작 / 상점 / 연구소 (게임 밖 메타 화면)
// ============================================================
import {
  RESEARCH, researchCost, DAILY_QUESTS, ACHIEVEMENTS,
  CRYSTAL_PACKAGES, AD_REMOVE_VX,
} from './config';
import { meta, saveMeta, researchLevel } from './meta';
import { getPlatform } from './platform';
import { audio } from './audio';
import type { AchievementDef, ResearchKey } from './types';

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
    let tab: 'research' | 'quest' = 'research';
    const render = () => {
      let body = '';
      if (tab === 'research') {
        body = RESEARCH.map((r) => {
          const lv = researchLevel(r.key);
          const maxed = lv >= r.max;
          const cost = researchCost(lv);
          return `<div class="row">
            <div class="info"><div class="t">${r.kr} <span style="color:#6fd1ff">Lv.${lv}/${r.max}</span></div>
            <div class="d">${r.desc}</div></div>
            <button data-res="${r.key}" ${maxed || meta.crystals < cost ? 'disabled' : ''}>
              ${maxed ? 'MAX' : `💎 ${cost}`}</button></div>`;
        }).join('');
      } else {
        body = this.questHtml();
      }
      panel.innerHTML = `
        <div class="dialog">
          <h2>연구소 <span class="crystal">💎 ${meta.crystals}</span></h2>
          <div class="tab-row">
            <button data-tab="research" class="${tab === 'research' ? 'active' : ''}">연구</button>
            <button data-tab="quest" class="${tab === 'quest' ? 'active' : ''}">퀘스트</button>
          </div>
          ${body}
          <button class="close">닫기</button>
        </div>`;
      panel.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((b) => {
        b.onclick = () => { tab = b.dataset.tab as 'research' | 'quest'; render(); };
      });
      panel.querySelectorAll<HTMLButtonElement>('[data-res]').forEach((b) => {
        b.onclick = () => {
          const key = b.dataset.res as ResearchKey;
          const lv = researchLevel(key);
          const r = RESEARCH.find((x) => x.key === key)!;
          const cost = researchCost(lv);
          if (lv < r.max && meta.crystals >= cost) {
            meta.crystals -= cost;
            meta.research[key] = lv + 1;
            saveMeta();
            render();
          }
        };
      });
      this.bindQuestButtons(panel, render);
      (panel.querySelector('.close') as HTMLElement).onclick = () => {
        panel.classList.add('hidden');
        this.refresh();
      };
    };
    render();
    panel.classList.remove('hidden');
  }

  private questHtml(): string {
    const daily = DAILY_QUESTS.map((q) => {
      const prog = Math.min(q.goal, meta.daily.progress[q.key] || 0);
      const done = prog >= q.goal;
      const claimed = meta.daily.claimed[q.key];
      return `<div class="row">
        <div class="info"><div class="t">${q.kr}</div><div class="d">${prog}/${q.goal}</div></div>
        <button data-daily="${q.key}" ${!done || claimed ? 'disabled' : ''}>${claimed ? '완료' : done ? `💎 ${q.reward}` : '진행중'}</button></div>`;
    }).join('');
    const ach = ACHIEVEMENTS.map((a: AchievementDef) => {
      const done = meta.achievements[a.key];
      return `<div class="row">
        <div class="info"><div class="t">${a.kr}</div><div class="d">보상 💎 ${a.reward}</div></div>
        <button disabled>${done ? '달성 ✓' : '미달성'}</button></div>`;
    }).join('');
    return `<div style="font-weight:700;margin:4px 0 6px">일일 퀘스트</div>${daily}
            <div style="font-weight:700;margin:10px 0 6px">업적</div>${ach}`;
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
            <div class="t">💎 보석 ${p.crystals.toLocaleString()}개${p.bonus ? ` <span style="color:#7ee87e">+${p.bonus}%</span>` : ''}</div>
            <div class="d">VX ${p.vx}</div>
          </div>
          <button data-pkg="${i}" ${vx < p.vx ? 'disabled' : ''}>VX ${p.vx}</button>
        </div>`).join('');
      panel.innerHTML = `
        <div class="dialog">
          <h2>상점</h2>
          <div class="shop-balance">
            <span class="crystal">💎 ${meta.crystals.toLocaleString()}</span>
            <span class="vx-badge">VX ${vx.toLocaleString()}</span>
          </div>
          <div class="shop-section">보석 구매</div>
          ${pkgs}
          <div class="shop-section">패키지</div>
          <div class="row">
            <div class="info">
              <div class="t">광고 제거 패키지</div>
              <div class="d">광고 제거 + 3배속 해금 · VX ${AD_REMOVE_VX}</div>
            </div>
            <button id="buy-adremove" ${owned || vx < AD_REMOVE_VX ? 'disabled' : ''}>${owned ? '보유 중 ✓' : `VX ${AD_REMOVE_VX}`}</button>
          </div>
          <div class="d" style="color:#888;font-size:12px;margin-top:8px">
            * VX 충전(실제 결제)은 Verse8 연동 시 활성화됩니다. 현재는 데모 잔액입니다.
          </div>
          <button class="close">닫기</button>
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
}
