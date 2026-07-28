declare module '@verse8/platform/vanilla' {
  export const VXShop: {
    init(config?: { verseId?: string; account?: string }): void;
    getItem(id: string): unknown;
    getItems(): unknown[];
    getState(): { items: unknown[]; isLoading: boolean; error: string | null };
    buyItem(productId: string): void;
    onClose(cb: () => void): void;
    refresh(): void;
    subscribe(cb: (state: { items: unknown[]; isLoading: boolean; error: string | null }) => void): () => void;
  };
}
