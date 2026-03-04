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

    const el = document.getElementById('ad-interstitial');
    if (!el) return;
    el.innerHTML = `<div style="text-align:center"><h3 style="margin:0 0 8px">Interstitial Ad</h3><p style="margin:0;opacity:.85">(placement test)</p></div>`;
    el.style.display = 'flex';
    setTimeout(() => { el.style.display = 'none'; }, 1800);
  }

  async showRewarded() {
    const el = document.getElementById('ad-rewarded');
    if (!el) return false;

    el.innerHTML = `
      <div style="text-align:center;max-width:320px">
        <h3 style="margin:0 0 8px">Rewarded Ad</h3>
        <p id="ad-reward-text" style="margin:0 0 12px;opacity:.9">Loading ad…</p>
        <button id="ad-close-btn" style="display:none">Continue</button>
      </div>`;
    el.style.display = 'flex';

    await new Promise((r) => setTimeout(r, 1200));
    const txt = document.getElementById('ad-reward-text');
    if (txt) txt.textContent = 'Watching…';
    await new Promise((r) => setTimeout(r, 1800));
    if (txt) txt.textContent = 'Ad complete. Reward granted.';

    const btn = document.getElementById('ad-close-btn');
    if (!btn) {
      el.style.display = 'none';
      return true;
    }

    btn.style.display = 'inline-block';
    await new Promise((resolve) => {
      btn.onclick = () => resolve();
      btn.addEventListener('touchend', (e) => {
        e.preventDefault();
        resolve();
      }, { passive: false, once: true });
    });

    el.style.display = 'none';
    return true;
  }

  onMatchFinished() {
    this.matchesSinceInterstitial += 1;
    this.showInterstitial();
  }
}
