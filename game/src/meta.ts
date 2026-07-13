// ============================================================
//  글로벌(계정) 상태 - localStorage 영구 저장
//  크리스탈, 연구소 레벨, 퀘스트/업적 진행도
// ============================================================
import { RESEARCH, DAILY_QUESTS, ACHIEVEMENTS, GACHA, collectionKey } from './config';
import { getPlatform } from './platform';
import { GameServer } from '@agent8/gameserver';
import type { MetaData, ResearchKey, QuestStat, AchievementDef, Job, GradeKey } from './types';

const NICKNAME_KEY = 'randomdefense.nickname';
const getNick = () => localStorage.getItem(NICKNAME_KEY) || 'Player';

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
    collection: {},
    collectionLevel: {},
    gachaPity: 0,
    adRemoved: false,
  };
}

export const meta: MetaData = load();

function load(): MetaData {
  const data = getPlatform().loadMeta();
  const base = freshMeta();
  const m: MetaData = Object.assign(base, data || {});
  
  if (getPlatform().isAdRemoved()) {
    m.adRemoved = true;
  }
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
  m.collection = m.collection || {};
  m.collectionLevel = m.collectionLevel || {};
  m.gachaPity = m.gachaPity || 0;
  m.tutorialDone = m.tutorialDone || false;
  return m;
}

export function saveMeta(): void {
  if (meta.adRemoved) {
    localStorage.setItem('randomdefense.adRemoved.v1', '1');
  }
  getPlatform().saveMeta(meta);

  // Background auto-save to cloud
  const server = GameServer.getInstance();
  if (server.connected) {
    server.remoteFunction('savePlayerData', [meta, getNick()]).catch((err) => {
      console.warn('Failed to background auto-save player progress:', err);
    });
  }
}

/**
 * Cloud Progress Syncing:
 * Synchronizes local progress with server-side progress (using Max-value Merge).
 */
export async function syncWithServer(): Promise<void> {
  const server = GameServer.getInstance();
  const timeout = (ms: number) => new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms));
  try {
    if (!server.connected) {
      await Promise.race([server.connect(), timeout(5000)]);
    }
    if (!server.connected) return;

    const serverData = await Promise.race([
      server.remoteFunction('loadPlayerData'),
      timeout(5000)
    ]);
    if (!serverData) {
      await Promise.race([
        server.remoteFunction('savePlayerData', [meta, getNick()]),
        timeout(5000)
      ]);
      return;
    }

    // Merge logic: Max-value Merge (ensures zero progression loss)
    meta.crystals = Math.max(meta.crystals, Number(serverData.crystals || 0));
    meta.bestWave = Math.max(meta.bestWave, Number(serverData.bestWave || 0));
    meta.gachaPity = Math.max(meta.gachaPity, Number(serverData.gachaPity || 0));

    if (serverData.adRemoved || meta.adRemoved) {
      meta.adRemoved = true;
      localStorage.setItem('randomdefense.adRemoved.v1', '1');
    }

    if (serverData.tutorialDone || meta.tutorialDone) {
      meta.tutorialDone = true;
    }

    if (serverData.research) {
      for (const k in meta.research) {
        meta.research[k as ResearchKey] = Math.max(
          meta.research[k as ResearchKey] || 0,
          Number(serverData.research[k] || 0)
        );
      }
    }

    if (serverData.achievements) {
      for (const k in meta.achievements) {
        if (serverData.achievements[k]) {
          meta.achievements[k] = true;
        }
      }
    }

    if (serverData.collection) {
      for (const k in serverData.collection) {
        meta.collection[k] = Math.max(
          meta.collection[k] || 0,
          Number(serverData.collection[k] || 0)
        );
      }
    }

    if (serverData.collectionLevel) {
      for (const k in serverData.collectionLevel) {
        meta.collectionLevel[k] = Math.max(
          meta.collectionLevel[k] || 0,
          Number(serverData.collectionLevel[k] || 0)
        );
      }
    }

    // Save the fully merged progress to both Local Storage and Cloud Server
    getPlatform().saveMeta(meta);
    await Promise.race([
      server.remoteFunction('savePlayerData', [meta, getNick()]),
      timeout(5000)
    ]);
  } catch (err) {
    console.error('Failed to sync progress with cloud server:', err);
  }
}

// 진행 데이터 초기화 (메인화면 전용). meta 는 다른 모듈이 참조로 들고 있으므로
// 재할당 대신 내용만 새 기본값으로 교체한다. 광고제거(=3배속 해금)도 함께 잠금 상태로
// 되돌려, 초기화 후에도 3배속이 남아있던 문제를 방지한다. (음향 설정은 유지)
export function resetProgress(): void {
  Object.assign(meta, freshMeta());
  getPlatform().resetPurchases();
  saveMeta();
}

// 온보딩 완료 표시 / 다시보기(설정에서 호출)
export function markTutorialDone(): void {
  meta.tutorialDone = true;
  saveMeta();
}
export function resetTutorial(): void {
  meta.tutorialDone = false;
  saveMeta();
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

// ---------- 유닛 컬렉션 (가챠 / 스타업) ----------
export function collectionCount(job: Job, grade: GradeKey): number {
  return meta.collection[collectionKey(job, grade)] || 0;
}
export function collectionLevelOf(job: Job, grade: GradeKey): number {
  return meta.collectionLevel[collectionKey(job, grade)] || 0;
}
export function addToCollection(job: Job, grade: GradeKey, n = 1): void {
  const k = collectionKey(job, grade);
  meta.collection[k] = (meta.collection[k] || 0) + n;
}
// 스타업 레벨당 해당 유닛(직업×등급) 공격력 배율 보너스
export function collectionBonus(job: Job, grade: GradeKey): number {
  return collectionLevelOf(job, grade) * GACHA.bonusPerLevel;
}

// ---------- 가챠 천장(보장) 카운터 ----------
export function gachaPityCount(): number {
  return meta.gachaPity || 0;
}
export function gachaPityRemaining(): number {
  return Math.max(0, GACHA.mythicPityCount - gachaPityCount());
}
