import * as THREE from 'three';

export class EnemyAiSystem {
  constructor(scene, collision) {
    this.scene = scene;
    this.collision = collision;
  }

  updateEnemies(deltaTime, enemies, player, camera, enemyShots) {
    for (const enemy of enemies) {
      const deltaX = camera.position.x - enemy.mesh.position.x;
      const deltaZ = camera.position.z - enemy.mesh.position.z;
      const distanceToPlayer = Math.hypot(deltaX, deltaZ) || 1;

      if (distanceToPlayer > 0.35) {
        enemy.mesh.position.x += (deltaX / distanceToPlayer) * enemy.speed * deltaTime;
        enemy.mesh.position.z += (deltaZ / distanceToPlayer) * enemy.speed * deltaTime;
        this.collision.resolveXZ(enemy.mesh.position, Math.max(0.7, enemy.r * 0.7));
      }

      const isMoving = distanceToPlayer > 0.35;
      this.updateEnemyAnimation(enemy, deltaTime, isMoving);
      this.applyContactDamage(enemy, distanceToPlayer, deltaTime, player);

      enemy.mesh.lookAt(camera.position.x, enemy.mesh.position.y, camera.position.z);
      enemy.shootCooldownRemaining -= deltaTime;
      if (distanceToPlayer < 55 && enemy.shootCooldownRemaining <= 0) {
        this.spawnEnemyProjectile(enemy, camera, enemyShots);
      }
    }

    this.resolveEnemySeparation(enemies);
  }

  updateEnemyAnimation(enemy, deltaTime, isMoving) {
    const anim = enemy.mesh.userData?.anim;
    if (!anim) return;

    const animationSpeed = Math.max(0.6, enemy.speed * 0.8);
    anim.phase += deltaTime * animationSpeed * (isMoving ? 7.5 : 2.0);
    const limbSwing = isMoving ? 0.65 : 0.12;
    anim.legL.rotation.x = Math.sin(anim.phase) * limbSwing;
    anim.legR.rotation.x = -Math.sin(anim.phase) * limbSwing;
    anim.armL.rotation.x = -Math.sin(anim.phase) * limbSwing * 0.7;
    anim.armR.rotation.x = Math.sin(anim.phase) * limbSwing * 0.7;
    anim.bob += deltaTime * (isMoving ? 8 : 2);
    enemy.mesh.position.y = -0.15 + Math.abs(Math.sin(anim.bob)) * (isMoving ? 0.05 : 0.01);
  }

  applyContactDamage(enemy, distanceToPlayer, deltaTime, player) {
    const contactRange = Math.max(1.0, enemy.r * 0.95);
    if (distanceToPlayer >= contactRange) return;

    let contactDamage = (enemy.type === 'green' ? 28 : enemy.type === 'blue' ? 21 : 18) * deltaTime;
    if (player.shield > 0) {
      const absorbedDamage = Math.min(player.shield, contactDamage);
      player.shield -= absorbedDamage;
      contactDamage -= absorbedDamage;
    }
    if (contactDamage > 0) player.hp -= contactDamage;
  }

  spawnEnemyProjectile(enemy, camera, enemyShots) {
    const muzzleY = (enemy.mesh.position.y || 0) + 1.25;
    const aimDirection = new THREE.Vector3(
      camera.position.x - enemy.mesh.position.x,
      (camera.position.y + 0.2) - muzzleY,
      camera.position.z - enemy.mesh.position.z,
    ).normalize();

    const projectile = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 8, 8),
      new THREE.MeshBasicMaterial({ color: enemy.bulletColor || enemy.color || 0xff8a8a }),
    );
    projectile.position.set(enemy.mesh.position.x, muzzleY, enemy.mesh.position.z);
    this.scene.add(projectile);
    enemyShots.push({
      mesh: projectile,
      vx: aimDirection.x * 24,
      vy: aimDirection.y * 24,
      vz: aimDirection.z * 24,
      dmg: enemy.attackDamage,
      life: 3,
    });
    enemy.shootCooldownRemaining = enemy.shootCooldown + Math.random() * 0.35;
  }

  resolveEnemySeparation(enemies) {
    for (let i = 0; i < enemies.length; i++) {
      for (let j = i + 1; j < enemies.length; j++) {
        const firstEnemy = enemies[i];
        const secondEnemy = enemies[j];
        const deltaX = secondEnemy.mesh.position.x - firstEnemy.mesh.position.x;
        const deltaZ = secondEnemy.mesh.position.z - firstEnemy.mesh.position.z;
        const distanceSquared = deltaX * deltaX + deltaZ * deltaZ;
        const minimumDistance = Math.max(0.8, (firstEnemy.r + secondEnemy.r) * 0.55);
        if (distanceSquared > 0 && distanceSquared < minimumDistance * minimumDistance) {
          const distance = Math.sqrt(distanceSquared);
          const normalX = deltaX / distance;
          const normalZ = deltaZ / distance;
          const pushAmount = (minimumDistance - distance) * 0.5;
          firstEnemy.mesh.position.x -= normalX * pushAmount;
          firstEnemy.mesh.position.z -= normalZ * pushAmount;
          secondEnemy.mesh.position.x += normalX * pushAmount;
          secondEnemy.mesh.position.z += normalZ * pushAmount;
        }
      }
    }
  }
}
