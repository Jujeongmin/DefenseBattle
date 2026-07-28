// ============================================================
//  VX Shop 연동 (실결제) - @verse8/platform 래퍼
//  - 상품 목록/가격/재고는 Verse8 대시보드(VX Shop 탭)에서 관리한다.
//  - 결제창은 Verse8 이 직접 띄우고 검증하므로, 클라이언트는 잔액을 들고 있지 않는다.
//  - 지급(크리스탈 적립/광고제거 등)은 서버의 $onItemPurchased(server/src/server.ts)
//    에서 계정 상태로 기록하고, 클라는 결제창이 닫힌 뒤 서버 상태를 다시 동기화해서 반영한다.
// ============================================================
import { VXShop } from '@verse8/platform/vanilla';
import { syncWithServer } from './meta';

let initialized = false;
let onSettled: (() => void) | null = null;

// 결제창이 닫힐 때마다(구매 성공/취소 모두) 서버 상태를 다시 받아와 반영한다.
// 지급은 이미 서버에서 끝난 뒤이므로, 여기서는 "내 계정 상태를 새로고침"만 하면 된다.
// 웹훅 반영 지연을 고려해 짧은 간격으로 최대 3회 재동기화한 뒤 settled 콜백을 호출한다.
async function handleClose(): Promise<void> {
  VXShop.refresh();
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
  onSettled?.();
}

export function initVXShop(): void {
  if (initialized) return;
  initialized = true;
  try {
    VXShop.onClose(handleClose);
    VXShop.init();
  } catch (err) {
    console.warn('[vxshop] init failed (Verse8 플랫폼 밖에서 실행 중일 수 있음):', err);
  }
}

/** 상점 패널이 열려있는 동안, 결제 완료 후 다시 그릴 콜백을 등록/해제한다. */
export function setOnPurchaseSettled(fn: (() => void) | null): void {
  onSettled = fn;
}

/** productId 는 config.ts 의 CRYSTAL_PACKAGES[].id / AD_REMOVAL_PRODUCT_ID 와 정확히 일치해야 한다. */
export function buyItem(productId: string): void {
  try {
    VXShop.buyItem(productId);
  } catch (err) {
    console.warn('[vxshop] buyItem failed:', err);
  }
}
