// ============================================================
//  확률 정보 고지 패널 (확률형 아이템 확률 표시 의무 대응)
//  - 유닛 소환(게임 내 20골드)과 유닛 가챠(상점, 크리스탈)는 확률표가 서로 달라
//    source 인자로 분기해 각각의 실제 추첨 로직과 동일한 단일 소스에서 값을 계산한다.
//    (summon: config.gradeProbabilities / gacha: config.gachaGradeProbabilities)
// ============================================================
import {
  GRADE_BY_KEY, JOBS, JOB_PROBABILITY_PCT,
  gradeProbabilities, gachaGradeProbabilities,
} from './config';
import { researchLevel, gachaPityCount, gachaPityRemaining } from './meta';
import { t, jobName, gradeName } from './i18n';
import { GACHA } from './config';

const $ = <T extends HTMLElement = HTMLElement>(id: string): T =>
  document.getElementById(id) as T;

function fmtPct(p: number): string {
  return (Math.round(p * 10) / 10).toString();
}

export type ProbabilitySource = 'summon' | 'gacha';

export function openProbabilityPanel(source: ProbabilitySource = 'summon'): void {
  const panel = $('prob-panel');
  const gacha = source === 'gacha';
  const rates = gacha ? gachaGradeProbabilities() : gradeProbabilities(researchLevel('rare') * 0.5);

  const gradeRows = rates.map((r) => {
    const g = GRADE_BY_KEY[r.key];
    return `<div class="row">
      <div class="info"><div class="t" style="color:${g.color}">${gradeName(r.key)}</div></div>
      <div class="prob-pct">${fmtPct(r.pct)}%</div>
    </div>`;
  }).join('');

  const jobRows = JOBS.map((j) => `
    <div class="row">
      <div class="info"><div class="t">${jobName(j)}</div></div>
      <div class="prob-pct">${fmtPct(JOB_PROBABILITY_PCT)}%</div>
    </div>`).join('');

  const footer = gacha
    ? t('prob.footerGacha', { pity: GACHA.mythicPityCount, cur: gachaPityCount(), rem: gachaPityRemaining() })
    : t('prob.footerSummon');

  panel.innerHTML = `
    <div class="dialog">
      <h2>${gacha ? t('prob.titleGacha') : t('prob.titleSummon')}</h2>
      <div class="d" style="color:#bbb;font-size:12px;margin-bottom:10px">
        ${gacha ? t('prob.introGacha') : t('prob.introSummon')}
      </div>
      <div style="font-weight:700;margin:4px 0 6px">${t('prob.gradeHeader')}</div>
      ${gradeRows}
      <div style="font-weight:700;margin:12px 0 6px">${t('prob.jobHeader')}</div>
      ${jobRows}
      <div class="d" style="color:#888;font-size:11px;margin-top:10px;line-height:1.5">
        ${footer}
      </div>
      <button class="close">${t('common.close')}</button>
    </div>`;
  (panel.querySelector('.close') as HTMLElement).onclick = () => panel.classList.add('hidden');
  panel.classList.remove('hidden');
}
