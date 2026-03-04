import * as THREE from 'three';
import {GLTFLoader} from 'https://unpkg.com/three@0.161.0/examples/jsm/loaders/GLTFLoader.js';
import {dist2} from '../utils/math.js';

export class EnemyManager {
    constructor(scene, obstacles, collision) {
        this.scene = scene;
        this.obstacles = obstacles;
        this.collision = collision;
        this.enemies = [];
        this.enemyShots = [];

        this.loader = new GLTFLoader();
        this.modelCache = new Map();
        // this.classModelPath = {
        //     lancer: './assets/models/lancer.glb',
        //     specter: './assets/models/specter.glb',
        //     brute: './assets/models/brute.glb',
        // };

        // Best-effort preload hook (kept even when GLBs are disabled) so callers can safely await readiness.
        this.readyPromise = Promise.resolve();
    }

    async preloadModel(path) {
        if (!path || this.modelCache.has(path)) return;
        try {
            const gltf = await this.loader.loadAsync(path);
            const root = gltf.scene || gltf.scenes?.[0];
            if (root) this.modelCache.set(path, root);
        } catch {
            // ignore: fallback model will be used
        }
    }

    cloneModelOrNull(type) {
        // Temporary hard-disable GLB usage for stability (models were spawning invisible).
        // Keep loader code in place for later re-enable.
        return null;
    }

    createFallbackModel(cfg) {
        // Non-round procedural enemy (head/torso/limbs/eyes) so fallback remains readable
        const g = new THREE.Group();
        const bodyMat = new THREE.MeshStandardMaterial({color: cfg.color, roughness: 0.7, metalness: 0.15});
        const armorMat = new THREE.MeshStandardMaterial({color: 0x475569, roughness: 0.6, metalness: 0.3});

        const torso = new THREE.Mesh(new THREE.CapsuleGeometry(cfg.r * 0.35, cfg.r * 0.65, 6, 10), bodyMat);
        torso.position.y = 1.1;
        g.add(torso);

        const head = new THREE.Mesh(new THREE.SphereGeometry(cfg.r * 0.23, 16, 16), bodyMat);
        head.position.set(0, 1.75, 0.08);
        g.add(head);

        const visor = new THREE.Mesh(new THREE.BoxGeometry(cfg.r * 0.35, cfg.r * 0.12, cfg.r * 0.12), armorMat);
        visor.position.set(0, 1.73, 0.22);
        g.add(visor);

        const eyeL = new THREE.Mesh(new THREE.SphereGeometry(cfg.r * 0.04, 8, 8), new THREE.MeshBasicMaterial({color: 0x7dd3fc}));
        const eyeR = eyeL.clone();
        eyeL.position.set(-cfg.r * 0.08, 1.73, 0.27);
        eyeR.position.set(cfg.r * 0.08, 1.73, 0.27);
        g.add(eyeL, eyeR);

        const armL = new THREE.Mesh(new THREE.CapsuleGeometry(cfg.r * 0.08, cfg.r * 0.38, 4, 8), bodyMat);
        const armR = armL.clone();
        armL.position.set(-cfg.r * 0.45, 1.1, 0);
        armR.position.set(cfg.r * 0.45, 1.1, 0);
        g.add(armL, armR);

        const legL = new THREE.Mesh(new THREE.CapsuleGeometry(cfg.r * 0.1, cfg.r * 0.42, 4, 8), bodyMat);
        const legR = legL.clone();
        legL.position.set(-cfg.r * 0.15, 0.25, 0);
        legR.position.set(cfg.r * 0.15, 0.25, 0);
        g.add(legL, legR);

        g.userData.anim = {
            armL,
            armR,
            legL,
            legR,
            phase: Math.random() * Math.PI * 2,
            bob: Math.random() * Math.PI * 2,
        };

        return g;
    }

    spawn(type = 'red') {
        const cfg = {
            red: {hp: 40, spd: 3.2, color: 0xd85a5a, bulletColor: 0xff6b6b, r: 0.9, atk: 8, cd: 0.9},
            blue: {hp: 72, spd: 4.4, color: 0x60a5fa, bulletColor: 0x60a5fa, r: 0.9, atk: 12, cd: 0.55},
            green: {hp: 150, spd: 2.1, color: 0x4ade80, bulletColor: 0x4ade80, r: 0.9, atk: 18, cd: 1.2},
        }[type];

        const mesh =  this.createFallbackModel(cfg);
        mesh.traverse?.((n) => {
            if (!n.isMesh) return;
            n.castShadow = true;
            n.receiveShadow = true;
            if (n.material?.color) n.material.color.setHex(cfg.color);
        });
        if (!mesh.isMesh) {
            // Stable class scales for imported models (avoid bbox glitches causing invisibility)
            const s = type === 'green' ? 2.2 : type === 'blue' ? 1.4 : 1.8;
            mesh.scale.setScalar(s);
            mesh.position.y = 1.0;
        }

        const a = Math.random() * Math.PI * 2;
        const r = 90 + Math.random() * 55;
        // grounded spawn height (group fallback needed slight downward offset)
        mesh.position.set(Math.cos(a) * r, mesh.isMesh ? 0.0 : -0.15, Math.sin(a) * r);
        this.collision.resolveXZ(mesh.position, Math.max(0.7, cfg.r * 0.7));

        this.scene.add(mesh);
        this.enemies.push({...cfg, type, mesh, shootCd: Math.random() * cfg.cd});
    }

