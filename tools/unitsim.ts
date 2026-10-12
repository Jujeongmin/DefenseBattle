// ============================================================
//  유닛별 전력 비교 - 한 직업만으로 덱을 짜서 같은 조건의 판을 돌린다.
//  스킬이 터지도록 정예(+전설) 유닛을 섞어 주고, 도달 웨이브·처치 수를 본다.
//  유닛끼리 너무 차이 나면(일반이 전설보다 세거나 한 유닛만 압도적) 수치를 고친다.
//  실행: npx tsx tools/unitsim.ts [판수=6]
// ============================================================
import { Game } from '../game/src/engine';
import { aiStep } from '../game/src/ai';
import { UNITS, RARITY_KR, PLAY_SPEED } from '../game/src/config';
import type { GradeKey } from '../game/src/types';

const runs = Number(process.argv[2]) || 6;
const mix: GradeKey[] = ['elite', 'elite', 'elite', 'legendary', 'rare', 'rare', 'common', 'common', 'common', 'common'];

function run(job: (typeof UNITS)[number]['id']): { wave: number; kills: number } {
  // 같은 직업 2종 덱이 안 되므로 '그 직업 + 궁수' 대신 그 직업만 (소환은 덱에서만 나온다)
  const g = new Game({ track: false, useResearch: false, deck: [job], waves: 0, hpMult: Number(process.env.HPM) || 1.2 });
  g.scriptSummons(mix.map((grade) => ({ job, grade })));
  let t = 0, act = 0;
  while (!g.over && t < 60 * 12) {
    g.update(0.05); t += 0.05; act += 0.05;
    if (act >= 0.7 * PLAY_SPEED) { act = 0; aiStep(g, 0.5); }
  }
  return { wave: g.wave, kills: g.kills };
}

console.log(`유닛별 (각 ${runs}판, 무한 모드 체력 x1.2, 12분 제한) - 도달 웨이브 평균`);
const rows = UNITS.map((u) => {
  let w = 0, k = 0;
  for (let i = 0; i < runs; i++) { const r = run(u.id); w += r.wave; k += r.kills; }
  return { u, w: w / runs, k: k / runs };
});
const avg = rows.reduce((s, r) => s + r.w, 0) / rows.length;
for (const r of rows.sort((a, b) => b.w - a.w)) {
  const flag = r.w > avg * 1.15 ? '  ▲ 강함' : r.w < avg * 0.85 ? '  ▼ 약함' : '';
  console.log(`${r.u.kr.padEnd(7)} ${RARITY_KR[r.u.rarity]}  wave ${r.w.toFixed(1).padStart(5)}  kills ${Math.round(r.k)}${flag}`);
}
console.log(`평균 wave ${avg.toFixed(1)}`);
