// ============================================================
//  통합 진행 시뮬레이터 - 한 플레이어가 대전과 캠페인을 같이 하며 보석으로 연구·유닛 강화를 산다.
//  유닛 해금이 어디서(트로피 로드 / 스테이지) 언제 오는지, 대전 승률이 시간에 따라 어떻게 변하는지,
//  캠페인을 같이 하면 대전만 할 때보다 얼마나 빨라지는지 본다.
//  실행: npx tsx tools/progsim.ts [모드=both|pvp] [실력=0.35] [시간=8]
//    both: 캠페인과 대전을 번갈아 (캠페인이 막히면 대전 3판 뒤 다시 도전)   pvp: 대전만
//  빠진 것: 일일 퀘스트·업적·시즌 패스 보석 (실제로는 조금 더 빠르다)
// ============================================================
import { Game } from '../game/src/engine';
import { meta } from '../game/src/meta';
import { aiStep, thinkInterval } from '../game/src/ai';
import { botSkill, botDeck, botAttackDeck, botAtkMult, botLevel } from '../game/src/pvp';
import {
  PVP, PLAY_SPEED, UNITS, STAGES, RESEARCH, trophyChange, researchCost, unitUpgradeCost, UNIT_MAX_LEVEL, DECK_SIZE, starsFor,
} from '../game/src/config';
import { nextStageId, stageStars, stageOptions, unitLevels, canUpgradeUnit } from '../game/src/progress';
import { chestState, opening } from '../game/src/chests';
import * as R from '../game/src/econ/rules';
const E = () => meta as unknown as R.Econ;
const C = (): R.Ctx => ({ now: Date.now(), rng: Math.random });
import type { BoardSnapshot } from '../game/src/engine';
import type { Job } from '../game/src/types';

const mode = (process.argv[2] || 'both') as 'both' | 'pvp';
const skill = Number(process.argv[3]) || 0.35;
const hours = Number(process.argv[4]) || 8;
const OVERHEAD = 20; // 판마다 로비·매칭·결과 화면 (초)
const HUMAN_THINK = 0.7; // 사람 손: 0.7초마다 한 번 판단

// ---- 새 계정 ----
meta.crystals = 0;
meta.units = { archer: 1, wizard: 1, warrior: 1 };
meta.deck = ['archer', 'wizard', 'warrior'];
meta.stages = { '1-1': 3 }; // 튜토리얼은 끝낸 상태에서 시작
meta.roadClaimed = [];
meta.pvp = { trophies: 0, wins: 0, losses: 0, streak: 0, lossStreak: 0 };
for (const r of RESEARCH) meta.research[r.key] = 0;

let clock = 0; // 실시간(초)
// 상자 시간은 Date.now() 를 쓰므로 시뮬레이션 시계로 바꾼다
const T0 = Date.now();
Date.now = () => T0 + clock * 1000;
meta.cards = {};
meta.chests = [{ kind: 'wood' }, null, null, null];
meta.chestCycle = 0;
const GACHA_RESERVE = 400; // 이만큼 넘는 보석은 뽑기에 쓴다 (사람처럼)
const log: string[] = [];
const at = () => `${(clock / 3600).toFixed(1)}h`;
const unlockedBefore = new Set(Object.keys(meta.units));
function noteUnlocks(src: string): void {
  for (const j of Object.keys(meta.units)) if (!unlockedBefore.has(j)) { unlockedBefore.add(j); log.push(`${at()}  유닛 ${j} 해금 (${src})`); }
}
/** 덱: 해금된 유닛 중 레벨 높은 순 4종 */
function chooseDeck(): Job[] {
  const owned = UNITS.map((u) => u.id).filter((j) => meta.units[j]);
  return owned.sort((a, b) => (meta.units[b] ?? 0) - (meta.units[a] ?? 0)).slice(0, DECK_SIZE);
}
/** 상자: 다 된 건 열고, 여는 중이 없으면 하나 열기 시작 */
function tendChests(): void {
  for (let i = 0; i < meta.chests.length; i++) if (chestState(i) === 'ready') R.openSlot(E(), i, false, C());
  if (opening() < 0) { const i = meta.chests.findIndex((c) => c && !c.openAt); if (i >= 0) R.startUnlock(E(), i, C()); }
}
/** 보석 쓰기: 연구·덱 유닛 강화 중 가장 싼 것부터 */
function spend(): void {
  for (;;) {
    const opts: { cost: number; buy: () => void }[] = [];
    if (mode === 'both') for (const r of RESEARCH) {
      const lv = meta.research[r.key] ?? 0;
      if (lv < r.max) opts.push({ cost: researchCost(lv), buy: () => { meta.research[r.key] = lv + 1; } });
    }
    for (const j of meta.deck) {
      const lv = meta.units[j] ?? 0;
      if (canUpgradeUnit(j)) opts.push({ cost: unitUpgradeCost(lv), buy: () => { meta.crystals += unitUpgradeCost(lv); R.upgradeUnit(E(), j); } });
    }
    const pick = opts.filter((o) => o.cost <= meta.crystals).sort((a, b) => a.cost - b.cost)[0];
    if (!pick) break;
    meta.crystals -= pick.cost;
    pick.buy();
  }
  while (meta.crystals >= GACHA_RESERVE + 100) R.gacha(E(), 1, C());
}

