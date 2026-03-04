import * as THREE from 'three';

export class EnemyFactory {
  constructor(scene, collision) {
    this.scene = scene;
    this.collision = collision;
  }

  getConfigByType(type) {
    return {
      red: { hp: 40, speed: 4.2, color: 0xd85a5a, bulletColor: 0xff6b6b, r: 0.9, attackDamage: 8, shootCooldown: 0.9 },
      blue: { hp: 72, speed: 5.6, color: 0x60a5fa, bulletColor: 0x60a5fa, r: 0.9, attackDamage: 12, shootCooldown: 0.55 },
      green: { hp: 150, speed: 3.0, color: 0x4ade80, bulletColor: 0x4ade80, r: 0.9, attackDamage: 18, shootCooldown: 1.2 },
    }[type];
  }

  createFallbackModel(enemyConfig) {
    const enemyGroup = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: enemyConfig.color, roughness: 0.7, metalness: 0.15 });
    const armorMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.6, metalness: 0.3 });

    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(enemyConfig.r * 0.35, enemyConfig.r * 0.65, 6, 10), bodyMat);
    torso.position.y = 1.1;
    enemyGroup.add(torso);

    const head = new THREE.Mesh(new THREE.SphereGeometry(enemyConfig.r * 0.23, 16, 16), bodyMat);
    head.position.set(0, 1.75, 0.08);
    enemyGroup.add(head);

    const visor = new THREE.Mesh(new THREE.BoxGeometry(enemyConfig.r * 0.35, enemyConfig.r * 0.12, enemyConfig.r * 0.12), armorMat);
    visor.position.set(0, 1.73, 0.22);
    enemyGroup.add(visor);

    const leftEye = new THREE.Mesh(new THREE.SphereGeometry(enemyConfig.r * 0.04, 8, 8), new THREE.MeshBasicMaterial({ color: 0x7dd3fc }));
    const rightEye = leftEye.clone();
    leftEye.position.set(-enemyConfig.r * 0.08, 1.73, 0.27);
    rightEye.position.set(enemyConfig.r * 0.08, 1.73, 0.27);
    enemyGroup.add(leftEye, rightEye);

    const leftArm = new THREE.Mesh(new THREE.CapsuleGeometry(enemyConfig.r * 0.08, enemyConfig.r * 0.38, 4, 8), bodyMat);
    const rightArm = leftArm.clone();
    leftArm.position.set(-enemyConfig.r * 0.45, 1.1, 0);
    rightArm.position.set(enemyConfig.r * 0.45, 1.1, 0);
    enemyGroup.add(leftArm, rightArm);

    const leftLeg = new THREE.Mesh(new THREE.CapsuleGeometry(enemyConfig.r * 0.1, enemyConfig.r * 0.42, 4, 8), bodyMat);
    const rightLeg = leftLeg.clone();
    leftLeg.position.set(-enemyConfig.r * 0.15, 0.25, 0);
    rightLeg.position.set(enemyConfig.r * 0.15, 0.25, 0);
    enemyGroup.add(leftLeg, rightLeg);

    enemyGroup.userData.anim = {
      armL: leftArm,
      armR: rightArm,
      legL: leftLeg,
      legR: rightLeg,
      phase: Math.random() * Math.PI * 2,
      bob: Math.random() * Math.PI * 2,
    };

    return enemyGroup;
  }

  createEnemy(type = 'red', spawnPosition = null) {
    const enemyConfig = this.getConfigByType(type);
    const mesh = this.createFallbackModel(enemyConfig);

    mesh.traverse?.((node) => {
      if (!node.isMesh) return;
      node.castShadow = true;
      node.receiveShadow = true;
      if (node.material?.color) node.material.color.setHex(enemyConfig.color);
    });

    if (!mesh.isMesh) {
      const classScale = type === 'green' ? 2.2 : type === 'blue' ? 1.4 : 1.8;
      mesh.scale.setScalar(classScale);
      mesh.position.y = 1.0;
    }

    if (spawnPosition && Number.isFinite(spawnPosition.x) && Number.isFinite(spawnPosition.z)) {
      mesh.position.set(spawnPosition.x, mesh.isMesh ? 0.0 : -0.15, spawnPosition.z);
    } else {
      const spawnAngle = Math.random() * Math.PI * 2;
      const spawnRadius = 90 + Math.random() * 55;
      mesh.position.set(Math.cos(spawnAngle) * spawnRadius, mesh.isMesh ? 0.0 : -0.15, Math.sin(spawnAngle) * spawnRadius);
    }
    this.collision.resolveXZ(mesh.position, Math.max(0.7, enemyConfig.r * 0.7));

    this.scene.add(mesh);
    const enemyId = `e_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;

    return {
      id: enemyId,
      ...enemyConfig,
      type,
      mesh,
      shootCooldownRemaining: Math.random() * enemyConfig.shootCooldown,
    };
  }
}
