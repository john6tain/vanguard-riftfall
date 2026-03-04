export class GameUiController {
  constructor(game) {
    this.game = game;
    this.game.messageOverlay = document.getElementById('msg');
  }

  bindStartOverlay() {
    const game = this.game;
    const startButton = document.getElementById('startBtn');
    const startDeployment = () => {
      if (document.fullscreenElement == null && document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(() => {});
      }
      if (game.input.isMobileTouch) {
        game.input.locked = true;
      } else if (!game.freeCam) {
        game.renderer.domElement.requestPointerLock();
      }
      game.paused = false;
      game.messageOverlay.style.display = 'none';
    };

    startButton.onclick = startDeployment;
    startButton.addEventListener('touchend', (touchEvent) => {
      touchEvent.preventDefault();
      touchEvent.stopPropagation();
      startDeployment();
    }, { passive: false });

    addEventListener('keydown', (keyboardEvent) => {
      if (keyboardEvent.key === 'Escape' && !game.gameOver) {
        keyboardEvent.preventDefault();
        this.togglePause();
      }
    });
  }

  pauseGame() {
    const game = this.game;
    if (game.paused || game.gameOver) return;
    game.paused = true;
    game.input.mouseDown = false;
    if (!game.input.isMobileTouch && document.pointerLockElement) document.exitPointerLock();
    game.messageOverlay.style.display = 'block';
    game.messageOverlay.innerHTML = '<h2>Paused</h2><p>Press Esc to resume.</p><button id="resumeBtn">Resume</button>';
    const resume = document.getElementById('resumeBtn');
    resume?.addEventListener('click', () => this.resumeGame());
    resume?.addEventListener('touchend', (touchEvent) => {
      touchEvent.preventDefault();
      this.resumeGame();
    }, { passive: false });
  }

  resumeGame() {
    const game = this.game;
    if (!game.paused || game.gameOver) return;
    game.paused = false;
    game.messageOverlay.style.display = 'none';
    if (game.input.isMobileTouch) {
      game.input.locked = true;
    } else {
      game.renderer.domElement.requestPointerLock?.();
    }
  }

  togglePause() {
    if (this.game.paused) this.resumeGame();
    else this.pauseGame();
  }

  updateHud() {
    const game = this.game;
    game.hud.health.textContent = Math.max(0, game.player.hp | 0);
    game.hud.shield.textContent = game.player.shield | 0;
    game.hud.ammo.textContent = game.player.ammo;
    game.hud.kills.textContent = game.player.kills;
    game.hud.score.textContent = game.player.score | 0;
    game.hud.streak.textContent = game.enemyManager.enemies.length | 0;
    game.hud.stage.textContent = game.waves.stage === 1
      ? `Breach - Wave ${game.waves.wave}`
      : game.waves.stage === 2
        ? `Hold - ${game.waves.holdWavesLeft} waves left`
        : 'Extract';
  }

  maybeShowGameOver() {
    const game = this.game;
    if (!game.gameOver || game.finished) return;
    game.finished = true;
    game.ads.onMatchFinished();
    game.messageOverlay.style.display = 'block';
    game.messageOverlay.innerHTML = `
      <h2>${game.win ? 'Mission Complete' : 'Mission Failed'}</h2>
      <p>Score: ${game.player.score | 0} - Kills: ${game.player.kills}</p>
      <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
        <button id="redeployBtn">Redeploy</button>
        <button id="rewardBtn">Watch Ad +250 Score</button>
      </div>`;

    const redeployButton = document.getElementById('redeployBtn');
    redeployButton?.addEventListener('click', () => location.reload());
    redeployButton?.addEventListener('touchend', (touchEvent) => {
      touchEvent.preventDefault();
      location.reload();
    }, { passive: false });

    const rewardButton = document.getElementById('rewardBtn');
    rewardButton?.addEventListener('click', async () => {
      rewardButton.disabled = true;
      const rewardGranted = await game.ads.showRewarded();
      if (rewardGranted) {
        game.player.score += 250;
        game.hud.score.textContent = game.player.score | 0;
        rewardButton.textContent = 'Reward claimed';
      }
    });
  }
}
