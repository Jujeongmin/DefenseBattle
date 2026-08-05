declare module '@verse8/platform/vanilla' {
  interface VXShopItem {
    id: number;
    productId: string;
    name: string;
    price: number;
  }

  export const VXShop: {
    init(config?: { verseId?: string; account?: string }): void;
    getItem(id: string): VXShopItem | undefined;
    getItems(): VXShopItem[];
    getState(): { items: VXShopItem[]; isLoading: boolean; error: string | null };
    buyItem(productId: string): void;
    onClose(cb: () => void): void;
    refresh(): void;
    subscribe(cb: (state: { items: VXShopItem[]; isLoading: boolean; error: string | null }) => void): () => void;
  };
}
