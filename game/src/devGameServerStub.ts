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
    // dev 모드에서는 실제 서버가 없으므로 연결하지 않음
    return false;
  }

  async remoteFunction(_fn: string, _args?: any[]) {
    if (_fn === 'getTopRankings') return [];
    if (_fn === 'getMyBestRank') return { bestEntry: null, rank: -1 };
    if (_fn === 'submitWave') return { updated: false, bestWave: 0, message: '개발 모드: 서버 없음' };
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
