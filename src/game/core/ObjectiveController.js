import { dist2 } from '../../shared/math.js';

export class ObjectiveController {
  constructor(game) {
    this.game = game;
  }

  updateExtractObjective(deltaTime) {
    const game = this.game;
    if (game.waves.stage !== 3) return;

    game.extractRing.rotation.z += deltaTime * 0.8;
    const isInExtractZone = dist2(
      game.camera.position.x,
      game.camera.position.z,
      game.extractPoint.x,
      game.extractPoint.z,
    ) < 36;

    if (isInExtractZone) {
      game.gameOver = true;
      game.win = true;
    }
  }
}
