import * as THREE from 'three';
import {Player} from '../entities/Player.js';
import {InputManager} from '../systems/InputManager.js';
import {CollisionSystem} from '../systems/CollisionSystem.js';
import {EnemyManager} from '../entities/EnemyManager.js';
import {WaveSystem} from '../systems/WaveSystem.js';
import {AdManager} from '../systems/AdManager.js';
import {dist2} from '../utils/math.js';

export class Game {
    constructor(netClient = null) {
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
        this.scene.background = new THREE.Color(0x070b16);
        this.scene.fog = new THREE.Fog(0x0a1220, 85, 300);

        // Simple procedural skybox dome (inside-out sphere with stars)
        const skyGeo = new THREE.SphereGeometry(420, 24, 24);
        const skyMat = new THREE.MeshBasicMaterial({color: 0x0d1a2e, side: THREE.BackSide});
        const sky = new THREE.Mesh(skyGeo, skyMat);
        this.scene.add(sky);

        const starsGeo = new THREE.BufferGeometry();
        const starCount = 900;
        const starPos = new Float32Array(starCount * 3);
        for (let i = 0; i < starCount; i++) {
            const r = 360 + Math.random() * 40;
            const az = Math.random() * Math.PI * 2;
            // Proper upper-hemisphere distribution (avoids ring/gap artifact)
            const elev = Math.random() * (Math.PI * 0.48); // 0=zenith, ~86°=near horizon
            const horiz = Math.sin(elev) * r;
            const y = Math.cos(elev) * r;
            starPos[i * 3 + 0] = Math.cos(az) * horiz;
            starPos[i * 3 + 1] = y;
            starPos[i * 3 + 2] = Math.sin(az) * horiz;
        }
        starsGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
        const stars = new THREE.Points(
            starsGeo,
            new THREE.PointsMaterial({color: 0xf8fbff, size: 1.2, sizeAttenuation: true, fog: false, depthWrite: false})
        );
        this.scene.add(stars);

        // Moon (fog-independent + glow so it stays visible and shines)
        const moon = new THREE.Mesh(
            new THREE.SphereGeometry(14, 24, 24),
            new THREE.MeshBasicMaterial({color: 0xf2f6ff, fog: false, depthWrite: false})
        );
        moon.position.set(0, 190, -240);
        this.scene.add(moon);

        const moonGlow = new THREE.Mesh(
            new THREE.SphereGeometry(20, 20, 20),
            new THREE.MeshBasicMaterial({color: 0xbfd4ff, transparent: true, opacity: 0.22, fog: false, depthWrite: false})
        );
        moonGlow.position.copy(moon.position);
        this.scene.add(moonGlow);

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

        const floor = new THREE.Mesh(
            new THREE.PlaneGeometry(320, 320),
            new THREE.MeshStandardMaterial({color: 0x11151d, roughness: 0.95, metalness: 0.04})
        );
        floor.rotation.x = -Math.PI / 2;
        this.scene.add(floor);
        this.scene.add(new THREE.GridHelper(320, 80, 0x1b2a44, 0x13233a));

        this.obstacles = [];
        const addBox = (w, h, d, x, y, z, color = 0x1a2a42) => {
            const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({color}));
            m.position.set(x, y, z);
            m.userData.size = {w, d, h};
            this.scene.add(m);
            this.obstacles.push(m);
        };

        // C variant: denser city feel, but on a smaller map footprint
        for (let i = 0; i < 110; i++) {
            const w = 2 + Math.random() * 7, h = 1 + Math.random() * 6, d = 2 + Math.random() * 7;
            addBox(w, h, d, (Math.random() - 0.5) * 120, h / 2, (Math.random() - 0.5) * 120);
        }
        for (let i = 0; i < 70; i++) {
            const h = 12 + Math.random() * 46, w = 6 + Math.random() * 12, d = 6 + Math.random() * 12;
            const ring = 105 + Math.random() * 35;
            const a = (i / 70) * Math.PI * 2;
            addBox(w, h, d, Math.cos(a) * ring, h / 2, Math.sin(a) * ring, 0x101827);
        }

        // Hard map boundary walls (stop player after skyline/building zone)
        const wallH = 34;
        const wallT = 6;
        const wallL = 312;
        const edge = 156;
        addBox(wallL, wallH, wallT, 0, wallH / 2, -edge, 0x0b0f17); // north
        addBox(wallL, wallH, wallT, 0, wallH / 2, edge, 0x0b0f17);  // south
        addBox(wallT, wallH, wallL, -edge, wallH / 2, 0, 0x0b0f17); // west
        addBox(wallT, wallH, wallL, edge, wallH / 2, 0, 0x0b0f17);  // east

