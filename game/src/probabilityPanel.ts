// ============================================================
//  확률 정보 고지 패널 (확률형 아이템 확률 표시 의무 대응)
//  - 유닛 소환(게임 내 20골드)과 유닛 가챠(상점, 크리스탈) 양쪽에서 공용으로 사용.
//  - 표시 값은 실제 추첨 로직(rollGrade)과 동일한 단일 소스(config.gradeProbabilities)에서 계산.
// ============================================================
import { GRADE_BY_KEY, JOB_KR, JOBS, JOB_PROBABILITY_PCT, gradeProbabilities } from './config';
import { researchLevel } from './meta';

const $ = <T extends HTMLElement = HTMLElement>(id: string): T =>
  document.getElementById(id) as T;

function fmtPct(p: number): string {
  // 소수점 필요한 경우만 표시 (0.4%, 0.1% 등은 소수 첫째자리까지)
  return (Math.round(p * 10) / 10).toString();
}

export function openProbabilityPanel(): void {
  const panel = $('prob-panel');
  const rareBonus = researchLevel('rare') * 0.5;
  const rates = gradeProbabilities(rareBonus);

  const gradeRows = rates.map((r) => {
    const g = GRADE_BY_KEY[r.key];
    return `<div class="row">
      <div class="info"><div class="t" style="color:${g.color}">${g.kr}</div></div>
      <div class="prob-pct">${fmtPct(r.pct)}%</div>
    </div>`;
  }).join('');

  const jobRows = JOBS.map((j) => `
    <div class="row">
      <div class="info"><div class="t">${JOB_KR[j]}</div></div>
      <div class="prob-pct">${fmtPct(JOB_PROBABILITY_PCT)}%</div>
    </div>`).join('');

  panel.innerHTML = `
    <div class="dialog">
      <h2>확률 정보</h2>
      <div class="d" style="color:#bbb;font-size:12px;margin-bottom:10px">
        유닛 소환/가챠 시 아래 확률로 등급과 직업이 각각 독립적으로 결정됩니다.
        등급과 직업 확률을 곱하면 특정 유닛(예: 궁수+전설) 1종이 나올 확률입니다.
      </div>
      <div style="font-weight:700;margin:4px 0 6px">등급 확률</div>
      ${gradeRows}
      <div style="font-weight:700;margin:12px 0 6px">직업 확률 (균등)</div>
      ${jobRows}
      <div class="d" style="color:#888;font-size:11px;margin-top:10px;line-height:1.5">
        * 10연 뽑기는 1회 뽑기를 10번 독립 시행한 것과 동일하며, 등급 보장(천장)은 없습니다.<br>
        * 실제 결제(VX)는 보석(크리스탈) 구매에만 사용되며, 뽑기 확률에 직접 영향을 주지 않습니다.
      </div>
      <button class="close">닫기</button>
    </div>`;
  (panel.querySelector('.close') as HTMLElement).onclick = () => panel.classList.add('hidden');
  panel.classList.remove('hidden');
}
