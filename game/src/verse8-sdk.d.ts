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
  // 실제 SDK 의 AdResult 를 따른다. error.message 등 선택 필드를 빠뜨리면
  // 그 값을 읽는 코드가 로컬에서만 타입 오류로 막힌다.
  type Verse8AdErrorCode = 'busy' | 'timeout' | 'unsupported_env' | 'platform_error';
  type Verse8AdResult =
    | { status: 'rewarded'; requestId?: string; reward?: { amount: number; type: string } }
    | { status: 'dismissed'; requestId?: string }
    | { status: 'failed'; requestId?: string; error: { code: Verse8AdErrorCode; message?: string } };

  export const Verse8Ads: {
    showInterstitial(opts?: { placementId?: string }): Promise<void>;
    showRewarded(opts?: { placementId?: string; timeoutMs?: number }): Promise<Verse8AdResult>;
  };
}