        this.extractPoint = new THREE.Vector3(78, 0, -78);
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
        this.net = netClient;
        this.remotePlayers = new Map();
        this.remoteEnemies = new Map();
        this._lastNetStateAt = 0;
        this._lastEnemySnapAt = 0;
        this._sentMissionFailed = false;
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
        this.setNetClient(this.net);
    }

    setNetClient(netClient) {
        this.net = netClient;
        if (!this.net) return;
        this.net.onRemoteState = (id, state) => this.applyRemoteState(id, state);
        this.net.onRemoteShoot = (_id, data) => this.spawnRemoteBullet(data);
        this.net.onEnemySnapshot = (data) => this.applyEnemySnapshot(data);
        this.net.onEnemyHit = (from, data) => this.applyRemoteEnemyHit(from, data);
        this.net.onMissionFailed = () => {
            this.gameOver = true;
            this.win = false;
        };

        if (!this.net.isHost) {
            for (const e of this.enemyManager.enemies) this.scene.remove(e.mesh);
            for (const s of this.enemyManager.enemyShots) this.scene.remove(s.mesh);
            this.enemyManager.enemies = [];
            this.enemyManager.enemyShots = [];
            this._waveStarted = true;
        }
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

    ensureRemotePlayer(id) {
        if (this.remotePlayers.has(id)) return this.remotePlayers.get(id);

        // Enemy-like rig, but orange (for remote players)
        const g = new THREE.Group();
        const bodyMat = new THREE.MeshStandardMaterial({color: 0xf97316, roughness: 0.68, metalness: 0.12});
        const armorMat = new THREE.MeshStandardMaterial({color: 0x9a3412, roughness: 0.55, metalness: 0.22});

        const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.45, 6, 10), bodyMat);
        torso.position.y = 1.1;
        g.add(torso);

        const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 14), bodyMat);
        head.position.set(0, 1.75, 0.08);
        g.add(head);

        const visor = new THREE.Mesh(new THREE.BoxGeometry(0.35,  0.12,  0.12), armorMat);
        visor.position.set(0, 1.73, 0.22);
        g.add(visor);

        const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), new THREE.MeshBasicMaterial({color: 0x9a3412}));
        const eyeR = eyeL.clone();
        eyeL.position.set(-0.08, 1.73, 0.27);
        eyeR.position.set(0.08, 1.73, 0.27);
        g.add(eyeL, eyeR);

        const armL = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.34, 4, 8), bodyMat);
        const armR = armL.clone();
        armL.position.set(-0.35, 1.1, 0);
        armR.position.set(0.35, 1.1, 0);
        g.add(armL, armR);

        const legL = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.4, 4, 8), bodyMat);
        const legR = legL.clone();
        legL.position.set(-0.1, 0.45, 0);
        legR.position.set(0.1, 0.45, 0);
        g.add(legL, legR);

        this.scene.add(g);
        this.remotePlayers.set(id, g);
        return g;
    }

    applyRemoteState(id, state) {
        if (!state || !Number.isFinite(state.x) || !Number.isFinite(state.z)) return;
        const p = this.ensureRemotePlayer(id);
        p.position.set(state.x, 0, state.z);
        p.rotation.y = Number.isFinite(state.yaw) ? state.yaw : p.rotation.y;
    }

    spawnRemoteBullet(data) {
        if (!data) return;
        const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), new THREE.MeshBasicMaterial({color: 0xffffff}));
        mesh.position.set(data.x ?? 0, data.y ?? 1.5, data.z ?? 0);
        this.scene.add(mesh);
        this.bullets.push({
            mesh,
            vx: (data.dx ?? 0) * 80,
            vy: (data.dy ?? 0) * 80,
            vz: (data.dz ?? 0) * 80,
            life: 1.0,
            dmg: 0
        });
    }

    ensureReplicatedEnemy(id, type = 'red') {
        if (this.remoteEnemies.has(id)) return this.remoteEnemies.get(id);
        const cfg = type === 'green'
            ? {color: 0x4ade80, r: 0.9}
            : type === 'blue'
                ? {color: 0x60a5fa, r: 0.9}
                : {color: 0xd85a5a, r: 0.9};
        const mesh = this.enemyManager.createFallbackModel(cfg);
        const s = type === 'green' ? 2.2 : type === 'blue' ? 1.4 : 1.8;
        mesh.scale.setScalar(s);
        mesh.position.y = -0.15;
        this.scene.add(mesh);
        const enemy = {id, type, r: 0.9, hp: 100, mesh};
        this.remoteEnemies.set(id, enemy);
        return enemy;
    }

    applyEnemySnapshot(data) {
        if (!data || !Array.isArray(data.enemies)) return;
        if (Number.isFinite(data.stage)) this.waves.stage = data.stage;
        if (Number.isFinite(data.wave)) this.waves.wave = data.wave;
        const seen = new Set();
        for (const s of data.enemies) {
            if (!s?.id) continue;
            seen.add(s.id);
            const e = this.ensureReplicatedEnemy(s.id, s.type);
            e.type = s.type || e.type;
            e.hp = Number.isFinite(s.hp) ? s.hp : e.hp;
            e.mesh.position.set(s.x || 0, s.y || -0.15, s.z || 0);
            if (Number.isFinite(s.ry)) e.mesh.rotation.y = s.ry;
        }

        for (const [id, e] of this.remoteEnemies.entries()) {
            if (seen.has(id)) continue;
            this.scene.remove(e.mesh);
            this.remoteEnemies.delete(id);
        }

        // Swap visible enemy list for client followers to the host snapshot.
        this.enemyManager.enemies = [...this.remoteEnemies.values()];
    }

    applyRemoteEnemyHit(_from, data) {
        if (!this.net?.isHost) return;
        if (!data?.id) return;
        const e = this.enemyManager.enemies.find((x) => x.id === data.id);
        if (!e) return;

        e.hp -= Number(data.dmg || 28);
        if (e.hp <= 0) {
            const wasGreen = e.type === 'green';
            this.scene.remove(e.mesh);
            this.enemyManager.enemies = this.enemyManager.enemies.filter((x) => x !== e);
            if (wasGreen) this.spawnHealDrop(e.mesh.position.x, e.mesh.position.z);
        }
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

        this.net?.sendShoot({
            x: mesh.position.x,
            y: mesh.position.y,
            z: mesh.position.z,
            dx: this.rayDir.x,
            dy: this.rayDir.y,
            dz: this.rayDir.z
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
            const isJoinClient = !!(this.net?.connected && !this.net.isHost);
            if (this.input.locked && this.input.mouseDown) this.shoot();

            if (this.input.isMobileTouch) {
                this.input.yaw -= this.input.mobileLook.x * 0.032;
                this.input.pitch -= this.input.mobileLook.y * 0.024;
                this.input.pitch = Math.max(-1.35, Math.min(1.35, this.input.pitch));
            }

            this.camera.rotation.order = 'YXZ';
            this.camera.rotation.y = this.input.yaw;
            this.camera.rotation.x = this.input.pitch;

            const now = performance.now();
            if (this.net?.connected && now - this._lastNetStateAt > 50) {
                this._lastNetStateAt = now;
                this.net.sendState({
                    x: this.camera.position.x,
                    z: this.camera.position.z,
                    yaw: this.input.yaw
                });
            }

            const sprint = this.input.keys['shift'] ? 1.18 : 1;
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

            if (!isJoinClient) this.enemyManager.update(dt, this.player, this.camera);

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

            if (!isJoinClient) this.waves.update(dt, this.enemyManager.enemies.length);

            if (this.net?.connected && this.net.isHost && now - this._lastEnemySnapAt > 100) {
                this._lastEnemySnapAt = now;
                this.net.sendEnemySnapshot({
                    stage: this.waves.stage,
                    wave: this.waves.wave,
                    enemies: this.enemyManager.enemies.map((e) => ({
                        id: e.id,
                        type: e.type,
                        hp: e.hp,
                        x: e.mesh.position.x,
                        y: e.mesh.position.y,
                        z: e.mesh.position.z,
                        ry: e.mesh.rotation.y
                    }))
                });
            }

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

                if (isJoinClient) {
                    for (const e of this.enemyManager.enemies) {
                        const dx = e.mesh.position.x - b.mesh.position.x;
                        const dz = e.mesh.position.z - b.mesh.position.z;
                        const dy = (e.mesh.position.y + 1.2) - b.mesh.position.y;
                        if ((dx * dx + dz * dz + dy * dy) < Math.max(0.9, e.r * 1.1) ** 2) {
                            this.net?.sendEnemyHit({ id: e.id, dmg: b.dmg || 28 });
                            b.life = 0;
                            break;
                        }
                    }
                    continue;
                }

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
                if (this.net?.connected && this.net.isHost && !this._sentMissionFailed) {
                    this._sentMissionFailed = true;
                    this.net.sendMissionFailed({ reason: 'host_down' });
                }
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
