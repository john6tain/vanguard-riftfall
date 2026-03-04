import * as THREE from 'three';

export class EnemyAiSystem {
  constructor(scene, collision) {
    this.scene = scene;
    this.collision = collision;
  }

  updateEnemies(deltaTime, enemies, player, camera, enemyShots, targetActors = null, netClient = null, pointHitsObstacle = null) {
    for (const enemy of enemies) {
      const target = this.selectTarget(enemy, player, camera, targetActors);
      const deltaX = target.x - enemy.mesh.position.x;
      const deltaZ = target.z - enemy.mesh.position.z;
      const distanceToPlayer = Math.hypot(deltaX, deltaZ) || 1;

      if (distanceToPlayer > 0.35) {
        this.moveTowardWithPathfind(enemy, deltaX / distanceToPlayer, deltaZ / distanceToPlayer, deltaTime, pointHitsObstacle);
      }

      const isMoving = distanceToPlayer > 0.35;
      this.updateEnemyAnimation(enemy, deltaTime, isMoving);
      this.applyContactDamage(enemy, distanceToPlayer, deltaTime, player, target.isLocal, target.id, netClient);

      // Face chosen target and only shoot that same facing target.
      enemy.mesh.lookAt(target.x, enemy.mesh.position.y, target.z);
      enemy.shootCooldownRemaining -= deltaTime;
      if (distanceToPlayer < 55 && enemy.shootCooldownRemaining <= 0) {
        if (target.isLocal) {
          this.spawnEnemyProjectile(enemy, target, enemyShots);
          if (netClient?.isHost) {
            const muzzleY = (enemy.mesh.position.y || 0) + 1.25;
            const aimX = target.x - enemy.mesh.position.x;
            const aimY = ((target.y ?? 1.7) + 0.2) - muzzleY;
            const aimZ = target.z - enemy.mesh.position.z;
            const aimLen = Math.hypot(aimX, aimY, aimZ) || 1;
            netClient.sendShoot({
              source: 'enemy',
              x: enemy.mesh.position.x,
              y: muzzleY,
              z: enemy.mesh.position.z,
              dx: aimX / aimLen,
              dy: aimY / aimLen,
              dz: aimZ / aimLen,
              speed: 24,
              life: 2.0,
              size: 0.18,
              color: enemy.bulletColor || enemy.color || 0xff8a8a,
            });
          }
        } else if (target.id && netClient?.isHost) {
          const muzzleY = (enemy.mesh.position.y || 0) + 1.25;
          const aimX = target.x - enemy.mesh.position.x;
          const aimY = ((target.y ?? 1.7) + 0.2) - muzzleY;
          const aimZ = target.z - enemy.mesh.position.z;
          const aimLen = Math.hypot(aimX, aimY, aimZ) || 1;

          // Line-of-sight check on XZ to prevent "through-wall invisible hits".
          let blocked = false;
          if (pointHitsObstacle) {
            const steps = Math.max(4, Math.floor(aimLen / 2));
            for (let i = 1; i < steps; i++) {
              const t = i / steps;
              const sx = enemy.mesh.position.x + aimX * t;
              const sz = enemy.mesh.position.z + aimZ * t;
              if (pointHitsObstacle(sx, sz)) {
                blocked = true;
                break;
              }
            }
          }
          if (blocked) continue;

          netClient.sendShoot({
            source: 'enemy',
            x: enemy.mesh.position.x,
            y: muzzleY,
            z: enemy.mesh.position.z,
            dx: aimX / aimLen,
            dy: aimY / aimLen,
            dz: aimZ / aimLen,
            speed: 24,
            life: 2.0,
            size: 0.18,
            color: enemy.bulletColor || enemy.color || 0xff8a8a,
          });

          netClient.sendPlayerHit({
            targetId: target.id,
            dmg: enemy.attackDamage,
            kind: 'projectile',
            delayMs: Math.min(900, Math.max(90, Math.round((aimLen / 24) * 1000))),
          });
          enemy.shootCooldownRemaining = enemy.shootCooldown + Math.random() * 0.35;
        }
      }
    }

    this.resolveEnemySeparation(enemies);
  }

