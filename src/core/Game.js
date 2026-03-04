import * as THREE from 'three';
import {Player} from '../entities/Player.js';
import {InputManager} from '../systems/InputManager.js';
import {CollisionSystem} from '../systems/CollisionSystem.js';
import {EnemyManager} from '../entities/EnemyManager.js';
import {WaveSystem} from '../systems/WaveSystem.js';
import {AdManager} from '../systems/AdManager.js';
import {dist2} from '../utils/math.js';

export class Game {
    constructor() {
        this.hud = {
            hp: document.getElementById('hp'),
            sh: document.getElementById('sh'),
            am: document.getElementById('am'),
            ks: document.getElementById('ks'),
            sc: document.getElementById('sc'),
            stg: document.getElementById('stg'),
            stk: document.getElementById('stk'),
        };

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x3f79a8);
        this.scene.fog = new THREE.Fog(0x3f79a8, 65, 240);

        // Simple procedural skybox dome (inside-out sphere with stars)
        const skyGeo = new THREE.SphereGeometry(420, 24, 24);
        const skyMat = new THREE.MeshBasicMaterial({color: 0x4c86b7, side: THREE.BackSide});
        const sky = new THREE.Mesh(skyGeo, skyMat);
        this.scene.add(sky);

        const starsGeo = new THREE.BufferGeometry();
        const starCount = 900;
        const starPos = new Float32Array(starCount * 3);
        for (let i = 0; i < starCount; i++) {
            const r = 360 + Math.random() * 40;
            const a = Math.random() * Math.PI * 2;
            const y = (Math.random() * 2 - 1) * 0.7;
            starPos[i * 3 + 0] = Math.cos(a) * r;
            starPos[i * 3 + 1] = y * r;
            starPos[i * 3 + 2] = Math.sin(a) * r;
        }
        starsGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
        const stars = new THREE.Points(starsGeo, new THREE.PointsMaterial({color: 0xcde7ff, size: 0.8, sizeAttenuation: true}));
        this.scene.add(stars);

