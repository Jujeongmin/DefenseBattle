import { Verse8Ads } from '@verse8/ads';
import { getPlatform } from './platform';

class AdManager {
  private interstitialActive = false;
  private rewardedActive = false;
  private unsupported = false;

  private isRemoved(): boolean {
    return getPlatform().isAdRemoved();
  }

  /** 보상형 광고 버튼 활성화 여부 (미지원 환경이면 숨김) */
  isRewardAvailable(): boolean {
    return !this.isRemoved() && !this.unsupported;
  }

  /**
   * 전면 광고 (Interstitial) - 게임오버 후 메인메뉴로 돌아갈 때 표시
   */
  async showInterstitial(): Promise<void> {
    if (this.isRemoved() || this.unsupported) {
      return;
    }

    if (this.interstitialActive) {
      return;
    }

    this.interstitialActive = true;

    try {
      await Verse8Ads.showInterstitial({ placementId: 'game-over' });
    } catch {
      /* 광고 실패는 무시하고 넘어감 */
    } finally {
      this.interstitialActive = false;
    }
  }

  /**
   * 보상형 광고 (Rewarded) - 사용자 제스처에서 호출
   * resolve(true) = 광고 시청 완료, resolve(false) = 중도 이탈/실패
   */
  async watchRewardedAd(placementId = 'bonus-gold'): Promise<boolean> {
    if (this.isRemoved()) return true;

    if (this.rewardedActive || this.unsupported) return false;

    this.rewardedActive = true;

    try {
      const result = await Verse8Ads.showRewarded({ placementId });

      switch (result.status) {
        case 'rewarded':
          return true;
        case 'dismissed':
          return false;
        case 'failed':
          if (result.error.code === 'unsupported_env') {
            this.unsupported = true;
          }
          return false;
        default:
          return false;
      }
    } catch {
      return false;
    } finally {
      this.rewardedActive = false;
    }
  }

  isInterstitialActive(): boolean {
    return this.interstitialActive;
  }
}

export const adManager = new AdManager();
