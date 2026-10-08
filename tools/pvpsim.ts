// ============================================================
//  PvP 시뮬레이터 - 플레이어(고정 실력) 대 봇(트로피 따라 강해짐) 경기를 엔진만으로 돌린다.
//  한 판 길이, 트로피 구간별 승률, 트로피 로드를 끝까지 가는 데 걸리는 판 수/시간을 잰다.
//  실행: npx tsx tools/pvpsim.ts [판수=12] [플레이어실력=0.55]
// ============================================================
import { Game } from '../game/src/engine';
import { meta } from '../game/src/meta';
import { aiStep, thinkInterval } from '../game/src/ai';
import { botSkill } from '../game/src/pvp';
import { PVP, PLAY_SPEED, TROPHY_ROAD } from '../game/src/config';
if (process.env.PVP_HPM) (PVP as { hpMult: number }).hpMult = Number(process.env.PVP_HPM);
import type { BoardSnapshot } from '../game/src/engine';
import type { Job } from '../game/src/types';

const W = (await import('../game/src/config')).WAVE as { pvpHpGrowth: number };
if (process.env.PVP_HPG) W.pvpHpGrowth = Number(process.env.PVP_HPG);
const DECK: Job[] = ['archer', 'wizard', 'warrior', 'ranger'];
const ALL: Job[] = ['archer', 'wizard', 'warrior', 'ranger', 'frost', 'paladin', 'bomber', 'assassin'];

/** 한 판: 플레이어가 이겼는지, 실시간 길이(초) */
function match(playerSkill: number, bot: number, levels = 1): { won: boolean; sec: number } {
  const seed = Math.floor(Math.random() * 2 ** 31);
  const botDeck = [...ALL].sort(() => Math.random() - 0.5).slice(0, 4);
  const a = new Game({ mode: 'pvp', seed, useResearch: false, track: false, deck: DECK, unitLevels: Object.fromEntries(DECK.map((j) => [j, levels])) });
  const b = new Game({ mode: 'pvp', seed, useResearch: false, track: false, deck: botDeck, unitLevels: Object.fromEntries(botDeck.map((j) => [j, levels])) });
  a.on('attack', (p) => b.receiveAttack(p));
  b.on('attack', (p) => a.receiveAttack(p));
  let snapA: BoardSnapshot | null = null, snapB: BoardSnapshot | null = null;
  let t = 0, actA = 0, actB = 0, snap = 0;
  while (!a.over && !b.over && t < 60 * 30) {
    a.update(0.05); b.update(0.05); t += 0.05; snap += 0.05;
    if (snap >= PVP.reportInterval * PLAY_SPEED) { snap = 0; snapA = a.snapshot(); snapB = b.snapshot(); }
    // 판단 간격은 실시간 기준 (게임 시간 = 실시간 x PLAY_SPEED). 플레이어는 사람 손 속도(0.7초)
    actA += 0.05; actB += 0.05;
    if (actA >= 0.7 * PLAY_SPEED) { actA = 0; aiStep(a, playerSkill, snapB); }
    if (actB >= thinkInterval(bot) * PLAY_SPEED) { actB = 0; aiStep(b, bot, snapA); }
  }
  const won = b.over && !a.over ? true : a.over && !b.over ? false : a.mobs.length < b.mobs.length;
  return { won, sec: t / PLAY_SPEED };
}

const runs = Number(process.argv[2]) || 12;
const player = Number(process.argv[3]) || 0.55;

// 1) 트로피 구간별 승률 / 한 판 길이 (연승·연패 보정 없이)
console.log(`\n=== 플레이어 실력 ${player} vs 봇 (트로피별, 각 ${runs}판) ===`);
console.log('trophies  botSkill  win%   avgMin');
for (const tr of [0, 200, 400, 700, 1000, 1500, 2000]) {
  meta.pvp = { trophies: tr, wins: 0, losses: 0, streak: 0, lossStreak: 0 };
  const sk = botSkill();
  let w = 0, sec = 0;
  for (let i = 0; i < runs; i++) { const r = match(player, sk); if (r.won) w++; sec += r.sec; }
  console.log(String(tr).padStart(8), sk.toFixed(2).padStart(9), `${Math.round((w / runs) * 100)}%`.padStart(6), (sec / runs / 60).toFixed(1).padStart(8));
}

// 2) 실제 진행: 연승/연패 보정 포함, 트로피 로드 지점까지 걸리는 판 수와 시간
console.log(`\n=== 트로피 로드 진행 (실력 ${player}, 연승·연패 보정 포함) ===`);
meta.pvp = { trophies: 0, wins: 0, losses: 0, streak: 0, lossStreak: 0 };
let totalSec = 0;
const marks = TROPHY_ROAD.filter((s) => s.unit).map((s) => s.at).concat(TROPHY_ROAD[TROPHY_ROAD.length - 1].at);
const reached: string[] = [];
for (let n = 1; n <= 400 && marks.length; n++) {
  const r = match(player, botSkill());
  totalSec += r.sec + 20; // 매칭·결과 화면 20초
  const p = meta.pvp;
  if (r.won) { p.trophies += PVP.trophyWin + Math.min(10, p.streak * 2); p.wins++; p.streak++; p.lossStreak = 0; }
  else { p.trophies -= Math.min(PVP.trophyLoss, p.trophies); p.losses++; p.streak = 0; p.lossStreak = (p.lossStreak ?? 0) + 1; }
  while (marks.length && p.trophies >= marks[0]) reached.push(`${marks.shift()}트로피: ${n}판 ${(totalSec / 3600).toFixed(1)}시간`);
}
console.log(reached.join('\n'));
console.log(`승률 ${Math.round((meta.pvp.wins / (meta.pvp.wins + meta.pvp.losses)) * 100)}%`);
