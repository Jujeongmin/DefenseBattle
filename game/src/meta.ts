// ============================================================
//  글로벌(계정) 상태 - localStorage 영구 저장
//  크리스탈, 연구소 레벨, 퀘스트/업적 진행도
// ============================================================
import { RESEARCH, DAILY_QUESTS, ACHIEVEMENTS } from './config';
import { getPlatform } from './platform';
import type { MetaData, ResearchKey, QuestStat, AchievementDef } from './types';

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
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
  if (!m.daily || m.daily.date !== todayStr()) {
    m.daily = fresh.daily; // 날짜 바뀌면 일일 퀘스트 초기화
  } else {
    m.daily.progress = Object.assign(fresh.daily.progress, m.daily.progress);
    m.daily.claimed = Object.assign(fresh.daily.claimed, m.daily.claimed);
  }
  return m;
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

export function unlockAchievement(key: string): AchievementDef | null {
  const a = ACHIEVEMENTS.find((x) => x.key === key);
  if (!a || meta.achievements[key]) return null;
  meta.achievements[key] = true;
  meta.crystals += a.reward;
  saveMeta();
  return a;
}
