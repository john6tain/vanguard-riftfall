import * as THREE from 'three';
import { dist2 } from '../../shared/math.js';

export class CombatController {
  constructor(game) {
    this.game = game;
  }

  spawnHealDrop(x, z) {
    const game = this.game;
    const healMaterial = new THREE.MeshBasicMaterial({ color: 0x22c55e });
    const healPickupMesh = new THREE.Group();

    const horizontalBar = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.18, 0.18), healMaterial);
    const verticalBar = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.8, 0.18), healMaterial);
    healPickupMesh.add(horizontalBar, verticalBar);

    healPickupMesh.position.set(x, 1.0, z);
    game.scene.add(healPickupMesh);
    game.healDrops.push({ mesh: healPickupMesh, value: 20, life: 14 });
  }

  shoot() {
    const game = this.game;
    if (game.player.fireCooldown > 0 || game.player.ammo <= 0) return;
    game.player.fireCooldown = 0.12;
    game.player.ammo--;

    game.camera.getWorldDirection(game.rayDir);
    const spread = 0.012 + Math.min(0.03, Math.max(0, game.player.fireCooldown) * 0.35);
    game.rayDir.x += (Math.random() - 0.5) * spread;
    game.rayDir.y += (Math.random() - 0.5) * spread * 0.7;
    game.rayDir.z += (Math.random() - 0.5) * spread;
    game.rayDir.normalize();

    const bulletMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xff8a00 }),
    );
    bulletMesh.position.copy(game.camera.position);
    bulletMesh.position.y = 1.5;

    game.scene.add(bulletMesh);
    game.bullets.push({
      mesh: bulletMesh,
      vx: game.rayDir.x * 80,
      vy: game.rayDir.y * 80,
      vz: game.rayDir.z * 80,
      life: 2.2,
      dmg: 28,
    });

    game.netClient?.sendShoot({
      x: bulletMesh.position.x,
      y: bulletMesh.position.y,
      z: bulletMesh.position.z,
      dx: game.rayDir.x,
      dy: game.rayDir.y,
      dz: game.rayDir.z,
    });
  }

  updateBullets(deltaTime, isJoinClient) {
    const game = this.game;
    for (const bullet of game.bullets) {
      bullet.mesh.position.x += bullet.vx * deltaTime;
      bullet.mesh.position.y += bullet.vy * deltaTime;
      bullet.mesh.position.z += bullet.vz * deltaTime;
      bullet.life -= deltaTime;
      if (game.enemyManager.pointHitsObstacle(bullet.mesh.position.x, bullet.mesh.position.z)) bullet.life = 0;

      if (isJoinClient) {
        this.handleJoinClientBulletHit(bullet);
        continue;
      }

      this.handleHostOrSoloBulletHit(bullet);
    }

    game.bullets = game.bullets.filter((bullet) => {
      if (bullet.life <= 0) {
        game.scene.remove(bullet.mesh);
        return false;
      }
      return true;
    });
  }

  handleJoinClientBulletHit(bullet) {
    const game = this.game;
    for (const enemy of game.enemyManager.enemies) {
      const deltaX = enemy.mesh.position.x - bullet.mesh.position.x;
      const deltaZ = enemy.mesh.position.z - bullet.mesh.position.z;
      const deltaY = enemy.mesh.position.y + 1.2 - bullet.mesh.position.y;
      if ((deltaX * deltaX + deltaZ * deltaZ + deltaY * deltaY) < Math.max(0.9, enemy.r * 1.1) ** 2) {
        game.netClient?.sendEnemyHit({ id: enemy.id, dmg: bullet.dmg || 28 });
        bullet.life = 0;
        break;
      }
    }
  }

  handleHostOrSoloBulletHit(bullet) {
    const game = this.game;
    for (const enemy of game.enemyManager.enemies) {
      const deltaX = enemy.mesh.position.x - bullet.mesh.position.x;
      const deltaZ = enemy.mesh.position.z - bullet.mesh.position.z;
      const deltaY = enemy.mesh.position.y + 1.2 - bullet.mesh.position.y;
      if ((deltaX * deltaX + deltaZ * deltaZ + deltaY * deltaY) < Math.max(0.9, enemy.r * 1.1) ** 2) {
        enemy.hp -= bullet.dmg;
        bullet.life = 0;

        let reflectedDamage = 2;
        if (game.player.shield > 0) {
          const absorbedDamage = Math.min(game.player.shield, reflectedDamage);
          game.player.shield -= absorbedDamage;
          reflectedDamage -= absorbedDamage;
        }
        if (reflectedDamage > 0) game.player.hp -= reflectedDamage;

        if (enemy.hp <= 0) {
          const wasGreen = enemy.type === 'green';
          game.scene.remove(enemy.mesh);
          game.enemyManager.enemies = game.enemyManager.enemies.filter((enemyEntry) => enemyEntry !== enemy);
          game.player.kills++;
          game.player.streak++;
          game.player.score += 100 + game.player.streak * 10;
          if (wasGreen) this.spawnHealDrop(enemy.mesh.position.x, enemy.mesh.position.z);
        }
        break;
      }
    }
  }

  updateHealDrops(deltaTime) {
    const game = this.game;
    game.healDrops = game.healDrops.filter((healDrop) => {
      healDrop.life -= deltaTime;
      healDrop.mesh.rotation.y += deltaTime * 2.8;
      healDrop.mesh.position.y = 1.0 + Math.sin((14 - healDrop.life) * 4) * 0.08;

      const isPlayerNearby = dist2(
        game.camera.position.x,
        game.camera.position.z,
        healDrop.mesh.position.x,
        healDrop.mesh.position.z,
      ) < 1.1 * 1.1;

      if (isPlayerNearby) {
        game.player.hp = Math.min(game.player.maxHp || 100, game.player.hp + healDrop.value);
        game.scene.remove(healDrop.mesh);
        return false;
      }

      if (healDrop.life <= 0) {
        game.scene.remove(healDrop.mesh);
        return false;
      }
      return true;
    });
  }
}
