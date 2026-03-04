export class AdManager {
  constructor() {
    this.matchesSinceInterstitial = 0;
    this.lastInterstitialAt = 0;
    this.minInterstitialMs = 90_000;
  }

  init() {
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch {}
    console.log('[ads] adsense init');
  }

  canShowInterstitial() {
    const now = Date.now();
    return this.matchesSinceInterstitial >= 3 && (now - this.lastInterstitialAt) > this.minInterstitialMs;
  }

  showInterstitial() {
    if (!this.canShowInterstitial()) return;
    this.lastInterstitialAt = Date.now();
    this.matchesSinceInterstitial = 0;

    const interstitialElement = document.getElementById('ad-interstitial');
    if (!interstitialElement) return;
    interstitialElement.innerHTML = `<div style="text-align:center"><h3 style="margin:0 0 8px">Interstitial Ad</h3><p style="margin:0;opacity:.85">(placement test)</p></div>`;
    interstitialElement.style.display = 'flex';
    setTimeout(() => { interstitialElement.style.display = 'none'; }, 1800);
  }

  async showRewarded() {
    const rewardedElement = document.getElementById('ad-rewarded');
    if (!rewardedElement) return false;

    rewardedElement.innerHTML = `
      <div style="text-align:center;max-width:320px">
        <h3 style="margin:0 0 8px">Rewarded Ad</h3>
        <p id="ad-reward-text" style="margin:0 0 12px;opacity:.9">Loading ad...</p>
        <button id="ad-close-btn" style="display:none">Continue</button>
      </div>`;
    rewardedElement.style.display = 'flex';

    await new Promise((resolveDelay) => setTimeout(resolveDelay, 1200));
    const rewardStatusText = document.getElementById('ad-reward-text');
    if (rewardStatusText) rewardStatusText.textContent = 'Watching...';
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 1800));
    if (rewardStatusText) rewardStatusText.textContent = 'Ad complete. Reward granted.';

    const continueButton = document.getElementById('ad-close-btn');
    if (!continueButton) {
      rewardedElement.style.display = 'none';
      return true;
    }

    continueButton.style.display = 'inline-block';
    await new Promise((resolve) => {
      continueButton.onclick = () => resolve();
      continueButton.addEventListener('touchend', (touchEvent) => {
        touchEvent.preventDefault();
        resolve();
      }, { passive: false, once: true });
    });

    rewardedElement.style.display = 'none';
    return true;
  }

  onMatchFinished() {
    this.matchesSinceInterstitial += 1;
    this.showInterstitial();
  }
}