    startWave(wave, stage) {
        const stageMul = stage === 1 ? 1 : stage === 2 ? 1.15 : 1.3;
        const count = Math.floor((6 + wave * 2) * stageMul);
        for (let i = 0; i < count; i++) {
            const t = Math.random();
            this.spawn(t < 0.2 ? 'green' : t < 0.45 ? 'blue' : 'red');
        }
    }

    update(dt, player, camera) {
        let hitInterval;
        for (const e of this.enemies) {
            const dx = camera.position.x - e.mesh.position.x;
            const dz = camera.position.z - e.mesh.position.z;
            const d = Math.hypot(dx, dz) || 1;
            // Always chase the player.
            if (d > 0.35) {
                e.mesh.position.x += (dx / d) * e.spd * dt;
                e.mesh.position.z += (dz / d) * e.spd * dt;
                this.collision.resolveXZ(e.mesh.position, Math.max(0.7, e.r * 0.7));
            }

            const moved = d > 0.35;
            const anim = e.mesh.userData?.anim;
            if (anim) {
                const speed = Math.max(0.6, e.spd * 0.8);
                anim.phase += dt * speed * (moved ? 7.5 : 2.0);
                const swing = moved ? 0.65 : 0.12;
                anim.legL.rotation.x = Math.sin(anim.phase) * swing;
                anim.legR.rotation.x = -Math.sin(anim.phase) * swing;
                anim.armL.rotation.x = -Math.sin(anim.phase) * swing * 0.7;
                anim.armR.rotation.x = Math.sin(anim.phase) * swing * 0.7;
                anim.bob += dt * (moved ? 8 : 2);
                e.mesh.position.y = -0.15 + Math.abs(Math.sin(anim.bob)) * (moved ? 0.05 : 0.01);
            }

            // Contact collision: enemy body touching player causes melee damage over time.
            const contactRange = Math.max(1.0, e.r * 0.95);
            if (d < contactRange) {
                let touchDmg = (e.type === 'green' ? 28 : e.type === 'blue' ? 21 : 18) * dt;
                if (player.shield > 0) {
                    const absorbed = Math.min(player.shield, touchDmg);
                    player.shield -= absorbed;
                    touchDmg -= absorbed;
                }
                if (touchDmg > 0) player.hp -= touchDmg;
            }

            e.mesh.lookAt(camera.position.x, e.mesh.position.y, camera.position.z);
            e.shootCd -= dt;
            if (d < 55 && e.shootCd <= 0) {
                const muzzleY = (e.mesh.position.y || 0) + 1.25;
                const aim = new THREE.Vector3(camera.position.x - e.mesh.position.x, (camera.position.y + 0.2) - muzzleY, camera.position.z - e.mesh.position.z).normalize();

                const shot = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8), new THREE.MeshBasicMaterial({color: e.bulletColor || e.color || 0xff8a8a}));
                shot.position.set(e.mesh.position.x, muzzleY, e.mesh.position.z);
                this.scene.add(shot);
                this.enemyShots.push({mesh: shot, vx: aim.x * 24, vy: aim.y * 24, vz: aim.z * 24, dmg: e.atk, life: 3});
                e.shootCd = e.cd + Math.random() * 0.35;
            }
        }

        for (const s of this.enemyShots) {
            s.mesh.position.x += s.vx * dt;
            s.mesh.position.y += (s.vy || 0) * dt;
            s.mesh.position.z += s.vz * dt;
            s.life -= dt;
            if (this.pointHitsObstacle(s.mesh.position.x, s.mesh.position.z)) s.life = 0;
            if (dist2(s.mesh.position.x, s.mesh.position.z, camera.position.x, camera.position.z) < 0.8 * 0.8) {
                clearInterval(hitInterval);
                let d = s.dmg;
                if (player.shield > 0) {
                    const t = Math.min(player.shield, d);
                    player.shield -= t;
                    d -= t;
                }
                player.hp -= d;
                s.life = 0;
                player.canRechargeShild = false;
                hitInterval = setInterval(() => {
                    player.canRechargeShild = true;
                    console.log('shild recharging');
                    clearInterval(hitInterval);
                }, 10000);
            }
        }

        this.enemyShots = this.enemyShots.filter((s) => {
            if (s.life <= 0) {
                this.scene.remove(s.mesh);
                return false;
            }
            return true;
        });

        // enemy-enemy separation
        for (let i = 0; i < this.enemies.length; i++) {
            for (let j = i + 1; j < this.enemies.length; j++) {
                const a = this.enemies[i], b = this.enemies[j];
                const dx = b.mesh.position.x - a.mesh.position.x;
                const dz = b.mesh.position.z - a.mesh.position.z;
                const d2 = dx * dx + dz * dz;
                const minD = Math.max(0.8, (a.r + b.r) * 0.55);
                if (d2 > 0 && d2 < minD * minD) {
                    const d = Math.sqrt(d2);
                    const nx = dx / d, nz = dz / d;
                    const push = (minD - d) * 0.5;
                    a.mesh.position.x -= nx * push;
                    a.mesh.position.z -= nz * push;
                    b.mesh.position.x += nx * push;
                    b.mesh.position.z += nz * push;
                }
            }
        }
    }

    pointHitsObstacle(px, pz) {
        for (const m of this.obstacles) {
            const s = m.userData.size;
            if (!s) continue;
            if (px > m.position.x - s.w / 2 && px < m.position.x + s.w / 2 && pz > m.position.z - s.d / 2 && pz < m.position.z + s.d / 2) return true;
        }
        return false;
    }
}
