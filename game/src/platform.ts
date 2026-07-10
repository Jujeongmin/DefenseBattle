// ============================================================
//  플랫폼 계층 - 저장/상점/계정을 추상화
//  브라우저에서는 localStorage, 그 외(Node 시뮬 등)에서는 메모리로 폴백.
//  Verse8 연동 시 Verse8Platform 을 만들어 setPlatform() 으로 교체한다.
// ============================================================
import type { PlatformAdapter, MetaData } from './types';

const META_KEY = 'randomdefense.meta.v1';
const AD_KEY = 'randomdefense.adRemoved.v1';
const VX_KEY = 'randomdefense.vx.v1';
const VX_DEFAULT = 500; // 데모용 기본 VX (실제로는 Verse8 계정 잔액)

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

/** 기본 로컬 플랫폼 구현 */
export class LocalPlatform implements PlatformAdapter {
  private kv = makeKV();

  loadMeta(): Partial<MetaData> | null {
    try {
      return JSON.parse(this.kv.get(META_KEY) || 'null');
    } catch {
      return null;
    }
  }

  saveMeta(m: MetaData): void {
    try {
      this.kv.set(META_KEY, JSON.stringify(m));
    } catch {
      /* 저장 실패는 무시 */
    }
  }

  isAdRemoved(): boolean {
    return this.kv.get(AD_KEY) === '1';
  }

  async purchaseAdRemoval(): Promise<boolean> {
    // 소유 등록만 (VX 차감은 호출 측에서 spendVX 로 먼저 처리)
    this.kv.set(AD_KEY, '1');
    return true;
  }

  getVX(): number {
    const v = this.kv.get(VX_KEY);
    return v === null ? VX_DEFAULT : Number(v);
  }

  async spendVX(amount: number): Promise<boolean> {
    const cur = this.getVX();
    if (cur < amount) return false;
    this.kv.set(VX_KEY, String(cur - amount));
    return true;
  }

  accountId(): string | null {
    return null;
  }
}

// 현재 활성 플랫폼 (기본: 로컬)
let active: PlatformAdapter = new LocalPlatform();

export function getPlatform(): PlatformAdapter {
  return active;
}

/** Verse8 연동 시 여기로 교체 (예: setPlatform(new Verse8Platform(sdk))) */
export function setPlatform(p: PlatformAdapter): void {
  active = p;
}
