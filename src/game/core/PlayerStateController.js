export class PlayerStateController {
  constructor(game) {
    this.game = game;
  }

  updateSurvival(deltaTime) {
    const game = this.game;

    if (game.player.canRechargeShield) {
      game.player.shield = Math.min(game.player.maxShield, game.player.shield + 5.2 * deltaTime);
    }

    if (game.player.hp > 0) return;

    game.gameOver = true;
    game.win = false;
    if (game.netClient?.connected && game.netClient.isHost && !game._sentMissionFailed) {
      game._sentMissionFailed = true;
      game.netClient.sendMissionFailed({ reason: 'host_down' });
    }
  }
}