        this.camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 500);
        this.camera.position.set(0, 1.7, 8);

        this.renderer = new THREE.WebGLRenderer({antialias: true});
        this.renderer.setSize(innerWidth, innerHeight);
        this.renderer.setPixelRatio(devicePixelRatio);
        document.body.appendChild(this.renderer.domElement);

        addEventListener('resize', () => {
            this.camera.aspect = innerWidth / innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(innerWidth, innerHeight);
        });

        this.scene.add(new THREE.HemisphereLight(0x8fb5ff, 0x223344, 0.8));
        const dir = new THREE.DirectionalLight(0xffffff, 0.85);
        dir.position.set(30, 40, 20);
        this.scene.add(dir);

        const floorTexCanvas = document.createElement('canvas');
        floorTexCanvas.width = 512;
        floorTexCanvas.height = 512;
        const fctx = floorTexCanvas.getContext('2d');
        fctx.fillStyle = '#0f131b';
        fctx.fillRect(0, 0, 512, 512);
        fctx.strokeStyle = 'rgba(95,120,150,0.2)';
        fctx.lineWidth = 2;
        for (let i = 0; i <= 512; i += 32) {
            fctx.beginPath();
            fctx.moveTo(i, 0);
            fctx.lineTo(i, 512);
            fctx.stroke();
            fctx.beginPath();
            fctx.moveTo(0, i);
            fctx.lineTo(512, i);
            fctx.stroke();
        }

        const floorTex = new THREE.CanvasTexture(floorTexCanvas);
        floorTex.wrapS = THREE.RepeatWrapping;
        floorTex.wrapT = THREE.RepeatWrapping;
        floorTex.repeat.set(20, 20);

        const floor = new THREE.Mesh(
            new THREE.PlaneGeometry(500, 500),
            new THREE.MeshStandardMaterial({map: floorTex, color: 0xffffff, roughness: 0.92, metalness: 0.05})
        );
        floor.rotation.x = -Math.PI / 2;
        this.scene.add(floor);
        this.scene.add(new THREE.GridHelper(500, 120, 0x1b2a44, 0x13233a));

        this.obstacles = [];
        const addBox = (w, h, d, x, y, z, color = 0x1a2a42) => {
            const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({color}));
            m.position.set(x, y, z);
            m.userData.size = {w, d, h};
            this.scene.add(m);
            this.obstacles.push(m);
        };

        for (let i = 0; i < 80; i++) {
            const w = 2 + Math.random() * 6, h = 1 + Math.random() * 4, d = 2 + Math.random() * 6;
            addBox(w, h, d, (Math.random() - 0.5) * 220, h / 2, (Math.random() - 0.5) * 220);
        }
        for (let i = 0; i < 60; i++) {
            const h = 10 + Math.random() * 40, w = 6 + Math.random() * 10, d = 6 + Math.random() * 10;
            const ring = 150 + Math.random() * 70;
            const a = (i / 60) * Math.PI * 2;
            addBox(w, h, d, Math.cos(a) * ring, h / 2, Math.sin(a) * ring, 0x101827);
        }

        this.extractPoint = new THREE.Vector3(120, 0, -120);
        this.extractRing = new THREE.Mesh(new THREE.TorusGeometry(6, 0.5, 10, 40), new THREE.MeshBasicMaterial({color: 0x34d399}));
        this.extractRing.rotation.x = Math.PI / 2;
        this.extractRing.position.copy(this.extractPoint);
        this.extractRing.position.y = 0.15;
        this.extractRing.visible = false;
        this.scene.add(this.extractRing);

        this.player = new Player(this.camera);
        this.input = new InputManager(this.player, this.renderer.domElement);
        this.collision = new CollisionSystem(this.obstacles);
        this.enemyManager = new EnemyManager(this.scene, this.obstacles, this.collision);
        this.waves = new WaveSystem(this.enemyManager, this.extractRing);
        this.ads = new AdManager();
        this.ads.init();

        // start first wave after model preload (or timeout fallback)
        this._waveStarted = false;
        Promise.resolve(this.enemyManager.readyPromise).then(() => {
            if (!this._waveStarted) {
                this.waves.startWave();
                this._waveStarted = true;
            }
        });
        setTimeout(() => {
            if (!this._waveStarted) {
                this.waves.startWave();
                this._waveStarted = true;
            }
        }, 1500);

        this.bullets = [];
        this.healDrops = [];
        this.rayDir = new THREE.Vector3();
        this.gameOver = false;
        this.finished = false;
        this.win = false;
        this.paused = false;

        this.msg = document.getElementById('msg');
        const deploy = document.getElementById('startBtn');
        const doDeploy = () => {
            if (document.fullscreenElement == null && document.documentElement.requestFullscreen) {
                document.documentElement.requestFullscreen().catch(() => {
                });
            }
            if (this.input.isMobileTouch) {
                this.input.locked = true;
            } else {
                this.renderer.domElement.requestPointerLock();
            }
            this.msg.style.display = 'none';
        };

        deploy.onclick = doDeploy;
        deploy.addEventListener('touchend', (e) => {
            e.preventDefault();
            e.stopPropagation();
            doDeploy();
        }, {passive: false});

        addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !this.gameOver) {
                e.preventDefault();
                this.togglePause();
            }
        });

        this.clock = new THREE.Clock();
    }

    pauseGame() {
        if (this.paused || this.gameOver) return;
        this.paused = true;
        this.input.mouseDown = false;
        if (!this.input.isMobileTouch && document.pointerLockElement) document.exitPointerLock();
        this.msg.style.display = 'block';
        this.msg.innerHTML = `<h2>Paused</h2><p>Press Esc to resume.</p><button id="resumeBtn">Resume</button>`;
        const resume = document.getElementById('resumeBtn');
        resume?.addEventListener('click', () => this.resumeGame());
        resume?.addEventListener('touchend', (e) => {
            e.preventDefault();
            this.resumeGame();
        }, {passive: false});
    }

    resumeGame() {
        if (!this.paused || this.gameOver) return;
        this.paused = false;
        this.msg.style.display = 'none';
        if (this.input.isMobileTouch) {
            this.input.locked = true;
        } else {
            this.renderer.domElement.requestPointerLock?.();
        }
    }

    togglePause() {
        if (this.paused) this.resumeGame();
        else this.pauseGame();
    }

    spawnHealDrop(x, z) {
        const mat = new THREE.MeshBasicMaterial({color: 0x22c55e});
        const plus = new THREE.Group();

        const hBar = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.18, 0.18), mat);
        const vBar = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.8, 0.18), mat);
        plus.add(hBar, vBar);

        plus.position.set(x, 1.0, z);
        this.scene.add(plus);
        this.healDrops.push({mesh: plus, value: 20, life: 14});
    }

    shoot() {
        if (this.player.fireCd > 0 || this.player.ammo <= 0) return;
        this.player.fireCd = 0.12;
        this.player.ammo--;

        this.camera.getWorldDirection(this.rayDir);
        const spread = 0.012 + Math.min(0.03, Math.max(0, this.player.fireCd) * 0.35);
        this.rayDir.x += (Math.random() - 0.5) * spread;
        this.rayDir.y += (Math.random() - 0.5) * spread * 0.7;
        this.rayDir.z += (Math.random() - 0.5) * spread;
        this.rayDir.normalize();

        const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), new THREE.MeshBasicMaterial({color: 0xff8a00}));
        mesh.position.copy(this.camera.position);
        mesh.position.y = 1.5;

        this.scene.add(mesh);
        this.bullets.push({
            mesh,
            vx: this.rayDir.x * 80,
            vy: this.rayDir.y * 80,
            vz: this.rayDir.z * 80,
            life: 2.2,
            dmg: 28
        });
    }

    update() {
        const dt = Math.min(0.033, this.clock.getDelta());

        if (this.paused) {
            this.renderer.render(this.scene, this.camera);
            requestAnimationFrame(() => this.update());
            return;
        }

        if (!this.gameOver) {
            if (this.input.locked && this.input.mouseDown) this.shoot();

            if (this.input.isMobileTouch) {
                this.input.yaw -= this.input.mobileLook.x * 0.032;
                this.input.pitch -= this.input.mobileLook.y * 0.024;
                this.input.pitch = Math.max(-1.35, Math.min(1.35, this.input.pitch));
            }

            this.camera.rotation.order = 'YXZ';
            this.camera.rotation.y = this.input.yaw;
            this.camera.rotation.x = this.input.pitch;

            const sprint = this.input.keys['shift'] ? 1.55 : 1;
            const sp = this.player.speed * sprint;
            const fwd = new THREE.Vector3();
            this.camera.getWorldDirection(fwd);
            fwd.y = 0;
            if (fwd.lengthSq() > 0) fwd.normalize();
            const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
            const move = new THREE.Vector3();
            if (this.input.keys['w'] || this.input.mobileMove.y < -0.15) move.add(fwd);
            if (this.input.keys['s'] || this.input.mobileMove.y > 0.15) move.sub(fwd);
            if (this.input.keys['d'] || this.input.mobileMove.x > 0.15) move.add(right);
            if (this.input.keys['a'] || this.input.mobileMove.x < -0.15) move.sub(right);
            if (move.lengthSq() > 0) this.camera.position.add(move.normalize().multiplyScalar(sp * dt));

            this.collision.resolveXZ(this.camera.position, 0.55);
            this.player.updateVertical(dt);
            this.player.fireCd = Math.max(0, this.player.fireCd - dt);

            this.enemyManager.update(dt, this.player, this.camera);

            // Player-enemy body collision: prevent walking through enemies.
            const playerR = 0.55;
            for (const e of this.enemyManager.enemies) {
                const ex = e.mesh.position.x;
                const ez = e.mesh.position.z;
                const dx = this.camera.position.x - ex;
                const dz = this.camera.position.z - ez;
                const d2 = dx * dx + dz * dz;
                const minD = playerR + Math.max(0.65, e.r * 0.75);
                if (d2 > 0 && d2 < minD * minD) {
                    const d = Math.sqrt(d2);
                    const nx = dx / d;
                    const nz = dz / d;
                    const push = (minD - d);
                    this.camera.position.x += nx * push;
                    this.camera.position.z += nz * push;
                }
            }

            this.waves.update(dt, this.enemyManager.enemies.length);

            if (this.waves.stage === 3) {
                this.extractRing.rotation.z += dt * 0.8;
                if (dist2(this.camera.position.x, this.camera.position.z, this.extractPoint.x, this.extractPoint.z) < 36) {
                    this.gameOver = true;
                    this.win = true;
                }
            }

            for (const b of this.bullets) {
                b.mesh.position.x += b.vx * dt;
                b.mesh.position.y += b.vy * dt;
                b.mesh.position.z += b.vz * dt;
                b.life -= dt;
                if (this.enemyManager.pointHitsObstacle(b.mesh.position.x, b.mesh.position.z)) b.life = 0;
                for (const e of this.enemyManager.enemies) {
                    const dx = e.mesh.position.x - b.mesh.position.x;
                    const dz = e.mesh.position.z - b.mesh.position.z;
                    const dy = (e.mesh.position.y + 1.2) - b.mesh.position.y;
                    if ((dx * dx + dz * dz + dy * dy) < Math.max(0.9, e.r * 1.1) ** 2) {
                        e.hp -= b.dmg;
                        b.life = 0;

                        // Risk mechanic: landing a hit causes small reflected damage to the player.
                        let reflect = 2;
                        if (this.player.shield > 0) {
                            const absorbed = Math.min(this.player.shield, reflect);
                            this.player.shield -= absorbed;
                            reflect -= absorbed;
                        }
                        if (reflect > 0) this.player.hp -= reflect;

                        if (e.hp <= 0) {
                            const wasGreen = e.type === 'green';
                            this.scene.remove(e.mesh);
                            this.enemyManager.enemies = this.enemyManager.enemies.filter((x) => x !== e);
                            this.player.kills++;
                            this.player.streak++;
                            this.player.score += 100 + this.player.streak * 10;

                            if (wasGreen) this.spawnHealDrop(e.mesh.position.x, e.mesh.position.z);
                        }
                        break;
                    }
                }
            }
            this.bullets = this.bullets.filter((b) => {
                if (b.life <= 0) {
                    this.scene.remove(b.mesh);
                    return false;
                }
                return true;
            });

            // Heal pickups (green +) dropped by brutes.
            this.healDrops = this.healDrops.filter((d) => {
                d.life -= dt;
                d.mesh.rotation.y += dt * 2.8;
                d.mesh.position.y = 1.0 + Math.sin((14 - d.life) * 4) * 0.08;

                const near = dist2(this.camera.position.x, this.camera.position.z, d.mesh.position.x, d.mesh.position.z) < 1.1 * 1.1;
                if (near) {
                    this.player.hp = Math.min(this.player.maxHp || 100, this.player.hp + d.value);
                    this.scene.remove(d.mesh);
                    return false;
                }
                if (d.life <= 0) {
                    this.scene.remove(d.mesh);
                    return false;
                }
                return true;
            });

            if (this.player.canRechargeShild) {
                this.player.shield = Math.min(this.player.maxShield, this.player.shield + 5.2 * dt);
            }
            if (this.player.hp <= 0) {
                this.gameOver = true;
                this.win = false;
            }

            this.hud.hp.textContent = Math.max(0, this.player.hp | 0);
            this.hud.sh.textContent = this.player.shield | 0;
            this.hud.am.textContent = this.player.ammo;
            this.hud.ks.textContent = this.player.kills;
            this.hud.sc.textContent = this.player.score | 0;
            this.hud.stk.textContent = this.player.streak | 0;
            this.hud.stg.textContent = this.waves.stage === 1 ? `Breach • Wave ${this.waves.wave}` : this.waves.stage === 2 ? `Hold • ${this.waves.holdWavesLeft} waves left` : 'Extract';
        }

        if (this.gameOver && !this.finished) {
            this.finished = true;
            this.ads.onMatchFinished();
            this.msg.style.display = 'block';
            this.msg.innerHTML = `
        <h2>${this.win ? 'Mission Complete' : 'Mission Failed'}</h2>
        <p>Score: ${this.player.score | 0} • Kills: ${this.player.kills}</p>
        <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
          <button id="redeployBtn">Redeploy</button>
          <button id="rewardBtn">Watch Ad +250 Score</button>
        </div>`;

            const redeploy = document.getElementById('redeployBtn');
            redeploy?.addEventListener('click', () => location.reload());
            redeploy?.addEventListener('touchend', (e) => {
                e.preventDefault();
                location.reload();
            }, {passive: false});

            const reward = document.getElementById('rewardBtn');
            reward?.addEventListener('click', async () => {
                reward.disabled = true;
                const ok = await this.ads.showRewarded();
                if (ok) {
                    this.player.score += 250;
                    this.hud.sc.textContent = this.player.score | 0;
                    reward.textContent = 'Reward claimed';
                }
            });
        }

        this.renderer.render(this.scene, this.camera);
        requestAnimationFrame(() => this.update());
    }
}
