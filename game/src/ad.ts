import { getPlatform } from './platform';
import { audio } from './audio';
import { AD_INTERSTITIAL_COOLDOWN, AD_REWARD_GOLD } from './config';

type AdCallback = () => void;

class AdManager {
  private lastInterstitialTime = 0;
  private interstitialActive = false;
  private rewardedActive = false;

  /** 광고가 제거되었는지 여부 */
  private isRemoved(): boolean {
    return getPlatform().isAdRemoved();
  }

  /**
   * 전면 광고 (Interstitial) - 게임오버 후 메인메뉴로 돌아갈 때 표시
   * 광고제거 패키지 구매 시 스킵. 쿨다운 적용.
   */
  showInterstitial(onComplete?: AdCallback): void {
    if (this.isRemoved()) {
      onComplete?.();
      return;
    }

    const now = Date.now();
    if (now - this.lastInterstitialTime < AD_INTERSTITIAL_COOLDOWN * 1000) {
      onComplete?.();
      return;
    }

    this.lastInterstitialTime = now;
    this.interstitialActive = true;

    let countdown = 5;
    const overlay = document.createElement('div');
    overlay.className = 'ad-overlay';
    overlay.innerHTML = `
      <div class="ad-container">
        <div class="ad-label">광고 (Ad)</div>
        <div class="ad-content">
          <div class="ad-icon">📢</div>
          <div class="ad-message">잠시 후 게임으로 돌아갑니다</div>
          <div class="ad-countdown" id="ad-countdown">${countdown}초 후 자동 종료</div>
          <div class="ad-progress"><div class="ad-progress-fill" id="ad-progress-fill"></div></div>
          <button class="ad-skip" id="ad-skip-btn" disabled>건너뛰기 (Skip)</button>
          <div class="ad-powered">powered by Verse8 Ads</div>
        </div>
      </div>`;

    document.body.appendChild(overlay);

    const countdownEl = overlay.querySelector('#ad-countdown') as HTMLElement;
    const progressFill = overlay.querySelector('#ad-progress-fill') as HTMLElement;
    const skipBtn = overlay.querySelector('#ad-skip-btn') as HTMLButtonElement;

    const totalDuration = 5;
    const interval = setInterval(() => {
      countdown--;
      countdownEl.textContent = `${countdown}초 후 자동 종료`;
      progressFill.style.width = `${((totalDuration - countdown) / totalDuration) * 100}%`;

      if (countdown <= 2 && !skipBtn.disabled) {
        // already enabled
      }
      if (countdown <= 2) {
        skipBtn.disabled = false;
        skipBtn.textContent = '건너뛰기 (Skip)';
      }

      if (countdown <= 0) {
        clearInterval(interval);
        this.closeInterstitial(overlay, onComplete);
      }
    }, 1000);

    skipBtn.onclick = () => {
      audio.button();
      clearInterval(interval);
      this.closeInterstitial(overlay, onComplete);
    };

    overlay.onclick = (e) => {
      if ((e.target as HTMLElement).closest('.ad-container')) return;
      // clicking outside the ad container does nothing
    };
  }

  private closeInterstitial(overlay: HTMLElement, onComplete?: AdCallback): void {
    this.interstitialActive = false;
    overlay.remove();
    onComplete?.();
  }

  /**
   * 보상형 광고 (Rewarded) - 시청 후 골드 지급
   * resolve(true) = 광고 시청 완료, resolve(false) = 중도 이탈
   */
  watchRewardedAd(): Promise<boolean> {
    return new Promise((resolve) => {
      if (this.isRemoved()) {
        resolve(true); // 광고제거 상태면 바로 보상 지급
        return;
      }

      if (this.rewardedActive) {
        resolve(false);
        return;
      }

      this.rewardedActive = true;

      let countdown = 5;

      const overlay = document.createElement('div');
      overlay.className = 'ad-overlay';
      overlay.innerHTML = `
        <div class="ad-container rewarded">
          <div class="ad-label">보상형 광고 (Rewarded Ad)</div>
          <div class="ad-content">
            <div class="ad-icon">🎬</div>
            <div class="ad-message">광고 시청 후 <span style="color:#ffd700;font-weight:800;">${AD_REWARD_GOLD} 골드</span>를 받으세요!</div>
            <div class="ad-countdown" id="rw-countdown">${countdown}초 남음</div>
            <div class="ad-progress"><div class="ad-progress-fill rewarded-fill" id="rw-progress-fill"></div></div>
            <button class="ad-close" id="rw-close-btn">닫기 (보상 없음)</button>
            <div class="ad-powered">powered by Verse8 Ads</div>
          </div>
        </div>`;

      document.body.appendChild(overlay);

      const countdownEl = overlay.querySelector('#rw-countdown') as HTMLElement;
      const progressFill = overlay.querySelector('#rw-progress-fill') as HTMLElement;
      const closeBtn = overlay.querySelector('#rw-close-btn') as HTMLButtonElement;

      const totalDuration = 5;
      const interval = setInterval(() => {
        countdown--;
        countdownEl.textContent = `${countdown}초 남음`;
        progressFill.style.width = `${((totalDuration - countdown) / totalDuration) * 100}%`;

        if (countdown <= 0) {
          clearInterval(interval);
          this.closeRewarded(overlay, true, resolve);
        }
      }, 1000);

      closeBtn.onclick = () => {
        audio.button();
        clearInterval(interval);
        this.closeRewarded(overlay, false, resolve);
      };
    });
  }

  private closeRewarded(overlay: HTMLElement, completed: boolean, resolve: (v: boolean) => void): void {
    this.rewardedActive = false;
    overlay.remove();
    resolve(completed);
  }

  isInterstitialActive(): boolean {
    return this.interstitialActive;
  }
}

export const adManager = new AdManager();
