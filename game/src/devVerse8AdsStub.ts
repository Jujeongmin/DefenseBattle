/**
 * 개발 프리뷰용 스텁: 실제 Verse8Ads SDK 대신 로컬 모의 객체를 반환한다.
 * 프로덕션 빌드에서는 이 파일이 alias 되지 않고 진짜 @verse8/ads 가 사용된다.
 */

export const Verse8Ads = {
  async showRewarded(_opts?: any) {
    // error.message 는 실제 SDK 에도 있는 선택 필드. 스텁에서 빠뜨리면 이를 읽는 코드가
    // 로컬 타입체크에서만 깨진다.
    return {
      status: 'failed' as const,
      error: { code: 'unsupported_env' as const, message: undefined as string | undefined },
      requestId: 'dev-stub',
    };
  },
  async showInterstitial(_opts?: any) {
    return { status: 'failed' as const };
  },
};
