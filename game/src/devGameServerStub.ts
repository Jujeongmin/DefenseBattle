/**
 * 개발 프리뷰용 스텁: 실제 GameServer SDK 대신 로컬 모의 객체를 반환한다.
 * Verse8 플랫폼 밖에서도 빈 화면 없이 게임을 띄울 수 있도록 함.
 *
 * 프로덕션 빌드(vite build)에서는 이 파일이 alias 되지 않고 진짜 @agent8/gameserver 가 사용된다.
 */

class StubGameServer {
  account = 'dev-account';
  verse = '';
  remoteUrl = '';
  connected = false;

  static getInstance() {
    return new StubGameServer();
  }

  async connect() {
    // dev 모드에서도 랭킹 UI 흐름을 시험할 수 있도록 연결된 것처럼 처리
    this.connected = true;
    return true;
  }

  async remoteFunction(_fn: string, _args?: any[]) {
    if (_fn === 'getTopRankings') return [];
    if (_fn === 'getMyBestRank') return { bestEntry: null, rank: -1 };
    // 실제 서버(server/src/server.ts)의 구조값 반환 형태를 모사 (첫 기록 성공)
    if (_fn === 'submitWave') {
      const w = Number(_args?.[0] ?? 0);
      return { updated: true, bestWave: w, isFirst: true, previousWave: 0 };
    }
    if (_fn === 'loadPlayerData') return null;
    if (_fn === 'savePlayerData') return true;
    return null;
  }
}

export const GameServer = StubGameServer;
export const useGameServer = () => ({ connected: false, server: null });
export const useGlobalState = () => null;
export const useGlobalMyState = () => null;
export const useGlobalCollection = () => ({ items: [] });
export const useGlobalUserState = () => null;
export const useRoomState = () => null;
export const useRoomMyState = () => null;
export const useRoomUserState = () => null;
export const useRoomAllUserStates = () => [];
export const useRoomCollection = () => ({ items: [] });
export const useAsset = () => ({ assets: {}, getAsset: () => 0, hasAsset: () => false });
export const GameServerProvider = ({ children }: any) => children;

export const isAddress = () => false;
export const getAddress = (s: string) => s;
export const toAddress = (s: string) => s;
