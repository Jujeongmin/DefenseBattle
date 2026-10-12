// ============================================================
//  플랫폼 계층 - 저장/결제/계정을 추상화
//  - LocalPlatform : localStorage + 데모 VX (개발 서버/오프라인)
//  - Verse8Platform: 게임서버 계정 저장 + VX Shop 결제 (VITE_AGENT8_VERSE 설정 시)
//  지급 흐름: 결제(VX Shop) → 서버 $onItemPurchased 가 대기 목록에 기록 →
//            클라이언트 claimPurchases() 로 받아 shop.ts 가 메타에 지급(중복 방지)
// ============================================================
import type { PlatformAdapter, MetaData, PurchaseRecord } from './types';
import { PRODUCT_BY_ID } from './config';

// Verse8 SDK 는 온라인 환경에서만 동적 로드 (Node 시뮬레이터/오프라인 빌드에서 브라우저 SDK 를 끌어오지 않게)
type VXShopApi = typeof import('@verse8/platform/vanilla').VXShop;
type NetModule = typeof import('./net/server');

/** Verse8 환경(VITE_AGENT8_VERSE 설정) 여부 */
export function isOnlineEnv(): boolean {
  try {
    return !!import.meta.env?.VITE_AGENT8_VERSE;
  } catch {
    return false;
  }
}

const META_KEY = 'randomdefense.meta.v1';
const VX_KEY = 'randomdefense.vx.v1';
const PENDING_KEY = 'randomdefense.pendingPurchases.v1';
const VX_DEFAULT = 1000; // 데모용 기본 VX (실제로는 Verse8 계정 잔액)

/** localStorage 가 있으면 사용, 없으면 in-memory Map 으로 폴백하는 키-값 저장소 */
function makeKV(): { get(k: string): string | null; set(k: string, v: string): void } {
  try {
    if (typeof localStorage !== 'undefined') {
      // 실제 접근 가능 여부 확인 (일부 환경에서 예외)
      localStorage.getItem(META_KEY);
      return {
        get: (k) => localStorage.getItem(k),
        set: (k, v) => localStorage.setItem(k, v),
      };
    }
  } catch {
    /* fall through to memory */
  }
  const mem = new Map<string, string>();
  return {
    get: (k) => (mem.has(k) ? mem.get(k)! : null),
    set: (k, v) => { mem.set(k, v); },
  };
}

function readJSON<T>(kv: ReturnType<typeof makeKV>, key: string, fallback: T): T {
  try {
    const v = kv.get(key);
    return v === null ? fallback : (JSON.parse(v) as T);
  } catch {
    return fallback;
  }
}

/** 기본 로컬 플랫폼 구현 (데모 VX 로 결제 흉내) */
export class LocalPlatform implements PlatformAdapter {
  readonly kind = 'local' as const;
  protected kv = makeKV();

  async init(): Promise<void> { /* 동기 저장소라 할 일 없음 */ }

  loadMeta(): Partial<MetaData> | null {
    return readJSON<Partial<MetaData> | null>(this.kv, META_KEY, null);
  }

  saveMeta(m: MetaData): void {
    try {
      this.kv.set(META_KEY, JSON.stringify(m));
    } catch {
      /* 저장 실패는 무시 */
    }
  }

  getVX(): number | null {
    const v = this.kv.get(VX_KEY);
    return v === null ? VX_DEFAULT : Number(v);
  }

  priceOf(productId: string): number | null {
    return PRODUCT_BY_ID[productId]?.vx ?? null;
  }

  async buy(productId: string): Promise<boolean> {
    const price = this.priceOf(productId);
    if (price === null) return false;
    const cur = this.getVX() ?? 0;
    if (cur < price) return false;
    this.kv.set(VX_KEY, String(cur - price));
    const pending = readJSON<PurchaseRecord[]>(this.kv, PENDING_KEY, []);
    pending.push({ purchaseId: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, productId, quantity: 1 });
    this.kv.set(PENDING_KEY, JSON.stringify(pending));
    return true;
  }

  async claimPurchases(): Promise<PurchaseRecord[]> {
    const pending = readJSON<PurchaseRecord[]>(this.kv, PENDING_KEY, []);
    this.kv.set(PENDING_KEY, '[]');
    return pending;
  }

  accountId(): string | null {
    return null;
  }
}

