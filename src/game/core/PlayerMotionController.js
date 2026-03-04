import * as THREE from 'three';

export class PlayerMotionController {
  constructor(game) {
    this.game = game;
  }

  updateCameraRotation() {
    const { input, camera } = this.game;
    if (input.isMobileTouch) {
      input.yaw -= input.mobileLook.x * 0.032;
      input.pitch -= input.mobileLook.y * 0.024;
      input.pitch = Math.max(-1.35, Math.min(1.35, input.pitch));
    }

    camera.rotation.order = 'YXZ';
    camera.rotation.y = input.yaw;
    camera.rotation.x = input.pitch;
  }

  updateMovement(deltaTime) {
    const game = this.game;
    const sprintMultiplier = game.input.keys.shift ? 1.18 : 1;
    const moveSpeed = game.player.speed * sprintMultiplier;

    const forwardDirection = new THREE.Vector3();
    game.camera.getWorldDirection(forwardDirection);
    forwardDirection.y = 0;
    if (forwardDirection.lengthSq() > 0) forwardDirection.normalize();

    const rightDirection = new THREE.Vector3(-forwardDirection.z, 0, forwardDirection.x);
    const moveDirection = new THREE.Vector3();

    if (game.input.keys.w || game.input.mobileMove.y < -0.15) moveDirection.add(forwardDirection);
    if (game.input.keys.s || game.input.mobileMove.y > 0.15) moveDirection.sub(forwardDirection);
    if (game.input.keys.d || game.input.mobileMove.x > 0.15) moveDirection.add(rightDirection);
    if (game.input.keys.a || game.input.mobileMove.x < -0.15) moveDirection.sub(rightDirection);

    if (moveDirection.lengthSq() > 0) {
      game.camera.position.add(moveDirection.normalize().multiplyScalar(moveSpeed * deltaTime));
    }

    game.collision.resolveXZ(game.camera.position, 0.55);
    game.player.updateVertical(deltaTime);
    game.player.fireCooldown = Math.max(0, game.player.fireCooldown - deltaTime);
  }

  resolvePlayerEnemyCollision() {
    const game = this.game;
    const playerRadius = 0.55;

    for (const enemy of game.enemyManager.enemies) {
      const enemyX = enemy.mesh.position.x;
      const enemyZ = enemy.mesh.position.z;
      const deltaX = game.camera.position.x - enemyX;
      const deltaZ = game.camera.position.z - enemyZ;
      const distanceSquared = deltaX * deltaX + deltaZ * deltaZ;
      const minimumDistance = playerRadius + Math.max(0.65, enemy.r * 0.75);

      if (distanceSquared > 0 && distanceSquared < minimumDistance * minimumDistance) {
        const distance = Math.sqrt(distanceSquared);
        const normalX = deltaX / distance;
        const normalZ = deltaZ / distance;
        const pushAmount = minimumDistance - distance;
        game.camera.position.x += normalX * pushAmount;
        game.camera.position.z += normalZ * pushAmount;
      }
    }
  }
}
