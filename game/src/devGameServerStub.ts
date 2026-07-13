// ============================================================
//  로컬 개발 전용 @agent8/gameserver 스텁
//  - Verse8 SDK 가 로컬에 없어 프리뷰가 안 뜨는 문제를 해결하기 위한 mock.
//  - vite.config 의 dev(serve) 전용 alias 로만 연결되며, Verse8 실제
//    빌드(vite build)에는 절대 포함되지 않는다.
// ============================================================
type Rankings = { account: string; nickname: string; wave: number }[];

class StubServer {
  account = 'local-dev';
  connected = true;
  async connect(): Promise<void> { this.connected = true; }
  async remoteFunction(name: string, _args?: unknown[]): Promise<unknown> {
    switch (name) {
      case 'getTopRankings':
        return [] as Rankings;
      case 'getMyBestRank':
        return { bestEntry: null, rank: 0 };
      case 'submitWave':
        return true;
      default:
        return null;
    }
  }
}

let instance: StubServer | null = null;

export const GameServer = {
  getInstance(): StubServer {
    return (instance ??= new StubServer());
  },
};

export default { GameServer };
