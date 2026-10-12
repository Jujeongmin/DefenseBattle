// ============================================================
//  경제 동작 (기기 쪽) - 보석·카드·레벨·상자·보상을 바꾸는 모든 일은 여기로
//   온라인(Verse8): 서버 함수가 계산·저장하고 결과 상태를 내려준다 → 저장본(meta)에 반영해 화면에 보여 줄 뿐
//   오프라인(로컬 개발): 같은 규칙(econ/rules.ts)을 저장본에 직접 적용
// ============================================================
import * as R from './econ/rules';
import { meta, saveMeta } from './meta';
import { getPlatform } from './platform';
import { DECK_SIZE } from './config';
import type { Job } from './types';

export type { Reveal, CardDrop } from './econ/rules';

export const online = (): boolean => getPlatform().kind === 'verse8';
const ctx = (): R.Ctx => ({ now: Date.now(), rng: Math.random });
const local = (): R.Econ => meta as unknown as R.Econ;

async function call<T>(fn: string, args?: unknown): Promise<T> {
  const net = await import('./net/server');
  return net.callGlobal<T>(fn, args);
}

/** 서버가 보낸 경제 상태를 저장본에 반영 (새로 열린 유닛은 덱 빈자리에) */
export function applyEcon(e: Record<string, unknown> | null | undefined): void {
  if (!e) return;
  const before = new Set(Object.keys(meta.units));
  for (const k of R.ECON_KEYS) if (k in e) (meta as unknown as Record<string, unknown>)[k] = e[k];
  for (const j of Object.keys(meta.units) as Job[]) {
    if (!before.has(j) && meta.deck.length < DECK_SIZE && !meta.deck.includes(j)) meta.deck.push(j);
  }
  saveMeta();
}

/** 기기가 부를 수 있는 경제 동작 (R.CLIENT_ACTIONS) */
export async function act<T>(action: keyof typeof R.CLIENT_ACTIONS, args: Record<string, unknown> = {}): Promise<T> {
  if (online()) {
    const r = await call<{ econ: Record<string, unknown>; result: T }>('econ', { action, args });
    applyEcon(r.econ);
    return r.result;
  }
  const result = R.CLIENT_ACTIONS[action](local(), args, ctx()) as T;
  saveMeta();
  return result;
}

/** 서버의 최신 경제 상태 받기 (다른 기기에서 바뀌었을 수 있을 때) */
export async function syncEcon(): Promise<void> {
  if (!online()) return;
  try { applyEcon((await call<{ econ: Record<string, unknown> }>('econSync')).econ); } catch (e) { console.warn('[econ] 동기화 실패', e); }
}

// ---------- 스테이지 / 무한 모드: 시작 기록 → 결과 ----------
let runId: string | null = null;
export async function runStart(kind: 'stage' | 'endless', id?: string): Promise<void> {
  runId = null;
  if (!online()) return;
  try { runId = (await call<{ id: string }>('runStart', { kind, id })).id; } catch (e) { console.warn('[econ] 시작 기록 실패 - 이번 판 보상 없음', e); }
}
export type StageEnd = ReturnType<typeof R.stageEnd>;
/** 스테이지 결과 보상. 온라인에서 기록이 없거나 서버가 거부하면 null */
export async function stageResult(id: string, cleared: boolean, stars: number, wave: number): Promise<StageEnd | null> {
  if (!online()) { const r = R.stageEnd(local(), id, cleared, stars, wave, ctx()); saveMeta(); return r; }
  if (!runId) return null;
  const rid = runId; runId = null;
  try {
    const r = await call<{ econ: Record<string, unknown>; result: StageEnd } | null>('runEnd', { id: rid, cleared, stars, wave });
    if (!r) return null;
    applyEcon(r.econ);
    return r.result;
  } catch (e) { console.warn('[econ] 결과 저장 실패', e); return null; }
}
export async function endlessResult(wave: number): Promise<number> {
  if (!online()) { const c = R.endlessEnd(local(), wave, ctx()); saveMeta(); return c; }
  if (!runId) return 0;
  const rid = runId; runId = null;
  try {
    const r = await call<{ econ: Record<string, unknown>; result: number } | null>('runEnd', { id: rid, wave });
    if (!r) return 0;
    applyEcon(r.econ);
    return r.result;
  } catch { return 0; }
}

// ---------- 대전 보상 (오프라인 봇전만 기기에서) ----------
export type PvpReward = ReturnType<typeof R.pvpReward>;
export function pvpRewardLocal(won: boolean): PvpReward {
  const r = R.pvpReward(local(), won, ctx());
  saveMeta();
  return r;
}

// ---------- 결제 (오프라인 데모 결제만 기기에서 지급) ----------
export function grantLocal(productId: string, qty: number): R.Reveal[] {
  const reveals = R.grantProduct(local(), productId, qty, ctx());
  saveMeta();
  return reveals;
}
export async function claimPurchasesOnline(): Promise<{ list: { productId: string; reveals?: R.Reveal[] }[] }> {
  const r = await call<{ list: { productId: string; reveals?: R.Reveal[] }[]; econ: Record<string, unknown> }>('claimPurchases');
  applyEcon(r.econ);
  return r;
}
