// ============================================================
//  AI 플레이어 - PvP 연습 상대(봇)가 사용하는 자동 플레이 정책
//  skill(0~1): 높을수록 판단이 빠르고 합성/강화/몹 보내기를 잘 활용
// ============================================================
import { GRADE_INDEX, ECONOMY, ATTACKS, JOBS, PLAY_SPEED } from './config';
import { MAP, SEG_ZONE, type Game, type BoardSnapshot } from './engine';
import type { Job } from './types';

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

/** 던질 카드와 위치 고르기: 상대 덱에 카운터 유닛이 없는 카드 우선, 가장 약한 구역 앞 길 시작점 */
export function pickThrow(game: Game, opp: BoardSnapshot | null, skill: number, ignoreGold = false): { card: number; pos: number } | null {
  const affordable = game.attackCards.filter((c) => (ignoreGold || game.gold >= game.attackCost(c)) && game.attackCooldown(c) <= 0);
  if (!affordable.length) return null;
  const jobs = new Set<Job>();
  if (opp) for (let i = 0; i + 3 < opp.units.length; i += 4) { const j = JOBS[opp.units[i]]; if (j) jobs.add(j); }
  const score = (c: number) => {
    const d = ATTACKS[c];
    const open = d.counters.filter((j) => !jobs.has(j)).length / d.counters.length;
    const resisted = d.resist ? d.resist.filter((j) => jobs.has(j)).length * 0.3 : 0;
    return open * 2 + resisted + d.cost / 200 + Math.random() * (1.2 - skill);
  };
  const card = affordable.sort((a, b) => score(b) - score(a))[0];
  let pos = Math.random();
  if (opp && Math.random() < 0.3 + skill * 0.6) {
    const power = zonePower(opp);
    const seg = [0, 1, 2, 3].sort((a, b) => power[SEG_ZONE[a]] - power[SEG_ZONE[b]])[0];
    pos = (seg + 0.05) / 4;
  }
  return { card, pos };
}

/** 한 번 판단하는 간격(실시간 초) - 사람 손 속도에 맞춘다 (사람 손 속도).
 *  (실력 0.3 ≈ 0.6초, 0.75 ≈ 0.44초) 예전엔 게임 시간 0.35초(= 2배속에서 실시간 0.175초)마다 판단해 사람보다 훨씬 빨리 진형을 갖췄다. */
export function thinkInterval(skill: number): number {
  return 0.7 - skill * 0.35;
}

/** 던지기 계획: 카드를 정하면 골드를 모아 던진다 (예전엔 골드를 소환에 다 써서 판당 0.4번밖에 못 던졌다) */
const plans = new WeakMap<Game, { card: number; pos: number } | null>();
const nextThrow = new WeakMap<Game, number>();
/** 던지기 간격(실시간 초) - 실력이 높을수록 자주 (0.2 ≈ 38초, 0.5 ≈ 29초, 0.75 ≈ 21초) */
export function throwInterval(skill: number): number {
  return 44 - skill * 30;
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
  // 2) 몹 던지기: 때가 되면 카드를 정하고 골드를 모은다. 내 필드가 위험하면 계획을 접고 방어에 쓴다
  if (game.isPvp && game.units.length >= 10) {
    if (!nextThrow.has(game)) nextThrow.set(game, game.time + (8 + Math.random() * 10) * PLAY_SPEED);
    let plan = plans.get(game) ?? null;
    if (!plan && game.time >= nextThrow.get(game)! && game.mobs.length < 40) {
      plan = pickThrow(game, opp, skill, true);
      plans.set(game, plan);
    }
    if (plan) {
      if (game.mobs.length > 50) plans.set(game, null);
      else if (game.gold >= game.attackCost(plan.card)) {
        if (game.sendAttack(plan.card, plan.pos)) {
          plans.set(game, null);
          nextThrow.set(game, game.time + throwInterval(skill) * (0.7 + Math.random() * 0.6) * PLAY_SPEED);
        }
        return;
      } else return; // 골드 모으는 중 (합성만 한다)
    }
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
