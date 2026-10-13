// ============================================================
//  덱 크기 밸런스 - 한 유닛만 넣은 덱(그 유닛만 소환·합성)이 4유닛 덱보다 유리하지 않은지.
//  무한 모드에서 같은 AI 로 돌려 도달 웨이브를 비교한다. 덱 빈 칸 페널티(ECONOMY.deckGapPenalty)를 바꿔 가며 본다.
//  실행: npx tsx tools/decksim.ts [판수=8]
// ============================================================
import { Game } from '../game/src/engine';
import { aiStep } from '../game/src/ai';
import { ECONOMY, PLAY_SPEED } from '../game/src/config';
import type { Job } from '../game/src/types';

const runs = Number(process.argv[2]) || 8;
const FULL: Job[] = ['archer', 'wizard', 'warrior', 'ranger'];

function run(deck: Job[], seed: number): number {
  const g = new Game({ track: false, useResearch: false, deck, deckMin: 4, waves: 0, seed } as never);
  let t = 0, act = 0;
  while (!g.over && t < 60 * 15) {
    g.update(0.05); t += 0.05; act += 0.05;
    if (act >= 0.6 * PLAY_SPEED) { act = 0; aiStep(g, 0.6); }
  }
  return g.wave;
}

const avg = (deck: Job[]) => {
  let w = 0;
  for (let i = 0; i < runs; i++) w += run(deck, 1000 + i);
  return w / runs;
};

console.log(`무한 모드 도달 웨이브 평균 (각 ${runs}판, AI 실력 0.6)`);
for (const pen of [0, 0.5, 1, 1.5]) {
  (ECONOMY as { deckGapPenalty: number }).deckGapPenalty = pen;
  const full = avg(FULL);
  const rows = (['archer', 'wizard', 'warrior', 'ranger'] as Job[]).map((j) => `${j} ${avg([j]).toFixed(1)}`);
  const two = avg(['archer', 'wizard']);
  console.log(`페널티 ${pen}: 4유닛 ${full.toFixed(1)} | 2유닛 ${two.toFixed(1)} | 1유닛 ${rows.join(' · ')}`);
}
