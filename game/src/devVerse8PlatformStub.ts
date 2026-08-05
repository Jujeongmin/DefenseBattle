// ============================================================
//  로컬 개발 전용 @verse8/platform 스텁
//  - VX Shop SDK 가 로컬에 없어 dev 프리뷰가 안 뜨는 문제 해결용 mock.
//  - vite.config 의 dev(serve) 전용 alias 로만 연결되며, Verse8 실제
//    빌드(vite build)에는 절대 포함되지 않는다.
//  - 로컬에서는 실제 결제창을 띄울 수 없으므로 buyItem 은 안내만 하고 끝낸다.
// ============================================================
type Listener = (payload: { purchased: boolean; productId: string; action: 'purchased' | 'closed' }) => void;

export const VXShop = {
  init(_config?: { verseId?: string; account?: string }): void {},
  getItem(_id: string): unknown {
    return undefined;
  },
  getItems(): unknown[] {
    return [];
  },
  getState(): { items: unknown[]; isLoading: boolean; error: string | null } {
    return { items: [], isLoading: false, error: null };
  },
  buyItem(productId: string): void {
    console.warn(`[VXShop dev-stub] buyItem("${productId}") - 로컬 프리뷰에서는 결제창을 띄울 수 없습니다.`);
  },
  onClose(_cb: Listener): () => void {
    return () => {};
  },
  refresh(): void {},
  subscribe(_cb: (state: { items: unknown[]; isLoading: boolean; error: string | null }) => void): () => void {
    return () => {};
  },
};

export default { VXShop };
