declare module '@agent8/gameserver' {
  export class GameServer {
    connected: boolean;
    account: string | null;
    static getInstance(): GameServer;
    connect(): Promise<void>;
    remoteFunction<T = any>(name: string, args?: unknown[]): Promise<T>;
  }
}

declare module '@verse8/ads' {
  type Verse8AdResult =
    | { status: 'rewarded' }
    | { status: 'dismissed' }
    | { status: 'failed'; error: { code: string } };

  export const Verse8Ads: {
    showInterstitial(opts?: { placementId?: string }): Promise<void>;
    showRewarded(opts?: { placementId?: string; timeoutMs?: number }): Promise<Verse8AdResult>;
  };
}
