import * as THREE from 'three';

export class RemoteSyncController {
  constructor(game) {
    this.game = game;
  }

  setNetClient(netClient) {
    const game = this.game;
    game.netClient = netClient;
    if (!game.netClient) return;

    game.netClient.onRemoteState = (id, state) => this.applyRemoteState(id, state);
    game.netClient.onRemoteShoot = (_fromPlayerId, data) => this.spawnRemoteBullet(data);
    game.netClient.onEnemySnapshot = (data) => this.applyEnemySnapshot(data);
    game.netClient.onEnemyHit = (fromPlayerId, data) => this.applyRemoteEnemyHit(fromPlayerId, data);
    game.netClient.onPlayerHit = (data) => this.applyLocalPlayerHit(data);
    game.netClient.onHealDrop = (data) => this.applyRemoteHealDrop(data);
    game.netClient.onMissionFailed = () => {
      game.gameOver = true;
      game.win = false;
    };

    if (!game.netClient.isHost) {
      for (const enemy of game.enemyManager.enemies) game.scene.remove(enemy.mesh);
      for (const shot of game.enemyManager.enemyShots) game.scene.remove(shot.mesh);
      game.enemyManager.enemies = [];
      game.enemyManager.enemyShots = [];
      game._waveStarted = true;
    }
  }

