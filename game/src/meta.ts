// ============================================================
//  글로벌(계정) 상태 - localStorage 영구 저장
//  크리스탈, 연구소 레벨, 퀘스트/업적 진행도
// ============================================================
import { RESEARCH, DAILY_QUESTS, ACHIEVEMENTS, FEATURE_UNLOCK, STARTER_ATTACKS, ATTACK_BY_KEY, PVP_TIERS, seasonIdOf } from './config';
import { getPlatform } from './platform';
import type { MetaData, ResearchKey, QuestStat, AchievementDef } from './types';
import { convertLegacyItems } from './econ/rules';
import { isBadNick } from './nickFilter';

import { tl } from './i18n';
export function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

// PvP 시즌 id (월 단위 시즌: 2026-10 → "S2026-10")
export function currentSeasonId(now = new Date()): string {
  return seasonIdOf(now);
}

function freshSeason(): MetaData['season'] {
  return { id: currentSeasonId(), xp: 0, premium: false, claimedFree: [], claimedPremium: [] };
}

function freshMeta(): MetaData {
  return {
    crystals: 0,
    research: Object.fromEntries(RESEARCH.map((r) => [r.key, 0])) as Record<ResearchKey, number>,
    achievements: Object.fromEntries(ACHIEVEMENTS.map((a) => [a.key, false])),
    daily: {
      date: todayStr(),
      progress: Object.fromEntries(DAILY_QUESTS.map((q) => [q.key, 0])),
      claimed: Object.fromEntries(DAILY_QUESTS.map((q) => [q.key, false])),
    },
    bestWave: 0,
    items: { gachaTicket: 0, goldBooster: 0 },
    season: freshSeason(),
    monthly: { expires: 0, lastClaim: '' },
    grantedPurchases: [],
    oneTime: {},
    pvp: { trophies: 0, wins: 0, losses: 0, streak: 0 },
    units: { archer: 1, wizard: 1, warrior: 1 },
    cards: {},
    chests: [{ kind: 'wood' }, null, null, null],
    chestCycle: 0,
    deck: ['archer', 'wizard', 'warrior'],
    attackDeck: [...STARTER_ATTACKS],
    stages: {},
    tutorial: 0,
    seenFeatures: [],
    roadClaimed: [],
    offers: {},
    offerShownAt: {},
    arenaMax: 0,
    stageFailStreak: 0,
    nick: tl('용사{0}', Math.floor(1000 + Math.random() * 9000)),
    adRemoved: false,
  };
}

export const meta: MetaData = load();

function load(): MetaData {
  const data = getPlatform().loadMeta();
  const base = freshMeta();
  const m: MetaData = Object.assign(base, data || {});
  // 누락 필드 보정 (버전 업/신규 연구 대응)
  const fresh = freshMeta();
  m.research = Object.assign(fresh.research, m.research || {});
  m.achievements = Object.assign(fresh.achievements, m.achievements || {});
  const items = { ...(m.items || {}) } as Record<string, number>;
  convertLegacyItems(items); // 예전 소환권·신화 확정권 → 뽑기권 (온라인이면 서버 값이 곧 덮어쓴다)
  m.items = Object.assign(fresh.items, items);
  m.monthly = Object.assign(fresh.monthly, m.monthly || {});
  m.pvp = Object.assign(fresh.pvp, m.pvp || {});
  m.oneTime = m.oneTime || {};
  m.units = Object.assign(fresh.units, m.units || {});
  m.stages = m.stages || {};
  m.roadClaimed = Array.isArray(m.roadClaimed) ? m.roadClaimed : [];
  m.offers = m.offers || {};
  m.offerShownAt = m.offerShownAt || {};
  // 예전 저장본: 지금 아레나에서 시작 (이미 오른 아레나로 승급 팝업이 뜨지 않게)
  m.arenaMax = m.arenaMax ?? PVP_TIERS.filter((t) => (m.pvp?.trophies ?? 0) >= t.min).length - 1;
  m.stageFailStreak = m.stageFailStreak ?? 0;
  if (typeof m.nick !== 'string' || !m.nick.trim() || isBadNick(m.nick)) m.nick = fresh.nick; // 예전에 저장된 비속어 닉네임
  m.cards = m.cards || {};
  m.chests = Array.isArray(m.chests) ? m.chests : [{ kind: 'wood' }, null, null, null];
  m.chestCycle = m.chestCycle ?? 0;
  // 이 필드가 생기기 전 저장본: 이미 열린 메뉴에 NEW 가 갑자기 뜨지 않게 해금된 것은 본 것으로 둔다
  if (!Array.isArray(m.seenFeatures)) {
    m.seenFeatures = Object.entries(FEATURE_UNLOCK).filter(([, st]) => (m.stages[st] || 0) > 0).map(([f]) => f);
  }
  if (!Array.isArray(m.deck) || !m.deck.length) m.deck = fresh.deck;
  m.deck = m.deck.filter((j) => m.units[j]); // 미해금 유닛 제거
  if (!Array.isArray(m.attackDeck) || !m.attackDeck.every((k) => ATTACK_BY_KEY[k])) m.attackDeck = [...STARTER_ATTACKS];
  m.grantedPurchases = Array.isArray(m.grantedPurchases) ? m.grantedPurchases : [];
  // 시즌이 바뀌면 시즌 패스 진행 초기화 (프리미엄은 시즌 단위 상품)
  if (!m.season || m.season.id !== currentSeasonId()) m.season = fresh.season;
  if (!m.daily || m.daily.date !== todayStr()) {
    m.daily = fresh.daily; // 날짜 바뀌면 일일 퀘스트 초기화
  } else {
    m.daily.progress = Object.assign(fresh.daily.progress, m.daily.progress);
    m.daily.claimed = Object.assign(fresh.daily.claimed, m.daily.claimed);
  }
  return m;
}

/** 플랫폼 비동기 초기화(서버 저장본 로드) 후 메타를 다시 읽어 같은 객체에 반영 */
export function reloadMeta(): void {
  const fresh = load();
  for (const k of Object.keys(meta) as (keyof MetaData)[]) delete (meta as Partial<MetaData>)[k];
  Object.assign(meta, fresh);
}

export function saveMeta(): void {
  getPlatform().saveMeta(meta);
}

export function researchLevel(key: ResearchKey): number {
  return meta.research[key] || 0;
}

export function addDailyProgress(stat: QuestStat, amount = 1): void {
  for (const q of DAILY_QUESTS) {
    if (q.stat === stat) {
      meta.daily.progress[q.key] = (meta.daily.progress[q.key] || 0) + amount;
    }
  }
}

export function setDailyBestWave(wave: number): void {
  for (const q of DAILY_QUESTS) {
    if (q.stat === 'bestWave') {
      meta.daily.progress[q.key] = Math.max(meta.daily.progress[q.key] || 0, wave);
    }
  }
}

/** 업적 달성 → 보상 수령 요청 (보상은 econ - 온라인이면 서버). 띄울 알림용 정의 반환 (이미 받았거나 받는 중이면 null) */
const achievePending = new Set<string>();
export function unlockAchievement(key: string): AchievementDef | null {
  const a = ACHIEVEMENTS.find((x) => x.key === key);
  if (!a || meta.achievements[key] || achievePending.has(key)) return null;
  achievePending.add(key);
  void import('./econ').then((m) => m.act('claimAchievement', { key })).finally(() => achievePending.delete(key));
  return a;
}
