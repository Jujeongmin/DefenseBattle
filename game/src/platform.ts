// ============================================================
//  플랫폼 계층 - 저장/상점/계정을 추상화
//  브라우저에서는 localStorage, 그 외(Node 시뮬 등)에서는 메모리로 폴백.
//  Verse8 연동 시 Verse8Platform 을 만들어 setPlatform() 으로 교체한다.
// ============================================================
import type { PlatformAdapter, MetaData } from './types';

const META_KEY = 'randomdefense.meta.v1';
const AD_KEY = 'randomdefense.adRemoved.v1';

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

  // 광고제거(=3배속 해금) 여부. VX Shop onClose.purchased 성공 시 저장된다.
  isAdRemoved(): boolean {
    return this.kv.get(AD_KEY) === '1';
  }

  // 진행 데이터 초기화 시 함께 호출: 광고제거(=3배속 해금)를 잠금 상태로 되돌린다.
  resetPurchases(): void {
    this.kv.set(AD_KEY, '0');
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
