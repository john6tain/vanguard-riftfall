import { dist2 } from '../../shared/math.js';

export class EnemyProjectileSystem {
  constructor(scene, obstacles) {
    this.scene = scene;
    this.obstacles = obstacles;
    this.shieldRechargeTimer = null;
  }

  updateProjectiles(deltaTime, enemyShots, player, camera) {
    for (const projectile of enemyShots) {
      projectile.mesh.position.x += projectile.vx * deltaTime;
      projectile.mesh.position.y += (projectile.vy || 0) * deltaTime;
      projectile.mesh.position.z += projectile.vz * deltaTime;
      projectile.life -= deltaTime;

      if (this.pointHitsObstacle(projectile.mesh.position.x, projectile.mesh.position.z)) {
        projectile.life = 0;
      }

      if (dist2(projectile.mesh.position.x, projectile.mesh.position.z, camera.position.x, camera.position.z) < 0.8 * 0.8) {
        this.applyProjectileDamage(projectile, player);
      }
    }
  }

  applyProjectileDamage(projectile, player) {
    if (this.shieldRechargeTimer) clearInterval(this.shieldRechargeTimer);

    let damage = projectile.dmg;
    if (player.shield > 0) {
      const absorbedDamage = Math.min(player.shield, damage);
      player.shield -= absorbedDamage;
      damage -= absorbedDamage;
    }
    player.hp -= damage;
    projectile.life = 0;
    player.canRechargeShield = false;

    this.shieldRechargeTimer = setInterval(() => {
      player.canRechargeShield = true;
      clearInterval(this.shieldRechargeTimer);
      this.shieldRechargeTimer = null;
    }, 10000);
  }

  cleanupExpiredProjectiles(enemyShots) {
    return enemyShots.filter((projectile) => {
      if (projectile.life <= 0) {
        this.scene.remove(projectile.mesh);
        return false;
      }
      return true;
    });
  }

  pointHitsObstacle(px, pz) {
    for (const obstacle of this.obstacles) {
      const obstacleSize = obstacle.userData.size;
      if (!obstacleSize) continue;
      if (
        px > obstacle.position.x - obstacleSize.w / 2 &&
        px < obstacle.position.x + obstacleSize.w / 2 &&
        pz > obstacle.position.z - obstacleSize.d / 2 &&
        pz < obstacle.position.z + obstacleSize.d / 2
      ) return true;
    }
    return false;
  }
}
