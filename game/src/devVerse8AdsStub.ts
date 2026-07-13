/**
 * 개발 프리뷰용 스텁: 실제 Verse8Ads SDK 대신 로컬 모의 객체를 반환한다.
 * 프로덕션 빌드에서는 이 파일이 alias 되지 않고 진짜 @verse8/ads 가 사용된다.
 */

export const Verse8Ads = {
  async showRewarded(_opts?: any) {
    return { status: 'failed' as const, error: { code: 'unsupported_env' as const }, requestId: 'dev-stub' };
  },
  async showInterstitial(_opts?: any) {
    return { status: 'failed' as const };
  },
};
