export class SoundSystem {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.master = null;

    const unlock = () => {
      this.ensure();
      if (this.ctx?.state === 'suspended') this.ctx.resume().catch(() => {});
    };
    addEventListener('pointerdown', unlock, { passive: true });
    addEventListener('keydown', unlock, { passive: true });
  }

  ensure() {
    if (!this.enabled) return false;
    if (this.ctx) return true;

    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;

    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.14;
    this.master.connect(this.ctx.destination);
    return true;
  }

  tone({ freq = 440, type = 'sine', attack = 0.005, decay = 0.08, gain = 0.2, when = 0 }) {
    if (!this.ensure()) return;
    const t0 = this.ctx.currentTime + when;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);

    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);

    osc.connect(g);
    g.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + attack + decay + 0.01);
  }

  shoot() {
    this.tone({ freq: 540, type: 'triangle', attack: 0.002, decay: 0.05, gain: 0.16 });
    this.tone({ freq: 220, type: 'sine', attack: 0.001, decay: 0.04, gain: 0.07, when: 0.006 });
  }

  shootCharged(power = 1) {
    const p = Math.max(0, Math.min(1, power));
    this.tone({ freq: 340 + p * 180, type: 'sawtooth', attack: 0.004, decay: 0.14 + p * 0.12, gain: 0.18 });
    this.tone({ freq: 120 + p * 80, type: 'sine', attack: 0.002, decay: 0.16, gain: 0.08, when: 0.01 });
  }

  reloadStart() {
    this.tone({ freq: 260, type: 'square', attack: 0.002, decay: 0.05, gain: 0.08 });
    this.tone({ freq: 330, type: 'square', attack: 0.002, decay: 0.06, gain: 0.08, when: 0.045 });
  }

  reloadDone() {
    this.tone({ freq: 740, type: 'triangle', attack: 0.002, decay: 0.05, gain: 0.09 });
  }

  enemyDown() {
    this.tone({ freq: 190, type: 'sawtooth', attack: 0.003, decay: 0.11, gain: 0.1 });
  }
}