/**
 * Verse8 플랫폼: 메타는 서버(계정)에 저장하고 localStorage 는 계정별 캐시로 사용.
 *  - 캐시 키에 계정 id 를 붙인다: 한 기기에서 여러 계정을 써도 다른 계정 진행이 섞이지 않게
 *  - 계정을 확인하지 못하면(프로필 로드 실패) 서버에도 캐시에도 저장하지 않는다 (남의 저장본 덮어쓰기 방지)
 *  - 저장은 0.8초 묶어서 보내고, 창을 닫거나 숨길 때 남은 것을 바로 보낸다
 * 결제는 VX Shop 다이얼로그(부모 창) → 서버 훅에서 바로 지급 (server.ts $onItemPurchased).
 */
export class Verse8Platform extends LocalPlatform {
  // @ts-expect-error - kind 를 verse8 로 좁힘
  readonly kind = 'verse8' as const;
  private remoteMeta: Partial<MetaData> | null = null;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingSave: MetaData | null = null;
  private account: string | null = null;
  private shop: VXShopApi | null = null;
  private net: NetModule | null = null;

  async init(): Promise<void> {
    const [{ VXShop }, net] = await Promise.all([import('@verse8/platform/vanilla'), import('./net/server')]);
    this.shop = VXShop;
    this.net = net;
    VXShop.init();
    // 프로필(계정) 로드: 잠깐 끊겨도 되게 3번까지 다시 시도
    for (let i = 0; i < 3 && !this.account; i++) {
      try {
        const res = await net.callGlobal<{ account: string; meta: Partial<MetaData> | null }>('loadProfile');
        this.account = res.account || null;
        this.remoteMeta = res.meta;
      } catch (e) {
        console.warn(`[Verse8Platform] 프로필 로드 실패 (${i + 1}/3)`, e);
        if (i < 2) await new Promise((r) => setTimeout(r, 800 * (i + 1)));
      }
    }
    // 창을 닫거나 다른 앱으로 넘어갈 때 묶여 있던 저장을 바로 보낸다
    const flush = () => this.flushSave();
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
  }

  /** 이 계정의 로컬 캐시 키 (계정 확인 전엔 없음) */
  private cacheKey(): string | null {
    return this.account ? `${META_KEY}:${this.account}` : null;
  }

  loadMeta(): Partial<MetaData> | null {
    // 서버 데이터 우선 (다른 기기에서 플레이한 진행도). 없으면 이 계정의 캐시만 - 다른 계정 캐시는 쓰지 않는다
    if (this.remoteMeta) return this.remoteMeta;
    const key = this.cacheKey();
    return key ? readJSON<Partial<MetaData> | null>(this.kv, key, null) : null;
  }

  saveMeta(m: MetaData): void {
    const key = this.cacheKey();
    if (!key) return; // 계정을 모르면 저장하지 않는다
    try { this.kv.set(key, JSON.stringify(m)); } catch { /* 캐시 실패는 무시 */ }
    // 서버 저장은 디바운스 (연속 저장 묶기)
    this.pendingSave = JSON.parse(JSON.stringify(m)) as MetaData;
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.flushSave(), 800);
  }

  /** 묶여 있던 서버 저장을 지금 보낸다 */
  flushSave(): void {
    if (this.saveTimer) { clearTimeout(this.saveTimer); this.saveTimer = null; }
    const snapshot = this.pendingSave;
    this.pendingSave = null;
    if (!snapshot || !this.account) return;
    this.net?.callGlobal('saveProfile', snapshot).catch((e) => console.warn('[Verse8Platform] 저장 실패', e));
  }

  getVX(): number | null { return null; } // 잔액은 VX Shop 결제창에서 확인

  priceOf(productId: string): number | null {
    return this.shop?.getItem(productId)?.price ?? super.priceOf(productId);
  }

  buy(productId: string): Promise<boolean> {
    const shop = this.shop;
    if (!shop) return Promise.resolve(false);
    return new Promise((resolve) => {
      const off = shop.onClose((p) => {
        if (p.productId !== productId) return;
        off();
        resolve(p.purchased);
      });
      shop.buyItem(productId);
    });
  }

  async claimPurchases(): Promise<PurchaseRecord[]> {
    try {
      return (await this.net?.callGlobal<PurchaseRecord[]>('claimPurchases')) || [];
    } catch (e) {
      console.warn('[Verse8Platform] 구매 수령 실패', e);
      return [];
    }
  }

  accountId(): string | null {
    return this.account;
  }
}

// 현재 활성 플랫폼 (Verse8 환경이면 자동으로 Verse8Platform)
let active: PlatformAdapter = isOnlineEnv() ? new Verse8Platform() : new LocalPlatform();

export function getPlatform(): PlatformAdapter {
  return active;
}

export function setPlatform(p: PlatformAdapter): void {
  active = p;
}
