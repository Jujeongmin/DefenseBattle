import { Verse8Ads } from '@verse8/ads';
import { getPlatform } from './platform';
import { AD_SHOP_COOLDOWN_MINUTES } from './config';

const SHOP_AD_COOLDOWN_KEY = 'randomdefense.shopAdCooldown.v1';

class AdManager {
  private interstitialActive = false;
  private rewardedActive = false;
  private unsupported = false;

  private isRemoved(): boolean {
    return getPlatform().isAdRemoved();
  }

  /** 보상형 광고 버튼 활성화 여부 (미지원 환경이면 숨김) */
  isRewardAvailable(): boolean {
    return !this.unsupported;
  }

  /** 광고제거 상태인지 (상점 광고 즉시지급 판단용) */
  isAdRemoved(): boolean {
    return this.isRemoved();
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
      const result = await Verse8Ads.showRewarded({ placementId, timeoutMs: 120_000 });

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

  /** 상점 보상형 광고 쿨다운 남은 시간(초). 0 이하면 시청 가능. */
  getShopAdCooldownRemaining(): number {
    const raw = localStorage.getItem(SHOP_AD_COOLDOWN_KEY);
    if (!raw) return 0;
    const nextAvailable = Number(raw);
    if (!Number.isFinite(nextAvailable)) return 0;
    return Math.max(0, Math.ceil((nextAvailable - Date.now()) / 1000));
  }

  /** 상점 보상형 광고 시청. 광고제거 상태면 광고 없이 즉시 보상. */
  async watchShopRewardedAd(): Promise<boolean> {
    if (this.isRemoved()) {
      // 광고제거 상태: 쿨다운만 체크하고 즉시 보상
      if (this.getShopAdCooldownRemaining() > 0) return false;
      const nextTime = Date.now() + AD_SHOP_COOLDOWN_MINUTES * 60 * 1000;
      localStorage.setItem(SHOP_AD_COOLDOWN_KEY, String(nextTime));
      return true;
    }

    if (this.unsupported || this.rewardedActive) return false;
    if (this.getShopAdCooldownRemaining() > 0) return false;

    this.rewardedActive = true;

    try {
      const result = await Verse8Ads.showRewarded({ placementId: 'shop-gems', timeoutMs: 120_000 });

      switch (result.status) {
        case 'rewarded': {
          const nextTime = Date.now() + AD_SHOP_COOLDOWN_MINUTES * 60 * 1000;
          localStorage.setItem(SHOP_AD_COOLDOWN_KEY, String(nextTime));
          return true;
        }
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
}

export const adManager = new AdManager();
