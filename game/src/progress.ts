// ============================================================
//  진행도 - 캠페인 스테이지 / 유닛 해금·레벨 / 덱 / 기능 해금
//  (메타 데이터를 읽고 쓰는 규칙을 한 곳에 모아 UI 와 분리)
// ============================================================
import {
  STAGES, STAGE_BY_ID, CAMPAIGN, UNITS, UNIT_BY_ID, DECK_SIZE, UNIT_MAX_LEVEL, unitUpgradeCost,
  FEATURE_UNLOCK, STAGES_PER_CHAPTER, TROPHY_ROAD, type RoadStep,
  STARTER_ATTACKS, ATTACK_DECK_SIZE, cardsNeeded, type AttackKey,
} from './config';
import { meta, saveMeta } from './meta';
import type { Job, GameOptions } from './types';

// ---------- 스테이지 ----------
export function stageStars(id: string): number {
  return meta.stages[id] || 0;
}
export function stageCleared(id: string): boolean {
  return stageStars(id) > 0;
}
/** 첫 스테이지이거나 이전 스테이지를 클리어했으면 도전 가능 */
export function stageUnlocked(id: string): boolean {
  const st = STAGE_BY_ID[id];
  if (!st) return false;
  if (st.index === 0) return true;
  return stageCleared(STAGES[st.index - 1].id);
}
/** 다음에 도전할 스테이지 (모두 클리어 시 마지막) */
export function nextStageId(): string {
  const s = CAMPAIGN.find((x) => !stageCleared(x.id));
  return (s ?? CAMPAIGN[CAMPAIGN.length - 1]).id;
}
export function chapterStars(chapter: number): number {
  return STAGES.filter((s) => s.chapter === chapter).reduce((n, s) => n + stageStars(s.id), 0);
}
import { CHAPTER_STAR_GOALS, chapterStarReward } from './config';
export { CHAPTER_STAR_GOALS, chapterStarReward };
/** 챕터 별 보상 수령 키 */
function starKey(chapter: number, goalIdx: number): string {
  return `stars:${chapter}:${goalIdx}`;
}
export function starRewardClaimed(chapter: number, goalIdx: number): boolean {
  return !!meta.oneTime[starKey(chapter, goalIdx)];
}
export interface StageResult {
  stars: number;
  firstClear: boolean;
  newBest: boolean;
  crystals: number;
  unlocked?: Job;
}

export function chapterUnlocked(chapter: number): boolean {
  if (chapter === 1) return true;
  return stageCleared(`${chapter - 1}-${STAGES_PER_CHAPTER}`);
}

// ---------- 기능 해금 ----------
export type Feature = keyof typeof FEATURE_UNLOCK;
export function featureUnlocked(f: Feature): boolean {
  return stageCleared(FEATURE_UNLOCK[f]);
}
/** 해금됐지만 아직 로비에서 눌러 보지 않은 기능 (NEW 표시) */
export function featureNew(f: Feature): boolean {
  return featureUnlocked(f) && !meta.seenFeatures.includes(f);
}
export function markFeatureSeen(f: Feature): void {
  if (meta.seenFeatures.includes(f)) return;
  meta.seenFeatures.push(f);
  saveMeta();
}

// ---------- 유닛 ----------
export function unitUnlocked(job: Job): boolean {
  return !!meta.units[job];
}
export function unitLevel(job: Job): number {
  return meta.units[job] || 0;
}

/** 레벨업에 필요한 카드 / 지금 가진 카드 */
export function unitCards(job: Job): { have: number; need: number } {
  return { have: meta.cards[job] ?? 0, need: cardsNeeded(UNIT_BY_ID[job].rarity, unitLevel(job)) };
}
/** 카드가 다 모였나 (보석은 따로) */
export function cardsReady(job: Job): boolean {
  const lv = unitLevel(job);
  const c = unitCards(job);
  return lv > 0 && lv < UNIT_MAX_LEVEL && c.have >= c.need;
}
export function canUpgradeUnit(job: Job): boolean {
  return cardsReady(job) && meta.crystals >= unitUpgradeCost(unitLevel(job));
}

