export class WaveSystem {
  constructor(enemyManager, extractRing) {
    this.enemyManager = enemyManager;
    this.extractRing = extractRing;
    this.stage = 1;
    this.wave = 1;
    this.waveInProgress = false;
    this.nextWaveDelay = 0.8;
    this.holdWavesLeft = 3;
  }

  startWave() {
    this.enemyManager.startWave(this.wave, this.stage);
    this.waveInProgress = true;
  }

  onWaveCleared() {
    this.waveInProgress = false;
    this.nextWaveDelay = 1.2;
    if (this.stage === 1 && this.wave >= 3) this.stage = 2;
    else if (this.stage === 2) {
      this.holdWavesLeft -= 1;
      if (this.holdWavesLeft <= 0) {
        this.stage = 3;
        this.extractRing.visible = true;
      }
    }
    this.wave += 1;
  }

  update(dt, enemyCount) {
    if (this.waveInProgress && enemyCount === 0) this.onWaveCleared();
    if (!this.waveInProgress && this.stage !== 3) {
      this.nextWaveDelay -= dt;
      if (this.nextWaveDelay <= 0) this.startWave();
    }
  }
}
