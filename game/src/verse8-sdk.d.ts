declare module '@agent8/gameserver' {
  export class GameServer {
    connected: boolean;
    account: string | null;
    static getInstance(): GameServer;
    connect(): Promise<void>;
    remoteFunction<T = any>(name: string, args?: unknown[]): Promise<T>;
  }
}