  ensureRemotePlayer(id) {
    const game = this.game;
    if (game.remotePlayers.has(id)) return game.remotePlayers.get(id);

    const rig = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.68, metalness: 0.12 });
    const armorMat = new THREE.MeshStandardMaterial({ color: 0x9a3412, roughness: 0.55, metalness: 0.22 });

    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.45, 6, 10), bodyMat);
    torso.position.y = 1.1;
    rig.add(torso);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 14), bodyMat);
    head.position.set(0, 1.75, 0.08);
    rig.add(head);

    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.12, 0.12), armorMat);
    visor.position.set(0, 1.73, 0.22);
    rig.add(visor);

    const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), new THREE.MeshBasicMaterial({ color: 0x9a3412 }));
    const eyeR = eyeL.clone();
    eyeL.position.set(-0.08, 1.73, 0.27);
    eyeR.position.set(0.08, 1.73, 0.27);
    rig.add(eyeL, eyeR);

    const armL = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.34, 4, 8), bodyMat);
    const armR = armL.clone();
    armL.position.set(-0.35, 1.1, 0);
    armR.position.set(0.35, 1.1, 0);
    rig.add(armL, armR);

    const legL = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.4, 4, 8), bodyMat);
    const legR = legL.clone();
    legL.position.set(-0.1, 0.45, 0);
    legR.position.set(0.1, 0.45, 0);
    rig.add(legL, legR);

    game.scene.add(rig);
    game.remotePlayers.set(id, rig);
    return rig;
  }

  applyRemoteState(id, state) {
    const game = this.game;
    if (!state || !Number.isFinite(state.x) || !Number.isFinite(state.z)) return;
    const player = this.ensureRemotePlayer(id);

    player.userData.alive = state.alive !== false;
    player.visible = player.userData.alive;

    // Clamp to arena bounds and run collision resolve so remote players don't appear to walk through walls.
    const px = Math.max(-155, Math.min(155, state.x));
    const pz = Math.max(-155, Math.min(155, state.z));
    player.position.set(px, 0, pz);
    game.collision?.resolveXZ(player.position, 0.55);

    // Remote rig mesh faces +Z, while camera/world forward uses -Z. Add PI so shots look forward, not backward.
    player.rotation.y = Number.isFinite(state.yaw) ? (state.yaw + Math.PI) : player.rotation.y;
  }

  spawnRemoteBullet(data) {
    const game = this.game;
    if (!data) return;
    const size = Number.isFinite(data.size) ? data.size : 0.12;
    const speed = Number.isFinite(data.speed) ? data.speed : 80;
    const life = Number.isFinite(data.life) ? data.life : 1.2;
    const color = Number.isFinite(data.color) ? data.color : 0xffffff;

    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(size, 8, 8),
      new THREE.MeshBasicMaterial({ color }),
    );
    mesh.position.set(data.x ?? 0, data.y ?? 1.5, data.z ?? 0);
    game.scene.add(mesh);
    game.bullets.push({
      mesh,
      vx: (data.dx ?? 0) * speed,
      vy: (data.dy ?? 0) * speed,
      vz: (data.dz ?? 0) * speed,
      life,
      dmg: 0,
      authoritativeHit: false,
    });
  }

  ensureReplicatedEnemy(id, type = 'red') {
    const game = this.game;
    if (game.remoteEnemies.has(id)) return game.remoteEnemies.get(id);

    const replicatedEnemyConfig = type === 'green'
      ? { color: 0x4ade80, r: 0.9 }
      : type === 'blue'
        ? { color: 0x60a5fa, r: 0.9 }
        : { color: 0xd85a5a, r: 0.9 };
    const mesh = game.enemyManager.createFallbackModel(replicatedEnemyConfig);
    const scale = type === 'green' ? 2.2 : type === 'blue' ? 1.4 : 1.8;
    mesh.scale.setScalar(scale);
    mesh.position.y = -0.15;
    game.scene.add(mesh);

    const enemy = { id, type, r: 0.9, hp: 100, mesh };
    game.remoteEnemies.set(id, enemy);
    return enemy;
  }

  applyEnemySnapshot(data) {
    const game = this.game;
    if (!data || !Array.isArray(data.enemies)) return;
    if (Number.isFinite(data.stage)) game.waves.stage = data.stage;
    if (Number.isFinite(data.wave)) game.waves.wave = data.wave;

    const seen = new Set();
    for (const snapshot of data.enemies) {
      if (!snapshot?.id) continue;
      seen.add(snapshot.id);
      const enemy = this.ensureReplicatedEnemy(snapshot.id, snapshot.type);
      enemy.type = snapshot.type || enemy.type;
      enemy.hp = Number.isFinite(snapshot.hp) ? snapshot.hp : enemy.hp;
      enemy.mesh.position.set(snapshot.x || 0, snapshot.y || -0.15, snapshot.z || 0);
      if (Number.isFinite(snapshot.ry)) enemy.mesh.rotation.y = snapshot.ry;
    }

    for (const [id, enemy] of game.remoteEnemies.entries()) {
      if (seen.has(id)) continue;
      game.scene.remove(enemy.mesh);
      game.remoteEnemies.delete(id);
    }

    game.enemyManager.enemies = [...game.remoteEnemies.values()];
  }

  applyRemoteEnemyHit(fromPlayerId, data) {
    const game = this.game;
    if (!game.netClient?.isHost) return;
    if (!data?.id) return;
    const enemy = game.enemyManager.enemies.find((x) => x.id === data.id);
    if (!enemy) return;

    enemy.hp -= Number(data.dmg || 28);
    enemy.aggroTargetId = fromPlayerId || enemy.aggroTargetId;
    enemy.aggroUntil = performance.now() + 5000;
    if (enemy.hp <= 0) {
      const wasGreen = enemy.type === 'green';
      game.scene.remove(enemy.mesh);
      game.enemyManager.enemies = game.enemyManager.enemies.filter((x) => x !== enemy);
      if (wasGreen) game.spawnHealDrop(enemy.mesh.position.x, enemy.mesh.position.z);
    }
  }

  applyLocalPlayerHit(data) {
    const game = this.game;
    const apply = () => {
      let damage = Number(data?.dmg || 0);
      if (damage <= 0) return;

      if (data?.kind === 'contact' && Number.isFinite(data.ex) && Number.isFinite(data.ez)) {
        const dx = game.camera.position.x - data.ex;
        const dz = game.camera.position.z - data.ez;
        if ((dx * dx + dz * dz) > 2.4 * 2.4) return;
      }

      if (game.player.shield > 0) {
        const absorbed = Math.min(game.player.shield, damage);
        game.player.shield -= absorbed;
        damage -= absorbed;
      }
      if (damage > 0) game.player.hp -= damage;
    };

    const delayMs = Number(data?.delayMs || 0);
    if (data?.kind === 'projectile' && delayMs > 0) {
      setTimeout(apply, Math.min(1200, delayMs));
      return;
    }

    apply();
  }

  applyRemoteHealDrop(data) {
    const game = this.game;
    if (!data || !Number.isFinite(data.x) || !Number.isFinite(data.z)) return;
    game.spawnHealDrop(data.x, data.z);
  }
}
