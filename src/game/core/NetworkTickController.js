export class NetworkTickController {
  constructor(game) {
    this.game = game;
  }

  sendPlayerStateIfNeeded(nowMs) {
    const game = this.game;
    if (!game.netClient?.connected) return;
    if (nowMs - game._lastNetStateAt <= 50) return;

    game._lastNetStateAt = nowMs;
    game.netClient.sendState({
      x: game.camera.position.x,
      z: game.camera.position.z,
      yaw: game.input.yaw,
    });
  }

  sendEnemySnapshotIfNeeded(nowMs) {
    const game = this.game;
    if (!game.netClient?.connected || !game.netClient.isHost) return;
    if (nowMs - game._lastEnemySnapAt <= 100) return;

    game._lastEnemySnapAt = nowMs;
    game.netClient.sendEnemySnapshot({
      stage: game.waves.stage,
      wave: game.waves.wave,
      enemies: game.enemyManager.enemies.map((enemy) => ({
        id: enemy.id,
        type: enemy.type,
        hp: enemy.hp,
        x: enemy.mesh.position.x,
        y: enemy.mesh.position.y,
        z: enemy.mesh.position.z,
        ry: enemy.mesh.rotation.y,
      })),
    });
  }
}
