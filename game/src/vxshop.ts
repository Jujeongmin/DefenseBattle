// ============================================================
//  VX Shop 연동 (실결제) - @verse8/platform 래퍼
//  - 상품 목록/가격/재고는 Verse8 대시보드(VX Shop 탭)에서 관리한다.
//  - 결제창은 Verse8 이 직접 띄우고 검증하므로, 클라이언트는 잔액을 들고 있지 않는다.
//  - Cat Trio와 동일하게 onClose.purchased 성공 결과에서 보상을 즉시 지급·저장한다.
//  - 서버의 $onItemPurchased(server/src/server.ts)는 구매 감사 로그만 기록한다.
// ============================================================
import { VXShop } from '@verse8/platform/vanilla';
import { syncWithServer, applySpeedUnlockEntitlement } from './meta';
import { SPEED_3X_UNLOCK_PRODUCT_ID } from './config';

export interface PurchaseResult {
  purchased: boolean;
  productId: string;
  action: 'purchased' | 'closed';
}

let initialized = false;
let onSettled: ((result: PurchaseResult) => void) | null = null;
let onCatalogUpdated: (() => void) | null = null;

// 결제창이 닫히면 성공 payload를 상점에 전달한 뒤 로컬/클라우드 상태를 동기화한다.
async function handleClose(result: PurchaseResult): Promise<void> {
  // Cat Trio와 동일하게 결제 성공 payload를 기준으로 클라이언트 지급을 먼저 확정한다.
  // onSettled 콜백이 로컬 상태 저장과 서버 savePlayerData 호출을 담당한다.
  onSettled?.(result);
  void VXShop.refresh();
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await syncWithServer();
    } catch {
      /* 일시적 네트워크 오류는 무시하고 다음 시도 */
    }
    if (attempt < 2) {
      await new Promise<void>((r) => setTimeout(r, 800));
    }
  }
}

export function initVXShop(): void {
  if (initialized) return;
  initialized = true;
  try {
    VXShop.onClose(handleClose);
    VXShop.subscribe(() => {
      // 카탈로그가 갱신될 때마다 3배속 보유 여부를 다시 반영한다.
      // 대시보드에서 환불되면 purchasedCount 가 0 이 되고, 그 시점에 해금이 회수된다.
      applySpeedUnlockEntitlement(ownsItem(SPEED_3X_UNLOCK_PRODUCT_ID));
      onCatalogUpdated?.();
    });
    VXShop.init();
  } catch (err) {
    console.warn('[vxshop] init failed (Verse8 플랫폼 밖에서 실행 중일 수 있음):', err);
  }
}

/** 상점 패널이 열려있는 동안, 결제 완료 후 다시 그릴 콜백을 등록/해제한다. */
export function setOnPurchaseSettled(fn: ((result: PurchaseResult) => void) | null): void {
  onSettled = fn;
}

/** Verse8 대시보드에 등록된 현재 상품 가격을 반환한다. */
export function getItemPrice(productId: string): number | undefined {
  return VXShop.getItem(productId)?.price;
}

/**
 * 이 계정이 해당 상품을 실제로 보유 중인지 (VX Shop 기준).
 * undefined = 카탈로그를 아직 못 받아서 알 수 없음(오프라인/Verse8 밖).
 * 환불되면 purchasedCount 가 줄어들므로, 영구 해금 상품의 권한은 이 값을 따라가야 한다.
 */
export function ownsItem(productId: string): boolean | undefined {
  const item = VXShop.getItem(productId);
  if (!item) return undefined;
  return (item.purchasedCount ?? 0) > 0;
}

/** 상품 목록/가격을 새로 받아오면 열린 상점을 다시 그릴 콜백을 등록한다. */
export function setOnCatalogUpdated(fn: (() => void) | null): void {
  onCatalogUpdated = fn;
}

/** productId 는 config.ts 의 CRYSTAL_PACKAGES[].id / SPEED_3X_UNLOCK_PRODUCT_ID 와 정확히 일치해야 한다. */
export function buyItem(productId: string): void {
  try {
    VXShop.buyItem(productId);
  } catch (err) {
    console.warn('[vxshop] buyItem failed:', err);
  }
}
