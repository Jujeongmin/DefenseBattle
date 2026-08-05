// 실제 @verse8/platform 의 vanilla.d.ts 와 필드가 어긋나면, 로컬 타입체크만 통과하고
// 배포 빌드에서 없는 필드를 읽게 된다. 게임이 쓰는 필드는 실제 SDK 정의를 그대로 따른다.
declare module '@verse8/platform/vanilla' {
  interface VXShopItem {
    id: number;
    verseId: string;
    productId: string;
    name: string;
    price: number;
    stock: number;
    imageUrl: string;
    description: string;
    metadata: string | null;
    purchasable: boolean;
    purchaseBlockReason?: string;
    remainingPurchaseQuantity: number | null;
    purchaseLimit: number | null;
    /** 이 계정의 구매 횟수. 환불되면 줄어들어 영구 해금 회수 판단에 쓴다. */
    purchasedCount: number;
    purchaseLimitReached: boolean;
  }

  export const VXShop: {
    init(config?: { verseId?: string; account?: string }): void;
    getItem(id: string): VXShopItem | undefined;
    getItems(): VXShopItem[];
    getState(): { items: VXShopItem[]; isLoading: boolean; error: string | null };
    buyItem(productId: string): void;
    onClose(cb: (payload: { purchased: boolean; productId: string; action: 'purchased' | 'closed' }) => void): () => void;
    refresh(): void;
    subscribe(cb: (state: { items: VXShopItem[]; isLoading: boolean; error: string | null }) => void): () => void;
  };
}
