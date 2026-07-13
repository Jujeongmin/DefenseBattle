// ============================================================
//  로컬 개발 전용 @verse8/ads 스텁
//  - Verse8 광고 SDK 가 로컬에 없어 dev 프리뷰가 안 뜨는 문제 해결용 mock.
//  - vite.config 의 dev(serve) 전용 alias 로만 연결되며, Verse8 실제
//    빌드(vite build)에는 절대 포함되지 않는다.
//  - 로컬에서는 광고 미지원 환경처럼 동작(showRewarded → unsupported_env)해
//    광고 버튼이 자연스럽게 숨겨지도록 한다.
// ============================================================
type RewardedResult =
  | { status: 'rewarded' }
  | { status: 'dismissed' }
  | { status: 'failed'; error: { code: string } };

export const Verse8Ads = {
  async showInterstitial(_opts: { placementId: string }): Promise<void> {
    return;
  },
  async showRewarded(_opts: { placementId: string }): Promise<RewardedResult> {
    return { status: 'failed', error: { code: 'unsupported_env' } };
  },
};

export default { Verse8Ads };
