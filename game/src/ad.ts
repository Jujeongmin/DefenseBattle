import { Verse8Ads } from '@verse8/ads';
import { getPlatform } from './platform';
import { AD_SHOP_COOLDOWN_MINUTES, AD_REWARDED_TIMEOUT_MS } from './config';

const SHOP_AD_COOLDOWN_KEY = 'randomdefense.shopAdCooldown.v1';

/** 상점 보상형 광고 결과. 실패 시 사용자 안내에 쓸 사유를 함께 돌려준다. */
export interface ShopAdResult {
  ok: boolean;
  /** cooldown=쿨다운 중, busy=이미 재생 중, unsupported=이 환경에서 광고 불가,
   *  dismissed=중도 이탈, failed=로딩/재생 실패 */
  reason?: 'cooldown' | 'busy' | 'unsupported' | 'dismissed' | 'failed';
  code?: string;
  message?: string;
}

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
      const result = await Verse8Ads.showRewarded({ placementId, timeoutMs: AD_REWARDED_TIMEOUT_MS });

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

  /**
   * 상점 보상형 광고 시청. 광고제거 상태면 광고 없이 즉시 보상.
   * 실패 원인을 그대로 돌려줘 호출 측에서 사용자에게 안내할 수 있게 한다.
   * (예전엔 boolean 만 돌려줘서 광고가 안 뜨면 아무 반응 없이 조용히 끝났다.)
   */
  async watchShopRewardedAd(): Promise<ShopAdResult> {
    if (this.getShopAdCooldownRemaining() > 0) return { ok: false, reason: 'cooldown' };

    if (this.isRemoved()) {
      // 광고제거 상태: 광고 없이 즉시 보상
      this.startShopAdCooldown();
      return { ok: true };
    }

    if (this.rewardedActive) return { ok: false, reason: 'busy' };
    if (this.unsupported) return { ok: false, reason: 'unsupported' };

    this.rewardedActive = true;

    try {
      const result = await Verse8Ads.showRewarded({ placementId: 'shop-gems', timeoutMs: AD_REWARDED_TIMEOUT_MS });

      switch (result.status) {
        case 'rewarded':
          this.startShopAdCooldown();
          return { ok: true };
        case 'dismissed':
          return { ok: false, reason: 'dismissed' };
        case 'failed':
          if (result.error.code === 'unsupported_env') this.unsupported = true;
          console.warn('[ads] shop rewarded failed:', result.error);
          return { ok: false, reason: 'failed', code: result.error.code, message: result.error.message };
        default:
          return { ok: false, reason: 'failed' };
      }
    } catch (err) {
      console.warn('[ads] shop rewarded threw:', err);
      return { ok: false, reason: 'failed' };
    } finally {
      this.rewardedActive = false;
    }
  }

  private startShopAdCooldown(): void {
    localStorage.setItem(SHOP_AD_COOLDOWN_KEY, String(Date.now() + AD_SHOP_COOLDOWN_MINUTES * 60 * 1000));
  }
}

export const adManager = new AdManager();