/** 덱 토글: 덱에 있으면 빼고(최소 1), 없으면 넣는다(최대 4) */
export function toggleDeck(job: Job): boolean {
  if (!unitUnlocked(job)) return false;
  const i = meta.deck.indexOf(job);
  if (i >= 0) {
    if (meta.deck.length <= 1) return false;
    meta.deck.splice(i, 1);
  } else {
    if (meta.deck.length >= DECK_SIZE) return false;
    meta.deck.push(job);
  }
  saveMeta();
  return true;
}

/** 끌어다 놓기: 유닛을 덱 slot 칸에 놓는다. 이미 덱에 있으면 두 칸을 바꾸고, 칸이 차 있으면 교체 */
export function placeDeck(job: Job, slot: number): boolean {
  if (!unitUnlocked(job) || slot < 0 || slot >= DECK_SIZE) return false;
  const d = meta.deck;
  const from = d.indexOf(job);
  if (slot >= d.length) { // 빈 칸: 맨 뒤에 붙인다
    if (from >= 0) d.splice(from, 1);
    d.push(job);
  } else if (from >= 0) {
    [d[from], d[slot]] = [d[slot], d[from]];
  } else {
    d[slot] = job;
  }
  saveMeta();
  return true;
}
/** 덱에서 뺀다 (최소 1) */
export function removeDeck(job: Job): boolean {
  const i = meta.deck.indexOf(job);
  if (i < 0 || meta.deck.length <= 1) return false;
  meta.deck.splice(i, 1);
  saveMeta();
  return true;
}

// ---------- 공격 덱 (몹 카드 4장) ----------
/** 기본 카드 + 트로피 로드에서 받은 카드 */
export function attackUnlocked(k: AttackKey): boolean {
  return STARTER_ATTACKS.includes(k) || TROPHY_ROAD.some((s) => s.attack === k && meta.roadClaimed.includes(s.at));
}
export function attackUnlockAt(k: AttackKey): number | null {
  return TROPHY_ROAD.find((s) => s.attack === k)?.at ?? null;
}
/** 몹 카드를 slot 칸에 놓는다. 이미 덱에 있으면 두 칸을 바꾼다 (공격 덱은 늘 4장) */
export function placeAttack(k: AttackKey, slot: number): boolean {
  if (!attackUnlocked(k) || slot < 0 || slot >= ATTACK_DECK_SIZE) return false;
  const d = meta.attackDeck;
  const from = d.indexOf(k);
  if (from >= 0) [d[from], d[slot]] = [d[slot], d[from]];
  else d[slot] = k;
  saveMeta();
  return true;
}

export function unitLevels(): Partial<Record<Job, number>> {
  const out: Partial<Record<Job, number>> = {};
  for (const u of UNITS) if (meta.units[u.id]) out[u.id] = meta.units[u.id];
  return out;
}

// ---------- 게임 시작 옵션 ----------
/** 덱에 넣을 수 있는 최대 유닛 수 (보유 유닛 수와 덱 칸 중 작은 값) - 이보다 적게 넣으면 소환이 비싸진다 */
export function deckMin(): number {
  return Math.min(DECK_SIZE, Object.values(meta.units).filter((lv) => (lv ?? 0) > 0).length);
}

export function stageOptions(id: string, goldBooster: boolean): Partial<GameOptions> {
  const st = STAGE_BY_ID[id];
  return {
    mode: 'solo', stageId: id, waves: st.waves, hpMult: st.hpMult, races: st.races,
    deck: [...meta.deck], deckMin: deckMin(), unitLevels: unitLevels(), startGoldMult: goldBooster ? 2 : 1,
  };
}
export function endlessOptions(goldBooster: boolean): Partial<GameOptions> {
  return { mode: 'solo', deck: [...meta.deck], deckMin: deckMin(), unitLevels: unitLevels(), startGoldMult: goldBooster ? 2 : 1 };
}

// ---------- 트로피 로드 ----------
/** 다음 로드 보상 (없으면 null) */
export function nextRoadStep(): RoadStep | null {
  return TROPHY_ROAD.find((s) => !meta.roadClaimed.includes(s.at) && s.at > meta.pvp.trophies) ?? null;
}
/** 이 유닛을 여는 로드 지점 (없으면 null) */
export function roadUnlockAt(job: Job): number | null {
  return TROPHY_ROAD.find((s) => s.unit === job)?.at ?? null;
}