/** 캠페인 한 판 (사람 손 속도) */
function playStage(id: string): boolean {
  meta.deck = chooseDeck();
  const g = new Game({ ...stageOptions(id, false), track: false });
  let t = 0, act = 0;
  while (!g.over && t < 60 * 60) {
    g.update(0.05); t += 0.05; act += 0.05;
    if (act >= HUMAN_THINK * PLAY_SPEED) { act = 0; aiStep(g, skill); }
  }
  clock += t / PLAY_SPEED + OVERHEAD;
  R.stageEnd(E(), id, g.cleared, g.cleared ? starsFor(g.peakMobs) : 0, g.wave, C());
  noteUnlocks(`스테이지 ${id}`);
  return g.cleared;
}

/** 대전 한 판 */
function playPvp(): boolean {
  meta.deck = chooseDeck();
  const seed = Math.floor(Math.random() * 2 ** 31);
  const sk = botSkill();
  const bDeck = botDeck(meta.pvp.trophies);
  const lv = unitLevels();
  const avg = botLevel();
  const a = new Game({ mode: 'pvp', seed, useResearch: false, track: false, deck: [...meta.deck], attackDeck: [...meta.attackDeck], unitLevels: lv });
  const b = new Game({ mode: 'pvp', seed, useResearch: false, track: false, deck: bDeck, atkMult: botAtkMult(sk, meta.pvp.trophies),
    attackDeck: botAttackDeck(meta.pvp.trophies), unitLevels: Object.fromEntries(bDeck.map((j) => [j, avg])) });
  a.on('attack', (p) => b.receiveAttack(p));
  b.on('attack', (p) => a.receiveAttack(p));
  let sa: BoardSnapshot | null = null, sb: BoardSnapshot | null = null;
  let t = 0, actA = 0, actB = 0, snap = 0;
  while (!a.over && !b.over && t < 60 * 30) {
    a.update(0.05); b.update(0.05); t += 0.05; snap += 0.05; actA += 0.05; actB += 0.05;
    if (snap >= PVP.reportInterval * PLAY_SPEED) { snap = 0; sa = a.snapshot(); sb = b.snapshot(); }
    if (actA >= HUMAN_THINK * PLAY_SPEED) { actA = 0; aiStep(a, skill, sb); }
    if (actB >= thinkInterval(sk) * PLAY_SPEED) { actB = 0; aiStep(b, sk, sa); }
  }
  const won = b.over && !a.over ? true : a.over && !b.over ? false : a.mobs.length < b.mobs.length;
  clock += t / PLAY_SPEED + OVERHEAD;
  const p = meta.pvp;
  p.trophies += trophyChange(p.trophies, p.streak, won);
  if (won) { p.wins++; p.streak++; p.lossStreak = 0; }
  else { p.losses++; p.streak = 0; p.lossStreak = (p.lossStreak ?? 0) + 1; }
  R.pvpReward(E(), won, C()); // 보석·시즌 XP·승리 상자·트로피 로드 (서버와 같은 규칙)
  noteUnlocks(`트로피 ${p.trophies}`);
  return won;
}

// ---- 진행 ----
const hourly: { w: number; l: number }[] = [];
const marks = [300, 550, 850, 1200, 1500, 2000];
let failStreak = 0, pvpDebt = 0;
let chapterDone = 0;
while (clock < hours * 3600) {
  const campaignLeft = mode === 'both' && STAGES.some((s) => stageStars(s.id) === 0);
  if (campaignLeft && pvpDebt === 0) {
    const id = nextStageId();
    const ok = playStage(id);
    if (ok) {
      failStreak = 0;
      const ch = Math.max(0, ...STAGES.filter((s) => stageStars(s.id) > 0).map((s) => s.chapter));
      const full = STAGES.filter((s) => s.chapter === ch).every((s) => stageStars(s.id) > 0);
      if (full && ch > chapterDone) { chapterDone = ch; log.push(`${at()}  캠페인 챕터 ${ch} 완료`); }
      if (!STAGES.some((s) => stageStars(s.id) === 0)) log.push(`${at()}  캠페인 전부 클리어`);
    } else if (++failStreak >= 2) { pvpDebt = 3; failStreak = 0; } // 막히면 대전으로 보석 모아 오기
    pvpDebt = Math.max(0, pvpDebt); // 스테이지 뒤엔 대전 한 판
    if (pvpDebt === 0) pvpDebt = 1;
  } else {
    const before = meta.pvp.trophies;
    const won = playPvp();
    const h = Math.floor(clock / 3600);
    (hourly[h] ??= { w: 0, l: 0 })[won ? 'w' : 'l']++;
    while (marks.length && meta.pvp.trophies >= marks[0] && before < marks[0] + 1) log.push(`${at()}  트로피 ${marks.shift()} 도달`);
    pvpDebt = Math.max(0, pvpDebt - 1);
  }
  tendChests();
  spend();
}

const res = RESEARCH.map((r) => `${r.key} ${meta.research[r.key]}`).join(', ');
console.log(`\n=== ${mode === 'both' ? '캠페인 + 대전' : '대전만'} · 실력 ${skill} · ${hours}시간 ===`);
console.log(log.join('\n'));
console.log(`\n시간별 대전 승률: ${hourly.map((x, i) => `${i}h ${x ? Math.round((x.w / (x.w + x.l)) * 100) : '-'}%(${x ? x.w + x.l : 0}판)`).join('  ')}`);
console.log(`끝: 트로피 ${meta.pvp.trophies} · ${meta.pvp.wins}승 ${meta.pvp.losses}패 · 캠페인 ${STAGES.filter((s) => stageStars(s.id) > 0).length}/30 · 보석 ${meta.crystals}`);
console.log(`유닛 레벨: ${Object.entries(meta.units).map(([j, l]) => `${j} ${l}`).join(', ')}`);
console.log(`연구: ${res}`);
console.log(`덱: ${meta.deck.join(', ')} · 해금 유닛 ${Object.keys(meta.units).length}/${UNITS.length}`);
