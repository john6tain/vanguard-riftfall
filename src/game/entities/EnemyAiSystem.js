import * as THREE from 'three';

export class EnemyAiSystem {
  constructor(scene, collision) {
    this.scene = scene;
    this.collision = collision;
    this.debugPathLines = new Map();
    const params = new URLSearchParams(globalThis.location?.search || '');
    this.showPathDebug = params.get('debugPaths') === '1';
    // Facing tweak for enemy model forward axis.
    this.facingOffset = 0;
  }

  updateEnemies(deltaTime, enemies, player, camera, enemyShots, targetActors = null, netClient = null, pointHitsObstacle = null) {
    for (const enemy of enemies) {
      const target = this.selectTarget(enemy, player, camera, targetActors);
      if (this.showPathDebug) this.updatePathDebug(enemy, target, pointHitsObstacle);
      const deltaX = target.x - enemy.mesh.position.x;
      const deltaZ = target.z - enemy.mesh.position.z;
      const distanceToPlayer = Math.hypot(deltaX, deltaZ) || 1;

      if (distanceToPlayer > 0.35) {
        this.moveTowardWithPathfind(
          enemy,
          deltaX / distanceToPlayer,
          deltaZ / distanceToPlayer,
          deltaTime,
          pointHitsObstacle,
          target.x,
          target.z,
        );
      }

      const isMoving = distanceToPlayer > 0.35;
      this.updateEnemyAnimation(enemy, deltaTime, isMoving);
      this.applyContactDamage(enemy, distanceToPlayer, deltaTime, player, target.isLocal, target.id, netClient);

      // Face movement direction to avoid visual "running backwards" when pathfinding steers.
      const face = (dx, dz) => {
        if (!Number.isFinite(dx) || !Number.isFinite(dz)) return;
        const len = Math.hypot(dx, dz);
        if (len < 0.0001) return;
        enemy.mesh.rotation.y = Math.atan2(dx, dz) + this.facingOffset;
      };

      if (isMoving && enemy._lastMoveDir) {
        face(enemy._lastMoveDir.x, enemy._lastMoveDir.z);
      } else {
        face(target.x - enemy.mesh.position.x, target.z - enemy.mesh.position.z);
      }
      enemy.shootCooldownRemaining -= deltaTime;
      if (distanceToPlayer < 55 && enemy.shootCooldownRemaining <= 0) {
        if (target.isLocal) {
          this.spawnEnemyProjectile(enemy, target, enemyShots);
          if (netClient?.isHost) {
            const shotId = `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
            const muzzleY = (enemy.mesh.position.y || 0) + 1.25;
            const aimX = target.x - enemy.mesh.position.x;
            const aimY = ((target.y ?? 1.7) + 0.2) - muzzleY;
            const aimZ = target.z - enemy.mesh.position.z;
            const aimLen = Math.hypot(aimX, aimY, aimZ) || 1;
            netClient.sendShoot({
              source: 'enemy',
              shotId,
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

          const shotId = `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
          netClient.sendShoot({
            source: 'enemy',
            shotId,
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
            shotId,
            delayMs: Math.min(900, Math.max(90, Math.round((aimLen / 24) * 1000))),
          });
          enemy.shootCooldownRemaining = enemy.shootCooldown + Math.random() * 0.35;
        }
      }
    }

    this.resolveEnemySeparation(enemies);

    const aliveIds = new Set(enemies.map((e) => e.id));
    for (const [id, line] of this.debugPathLines.entries()) {
      if (aliveIds.has(id)) continue;
      this.scene.remove(line);
      this.debugPathLines.delete(id);
    }
  }

  updatePathDebug(enemy, target, pointHitsObstacle) {
    if (!enemy?.id || !target) return;

    let line = this.debugPathLines.get(enemy.id);
    if (!line) {
      const geometry = new THREE.BufferGeometry();
      const material = new THREE.LineBasicMaterial({ color: 0xfacc15, transparent: true, opacity: 0.75 });
      line = new THREE.Line(geometry, material);
      this.scene.add(line);
      this.debugPathLines.set(enemy.id, line);
    }

    // Ground-level predicted path using same steering heuristic as movement.
    const points = [];
    const p = new THREE.Vector3(enemy.mesh.position.x, 0.12, enemy.mesh.position.z);
    points.push(p.clone());

    const step = 1.6;
    for (let i = 0; i < 20; i++) {
      const dx = target.x - p.x;
      const dz = target.z - p.z;
      const d = Math.hypot(dx, dz) || 1;
      if (d < 1.2) break;

      let dirX = dx / d;
      let dirZ = dz / d;

      const canStep = (vx, vz) => {
        const nx = p.x + vx * step;
        const nz = p.z + vz * step;
        return !pointHitsObstacle || !pointHitsObstacle(nx, nz);
      };

      if (!canStep(dirX, dirZ)) {
        const angles = [0.55, -0.55, 1.0, -1.0];
        let found = false;
        for (const a of angles) {
          const c = Math.cos(a), s = Math.sin(a);
          const rx = dirX * c - dirZ * s;
          const rz = dirX * s + dirZ * c;
          if (canStep(rx, rz)) {
            dirX = rx;
            dirZ = rz;
            found = true;
            break;
          }
        }
        if (!found) break;
      }

      p.x += dirX * step;
      p.z += dirZ * step;
      points.push(p.clone());
    }

    points.push(new THREE.Vector3(target.x, 0.12, target.z));
    line.geometry.setFromPoints(points);
    line.geometry.computeBoundingSphere();
  }

  moveTowardWithPathfind(enemy, dirX, dirZ, deltaTime, pointHitsObstacle, targetX, targetZ) {
    const step = enemy.speed * deltaTime;
    const radius = Math.max(0.7, enemy.r * 0.7);

    const canStep = (dx, dz, scale = 1) => {
      const nx = enemy.mesh.position.x + dx * step * scale;
      const nz = enemy.mesh.position.z + dz * step * scale;
      return !pointHitsObstacle || !pointHitsObstacle(nx, nz);
    };

    const candidates = [0, 0.35, -0.35, 0.7, -0.7, 1.05, -1.05, 1.4, -1.4];
    let best = null;

    for (const a of candidates) {
      const c = Math.cos(a), s = Math.sin(a);
      const rx = dirX * c - dirZ * s;
      const rz = dirX * s + dirZ * c;

      // Require immediate step + lookahead to reduce wall sliding.
      if (!canStep(rx, rz, 1)) continue;
      if (!canStep(rx, rz, 2.2)) continue;

      const nx = enemy.mesh.position.x + rx * step;
      const nz = enemy.mesh.position.z + rz * step;
      const d2 = (targetX - nx) ** 2 + (targetZ - nz) ** 2;

      // Favor progress to target and smaller turn angle.
      const score = d2 + Math.abs(a) * 0.9;
      if (!best || score < best.score) best = { rx, rz, score };
    }

    if (!best) return;

    enemy.mesh.position.x += best.rx * step;
    enemy.mesh.position.z += best.rz * step;
    enemy._lastMoveDir = { x: best.rx, z: best.rz };
    this.collision.resolveXZ(enemy.mesh.position, radius);
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
        const minimumDistance = Math.max(1.4, (firstEnemy.r + secondEnemy.r) * 0.95);
        if (distanceSquared > 0 && distanceSquared < minimumDistance * minimumDistance) {
          const distance = Math.sqrt(distanceSquared);
          const normalX = deltaX / distance;
          const normalZ = deltaZ / distance;
          const pushAmount = (minimumDistance - distance) * 0.75;
          firstEnemy.mesh.position.x -= normalX * pushAmount;
          firstEnemy.mesh.position.z -= normalZ * pushAmount;
          secondEnemy.mesh.position.x += normalX * pushAmount;
          secondEnemy.mesh.position.z += normalZ * pushAmount;
        }
      }
    }
  }
}