  moveTowardWithPathfind(enemy, dirX, dirZ, deltaTime, pointHitsObstacle) {
    const step = enemy.speed * deltaTime;
    const radius = Math.max(0.7, enemy.r * 0.7);

    const tryStep = (dx, dz) => {
      const nx = enemy.mesh.position.x + dx * step;
      const nz = enemy.mesh.position.z + dz * step;
      if (pointHitsObstacle && pointHitsObstacle(nx, nz)) return false;
      enemy.mesh.position.x = nx;
      enemy.mesh.position.z = nz;
      this.collision.resolveXZ(enemy.mesh.position, radius);
      return true;
    };

    // direct path
    if (tryStep(dirX, dirZ)) return;

    // simple steering alternatives (pathfind-lite)
    const angles = [0.55, -0.55, 1.0, -1.0];
    for (const a of angles) {
      const c = Math.cos(a), s = Math.sin(a);
      const rx = dirX * c - dirZ * s;
      const rz = dirX * s + dirZ * c;
      if (tryStep(rx, rz)) return;
    }
  }

  selectTarget(enemy, player, camera, targetActors) {
    const localTarget = {
      id: 'local',
      x: camera.position.x,
      z: camera.position.z,
      y: camera.position.y,
      isLocal: true,
    };

    if (!Array.isArray(targetActors) || targetActors.length === 0) return localTarget;

    if (enemy.aggroTargetId && Number.isFinite(enemy.aggroUntil) && performance.now() < enemy.aggroUntil) {
      const aggro = targetActors.find((a) => a?.id === enemy.aggroTargetId);
      if (aggro && Number.isFinite(aggro.x) && Number.isFinite(aggro.z)) {
        return {
          id: aggro.id,
          x: aggro.x,
          z: aggro.z,
          y: Number.isFinite(aggro.y) ? aggro.y : camera.position.y,
          isLocal: !!aggro.isLocal,
        };
      }
    }

    let best = localTarget;
    let bestD2 = (localTarget.x - enemy.mesh.position.x) ** 2 + (localTarget.z - enemy.mesh.position.z) ** 2;

    for (const actor of targetActors) {
      if (!actor || !Number.isFinite(actor.x) || !Number.isFinite(actor.z)) continue;
      const d2 = (actor.x - enemy.mesh.position.x) ** 2 + (actor.z - enemy.mesh.position.z) ** 2;
      if (d2 < bestD2) {
        bestD2 = d2;
        best = {
          id: actor.id,
          x: actor.x,
          z: actor.z,
          y: Number.isFinite(actor.y) ? actor.y : camera.position.y,
          isLocal: !!actor.isLocal,
        };
      }
    }

    return best;
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

  applyContactDamage(enemy, distanceToPlayer, deltaTime, player, isLocalTarget, targetId, netClient) {
    const contactRange = Math.max(1.0, enemy.r * 0.95);
    if (distanceToPlayer >= contactRange) return;

    const baseContactDamage = (enemy.type === 'green' ? 28 : enemy.type === 'blue' ? 21 : 18) * deltaTime;

    if (isLocalTarget) {
      let contactDamage = baseContactDamage;
      if (player.shield > 0) {
        const absorbedDamage = Math.min(player.shield, contactDamage);
        player.shield -= absorbedDamage;
        contactDamage -= absorbedDamage;
      }
      if (contactDamage > 0) player.hp -= contactDamage;
      return;
    }

    // Host-authoritative contact damage for remote targeted player (throttled).
    if (targetId && netClient?.isHost) {
      enemy._remoteContactCd = Math.max(0, (enemy._remoteContactCd || 0) - deltaTime);
      if (enemy._remoteContactCd <= 0) {
        netClient.sendPlayerHit({
          targetId,
          dmg: Math.max(1, Math.round(baseContactDamage * 8)),
          kind: 'contact',
          ex: enemy.mesh.position.x,
          ez: enemy.mesh.position.z,
        });
        enemy._remoteContactCd = 0.2;
      }
    }
  }

  spawnEnemyProjectile(enemy, target, enemyShots) {
    const muzzleY = (enemy.mesh.position.y || 0) + 1.25;
    const aimDirection = new THREE.Vector3(
      target.x - enemy.mesh.position.x,
      ((target.y ?? 1.7) + 0.2) - muzzleY,
      target.z - enemy.mesh.position.z,
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
