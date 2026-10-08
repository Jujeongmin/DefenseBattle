// ============================================================
//  몹 카드 밸런스 - 봇이 카드 한 종만 쓸 때 플레이어(기본 덱, 기본 카드) 상대 승률·판 길이.
//  카드 하나가 너무 세거나(봇 승률↑, 판 짧음) 너무 약하면(아무도 안 씀) 수치를 고친다.
//  실행: npx tsx tools/cardsim.ts [판수=12] [트로피=300]
// ============================================================
import { Game } from '../game/src/engine';
import { meta } from '../game/src/meta';
import { aiStep, thinkInterval } from '../game/src/ai';
import { botSkill, botDeck, botAtkMult } from '../game/src/pvp';
import { PVP, PLAY_SPEED, ATTACKS, STARTER_ATTACKS } from '../game/src/config';
import type { BoardSnapshot } from '../game/src/engine';
import type { Job } from '../game/src/types';

const DECK: Job[] = ['archer', 'wizard', 'warrior', 'ranger'];
const runs = Number(process.argv[2]) || 12;
const trophies = Number(process.argv[3]) || 300;
meta.pvp = { trophies, wins: 10, losses: 10, streak: 0, lossStreak: 0 };
const skill = botSkill();

function match(card: (typeof ATTACKS)[number]['key']): { botWon: boolean; sec: number; sent: number } {
  const seed = Math.floor(Math.random() * 2 ** 31);
  const bDeck = botDeck(trophies);
  const a = new Game({ mode: 'pvp', seed, useResearch: false, track: false, deck: DECK, attackDeck: [...STARTER_ATTACKS] });
  const b = new Game({ mode: 'pvp', seed, useResearch: false, track: false, deck: bDeck, attackDeck: [card], atkMult: botAtkMult(skill) });
  a.on('attack', (p) => b.receiveAttack(p));
  b.on('attack', (p) => a.receiveAttack(p));
  let snapA: BoardSnapshot | null = null, snapB: BoardSnapshot | null = null;
  let t = 0, actA = 0, actB = 0, snap = 0;
  while (!a.over && !b.over && t < 60 * 30) {
    a.update(0.05); b.update(0.05); t += 0.05; snap += 0.05;
    if (snap >= PVP.reportInterval * PLAY_SPEED) { snap = 0; snapA = a.snapshot(); snapB = b.snapshot(); }
    actA += 0.05; actB += 0.05;
    if (actA >= 0.7 * PLAY_SPEED) { actA = 0; aiStep(a, skill, snapB); }
    if (actB >= thinkInterval(skill) * PLAY_SPEED) { actB = 0; aiStep(b, skill, snapA); }
  }
  const botWon = a.over && !b.over ? true : b.over && !a.over ? false : b.mobs.length < a.mobs.length;
  return { botWon, sec: t / PLAY_SPEED, sent: b.sentCount };
}

console.log(`봇 카드 한 종만 vs 기본 카드 4종 (둘 다 실력 ${skill.toFixed(2)}, 트로피 ${trophies}, 각 ${runs}판)`);
console.log('card        cost  botWin%  avgMin  throws');
for (const c of ATTACKS) {
  let w = 0, sec = 0, sent = 0;
  for (let i = 0; i < runs; i++) { const r = match(c.key); if (r.botWon) w++; sec += r.sec; sent += r.sent; }
  console.log(c.key.padEnd(10), String(c.cost).padStart(5), `${Math.round((w / runs) * 100)}%`.padStart(8), (sec / runs / 60).toFixed(1).padStart(7), (sent / runs).toFixed(1).padStart(7));
}
