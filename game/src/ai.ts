// ============================================================
//  AI 플레이어 - PvP 연습 상대(봇)가 사용하는 자동 플레이 정책
//  skill(0~1): 높을수록 판단이 빠르고 합성/강화/몹 보내기를 잘 활용
// ============================================================
import { GRADE_INDEX, ECONOMY, PVP, JOBS } from './config';
import { MAP, SEG_ZONE, type Game, type BoardSnapshot } from './engine';
import type { AttackPayload, Job } from './types';

// 카드별 카운터 직업 - 상대 덱에 이 직업이 없으면 그 카드가 잘 통한다
const COUNTERS: Job[][] = [['wizard', 'bomber'], ['frost', 'warrior'], ['assassin', 'paladin'], []];

/** 상대 스냅샷에서 구역(0=상 1=우 2=하 3=좌)별 전력 (등급이 높을수록 크게) */
function zonePower(opp: BoardSnapshot): number[] {
  const power = [0, 0, 0, 0];
  const c = MAP.size / 2;
  for (let i = 0; i + 3 < opp.units.length; i += 4) {
    const dx = (opp.units[i + 2] / 255) * MAP.size - c, dy = (opp.units[i + 3] / 255) * MAP.size - c;
    const zone = Math.abs(dy) > Math.abs(dx) ? (dy < 0 ? 0 : 2) : (dx > 0 ? 1 : 3);
    power[zone] += Math.pow(3, opp.units[i + 1]);
  }
  return power;
}

/** 던질 카드와 위치 고르기: 카운터가 없는 카드 우선, 가장 약한 구역 앞 길 시작점 */
export function pickThrow(game: Game, opp: BoardSnapshot | null, skill: number): { tier: AttackPayload['tier']; pos: number } | null {
  const affordable = PVP.attacks.map((_, i) => i as AttackPayload['tier'])
    .filter((t) => game.gold >= game.attackCost(t) && game.attackCooldown(t) <= 0);
  if (!affordable.length) return null;
  const jobs = new Set<Job>();
  if (opp) for (let i = 0; i + 3 < opp.units.length; i += 4) { const j = JOBS[opp.units[i]]; if (j) jobs.add(j); }
  const score = (t: AttackPayload['tier']) => {
    const open = COUNTERS[t].every((j) => !jobs.has(j)) ? 1 : 0;
    return open * 2 + PVP.attacks[t].cost / 200 + Math.random() * (1.2 - skill);
  };
  const tier = affordable.sort((a, b) => score(b) - score(a))[0];
  let pos = Math.random();
  if (opp && Math.random() < 0.3 + skill * 0.6) {
    const power = zonePower(opp);
    const seg = [0, 1, 2, 3].sort((a, b) => power[SEG_ZONE[a]] - power[SEG_ZONE[b]])[0];
    pos = (seg + 0.05) / 4;
  }
  return { tier, pos };
}

/** 한 번 판단하는 간격(실시간 초) - 사람 손 속도에 맞춘다 (사람 손 속도).
 *  (실력 0.3 ≈ 0.6초, 0.75 ≈ 0.44초) 예전엔 게임 시간 0.35초(= 2배속에서 실시간 0.175초)마다 판단해 사람보다 훨씬 빨리 진형을 갖췄다. */
export function thinkInterval(skill: number): number {
  return 0.7 - skill * 0.35;
}

export function aiStep(game: Game, skill: number, opp: BoardSnapshot | null = null): void {
  if (game.over) return;
  // 실수: 낮은 실력일수록 행동을 자주 건너뜀
  if (Math.random() > 0.35 + skill * 0.6) return;

  // 1) 합성 (낮은 등급부터)
  if (Math.random() < 0.3 + skill * 0.6) {
    const m = game.mergeable().sort((a, b) => GRADE_INDEX[a.grade] - GRADE_INDEX[b.grade])[0];
    if (m && game.merge(m.job, m.grade)) return;
  }
  // 2) 몹 던지기: 여유 골드가 있고 내 필드가 안정적이면 압박
  const safe = game.mobs.length < 35;
  if (game.isPvp && safe && game.units.length >= 12 && game.gold >= 100 && Math.random() < 0.15 + skill * 0.35) {
    const pick = pickThrow(game, opp, skill);
    if (pick && game.sendAttack(pick.tier, pick.pos)) return;
  }
  // 3) 군대 확보 → 강화
  const target = 16 + Math.round(skill * 10);
  if (game.units.length < target) {
    if (game.gold >= ECONOMY.summonCost) game.summon();
    return;
  }
  const jobs = game.getJobStacks().sort((a, b) => b.count - a.count);
  for (const s of jobs) {
    if (game.gold >= game.upgradeCost(s.job)) { game.upgrade(s.job); return; }
  }
  if (game.gold >= ECONOMY.summonCost) game.summon();
}
