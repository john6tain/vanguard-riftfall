import * as THREE from 'three';
import { GLTFLoader } from 'https://unpkg.com/three@0.161.0/examples/jsm/loaders/GLTFLoader.js';
import { STLLoader } from 'https://unpkg.com/three@0.161.0/examples/jsm/loaders/STLLoader.js';
import {Player} from '../entities/Player.js';
import {InputManager} from '../systems/InputManager.js';
import {CollisionSystem} from '../systems/CollisionSystem.js';
import {EnemyManager} from '../entities/EnemyManager.js';
import {WaveSystem} from '../systems/WaveSystem.js';
import {AdManager} from '../systems/AdManager.js';
import {RemoteSyncController} from './RemoteSyncController.js';
import {GameUiController} from './GameUiController.js';
import {PlayerMotionController} from './PlayerMotionController.js';
import {CombatController} from './CombatController.js';
import {NetworkTickController} from './NetworkTickController.js';
import {ObjectiveController} from './ObjectiveController.js';
import {PlayerStateController} from './PlayerStateController.js';
import {WorldBuilder} from './WorldBuilder.js';
import {MapEditorController} from './MapEditorController.js';
import {SoundSystem} from '../systems/SoundSystem.js';

export class Game {
    constructor(netClient = null) {
        this.hud = {
            health: document.getElementById('hp'),
            shield: document.getElementById('sh'),
            ammo: document.getElementById('am'),
            kills: document.getElementById('ks'),
            score: document.getElementById('sc'),
            stage: document.getElementById('stg'),
            streak: document.getElementById('stk'),
            hpFill: document.getElementById('hpFill'),
            shFill: document.getElementById('shFill'),
            reloadWrap: document.getElementById('reloadWrap'),
            reloadFill: document.getElementById('reloadFill'),
            chargeWrap: document.getElementById('chargeWrap'),
            chargeFill: document.getElementById('chargeFill'),
        };

        const worldBuilder = new WorldBuilder();
        const world = worldBuilder.build();
        this.scene = world.scene;
        this.camera = world.camera;
        this.renderer = world.renderer;
        // Ensure camera-attached viewmodel meshes are rendered.
        this.scene.add(this.camera);
        this.obstacles = world.obstacles;
        this.extractPoint = world.extractPoint;
        this.extractRing = world.extractRing;

        this.player = new Player(this.camera);
        this.input = new InputManager(this.player, this.renderer.domElement);
        if (this.freeCam) this.input.setFreeCamMouseMode(true);
        this.collision = new CollisionSystem(this.obstacles);
        this.enemyManager = new EnemyManager(this.scene, this.obstacles, this.collision);
        this.waves = new WaveSystem(this.enemyManager, this.extractRing);
        this.ads = new AdManager();
        this.ads.init();
        this.sound = new SoundSystem();

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
        this.netClient = netClient;
        this.remotePlayers = new Map();
        this.remoteEnemies = new Map();
        this._lastNetStateAt = 0;
        this._lastEnemySnapAt = 0;
        this._sentMissionFailed = false;
        this._seenEnemyShots = new Map();
        this.gameOver = false;
        this.finished = false;
        this.win = false;
        // Keep game paused until Deploy is pressed.
        this.paused = true;
        const params = new URLSearchParams(globalThis.location?.search || '');
        this.freeCam = params.get('debugPaths') === '1';

        this.weaponRig = null;
        this.weaponMuzzle = null;
        this.weaponRecoil = 0;
        this.weaponBobTime = 0;
        this.chargeTime = 0;
        this.chargeActive = false;
        this._wasReloading = false;

        this.remoteSync = new RemoteSyncController(this);
        this.ui = new GameUiController(this);
        this.motion = new PlayerMotionController(this);
        this.combat = new CombatController(this);
        this.networkTick = new NetworkTickController(this);
        this.objectives = new ObjectiveController(this);
        this.playerState = new PlayerStateController(this);
        this.mapEditor = new MapEditorController(this);
        this.ui.bindStartOverlay();
        if (this.freeCam) {
            const tip = document.getElementById('tip');
            if (tip) {
                tip.textContent = 'FREECAM/MAP EDITOR: MMB hold look OR M toggle look | WASD move | Shift boost | Space up | C/Ctrl down | ←/→ rotate | ↑/↓ resize | E place | Z delete-last | X delete-target | P save';
            }
            this.mapEditor.init();
        } else {
            this.buildPlasmaPistolViewModel();
        }

        this.clock = new THREE.Clock();
        this.setNetClient(this.netClient);
    }

    setNetClient(netClient) {
        this.remoteSync.setNetClient(netClient);
    }

    pauseGame() {
        this.ui.pauseGame();
    }

    resumeGame() {
        this.ui.resumeGame();
    }

    togglePause() {
        this.ui.togglePause();
    }

    ensureRemotePlayer(id) {
        return this.remoteSync.ensureRemotePlayer(id);
    }

    applyRemoteState(id, state) {
        this.remoteSync.applyRemoteState(id, state);
    }

    spawnRemoteBullet(data) {
        this.remoteSync.spawnRemoteBullet(data);
    }

    ensureReplicatedEnemy(id, type = 'red') {
        return this.remoteSync.ensureReplicatedEnemy(id, type);
    }

    applyEnemySnapshot(data) {
        this.remoteSync.applyEnemySnapshot(data);
    }

    applyRemoteEnemyHit(_fromPlayerId, data) {
        this.remoteSync.applyRemoteEnemyHit(_fromPlayerId, data);
    }

    spawnHealDrop(x, z) {
        this.combat.spawnHealDrop(x, z);
    }

    shoot() {
        this.combat.shoot();
    }

    buildPlasmaPistolViewModel() {
        const rig = new THREE.Group();
        rig.position.set(0.31, -0.24, -0.5);

        // Closer to Halo plasma pistol silhouette: bulb top + split forward prongs.
        const darkMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.5, metalness: 0.85, emissive: 0x0a1020, emissiveIntensity: 0.35 });
        const shellMat = new THREE.MeshStandardMaterial({ color: 0x5b21b6, roughness: 0.34, metalness: 0.78, emissive: 0x1a1032, emissiveIntensity: 0.8 });
        const glowMat = new THREE.MeshStandardMaterial({ color: 0x22d3ee, roughness: 0.2, metalness: 0.5, emissive: 0x0f4a56, emissiveIntensity: 1.25 });

        // Rounded upper shell
        const topBulb = new THREE.Mesh(new THREE.SphereGeometry(0.14, 18, 14), shellMat);
        topBulb.scale.set(1.35, 0.72, 1.05);
        topBulb.position.set(0.08, 0.08, -0.01);
        topBulb.rotation.y = -0.12;
        rig.add(topBulb);

        // Mid receiver under bulb
        const mid = new THREE.Mesh(new THREE.CapsuleGeometry(0.065, 0.2, 6, 10), darkMat);
        mid.rotation.z = Math.PI / 2;
        mid.position.set(0.08, -0.015, 0.03);
        rig.add(mid);

        // Split magnet-like prongs (top + bottom)
        const prongGeo = new THREE.CapsuleGeometry(0.028, 0.22, 6, 10);
        const prongTop = new THREE.Mesh(prongGeo, glowMat);
        prongTop.rotation.z = Math.PI / 2;
        prongTop.position.set(0.24, 0.065, -0.08);
        rig.add(prongTop);

        const prongBottom = new THREE.Mesh(prongGeo, glowMat);
        prongBottom.rotation.z = Math.PI / 2;
        prongBottom.position.set(0.24, -0.065, -0.08);
        rig.add(prongBottom);

        // Rear arc tying both prongs visually
        const rearArc = new THREE.Mesh(
            new THREE.TorusGeometry(0.068, 0.016, 10, 26, Math.PI),
            glowMat,
        );
        rearArc.position.set(0.14, 0.0, -0.08);
        rearArc.rotation.y = Math.PI / 2;
        rig.add(rearArc);

        // Energy nodes at front (muzzle pair)
        const nodeTop = new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 10), new THREE.MeshBasicMaterial({ color: 0x93c5fd }));
        nodeTop.position.set(0.36, 0.065, -0.08);
        rig.add(nodeTop);
        const nodeBottom = new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 10), new THREE.MeshBasicMaterial({ color: 0x67e8f9 }));
        nodeBottom.position.set(0.36, -0.065, -0.08);
        rig.add(nodeBottom);

        // Hand grip
        const grip = new THREE.Mesh(
            new THREE.BoxGeometry(0.085, 0.2, 0.12),
            new THREE.MeshStandardMaterial({ color: 0x0b1220, roughness: 0.84, metalness: 0.22 }),
        );
        grip.position.set(-0.025, -0.16, 0.065);
        grip.rotation.z = 0.24;
        rig.add(grip);

        // Projectile spawn anchor (between plasma prongs)
        const muzzle = new THREE.Object3D();
        muzzle.position.set(0.37, 0.0, -0.08);
        rig.add(muzzle);

        // Try GLB first; fallback to STL from local network export.
        try {
            const applyModel = (model) => {
                if (!model) return;
                while (rig.children.length) rig.remove(rig.children[0]);

                // Auto-normalize scale so arbitrary imports (GLB/STL) fit first-person view.
                const box = new THREE.Box3().setFromObject(model);
                const size = new THREE.Vector3();
                box.getSize(size);
                const maxDim = Math.max(size.x || 0, size.y || 0, size.z || 0, 0.0001);
                const targetMax = 0.34;
                const s = targetMax / maxDim;
                model.scale.setScalar(s);

                model.position.set(0.06, -0.1, 0.0);
                model.rotation.set(0, 30, 0);
                model.traverse?.((n) => {
                    if (n.isMesh) {
                        n.castShadow = false;
                        n.receiveShadow = false;
                    }
                });
                rig.add(model);
                muzzle.position.set(0.34, 0.0, -0.08);
                rig.add(muzzle);
            };

            const gltfLoader = new GLTFLoader();
            gltfLoader.load(
                './assets/models/halo-plasma-pistol.glb',
                (gltf) => applyModel(gltf?.scene),
                undefined,
                () => {
                    const stlLoader = new STLLoader();
                    stlLoader.load(
                        './assets/models/pistol-full.stl',
                        (geometry) => {
                            geometry.computeVertexNormals();
                            const stlMesh = new THREE.Mesh(
                                geometry,
                                new THREE.MeshStandardMaterial({
                                    color: 0x7c3aed,
                                    roughness: 0.35,
                                    metalness: 0.78,
                                    emissive: 0x12223c,
                                    emissiveIntensity: 0.45,
                                }),
                            );
                            applyModel(stlMesh);
                        },
                        undefined,
                        () => {},
                    );
                },
            );
        } catch {}

        this.weaponRig = rig;
        this.weaponMuzzle = muzzle;
        this.camera.add(rig);
    }

    getWeaponMuzzleWorldPosition(out = new THREE.Vector3()) {
        if (this.weaponMuzzle) {
            this.weaponMuzzle.getWorldPosition(out);
            return out;
        }
        out.copy(this.camera.position);
        out.y = 1.5;
        return out;
    }

    updateWeaponView(dt) {
        if (!this.weaponRig) return;
        this.weaponBobTime += dt * (this.input.keys['shift'] ? 12 : 8);
        const bob = (Math.sin(this.weaponBobTime) * 0.0035) + (Math.cos(this.weaponBobTime * 0.5) * 0.0022);
        this.weaponRecoil = Math.max(0, this.weaponRecoil - dt * 9.5);
        this.weaponRig.position.x = 0.28;
        this.weaponRig.position.y = -0.22 + bob + this.weaponRecoil * 0.03;
        this.weaponRig.position.z = -0.48 + this.weaponRecoil * 0.08;
        this.weaponRig.rotation.z = -0.04 - this.weaponRecoil * 0.14;
    }

    update() {
        const dt = Math.min(0.033, this.clock.getDelta());

        if (this.paused) {
            this.renderer.render(this.scene, this.camera);
            requestAnimationFrame(() => this.update());
            return;
        }

        if (!this.gameOver) {
            const isJoinClient = !!(this.netClient?.connected && !this.netClient.isHost);
            if (!this.freeCam && this.input.locked) {
                if (this.input.mouseRight && !this.player.reloading) {
                    this.chargeActive = true;
                    this.chargeTime = Math.min(1.5, this.chargeTime + dt);
                } else if (this.chargeActive) {
                    this.combat.shootCharged(this.chargeTime / 1.5);
                    this.chargeActive = false;
                    this.chargeTime = 0;
                }

                if (this.input.mouseDown && !this.chargeActive) this.shoot();
            }

            this.motion.updateCameraRotation();

            const now = performance.now();
            this.networkTick.sendPlayerStateIfNeeded(now);
            this.motion.updateMovement(dt);
            this.player.updateReload(dt);
            if (this.player.reloading && !this._wasReloading) this.sound?.reloadStart();
            if (!this.player.reloading && this._wasReloading) this.sound?.reloadDone();
            this._wasReloading = this.player.reloading;
            this.updateWeaponView(dt);

            if (!isJoinClient) {
                const localPlayerId = this.netClient?.id || 'local';
                const targetActors = [
                    { id: localPlayerId, x: this.camera.position.x, z: this.camera.position.z, y: this.camera.position.y, isLocal: true },
                    ...Array.from(this.remotePlayers.entries())
                        .filter(([, p]) => p?.userData?.alive !== false)
                        .map(([id, p]) => ({
                            id,
                            x: p.position.x,
                            z: p.position.z,
                            y: p.position.y || 1.7,
                            isLocal: false,
                        })),
                ];
                this.enemyManager.update(dt, this.player, this.camera, targetActors, this.netClient);
            }
            if (!this.freeCam) this.motion.resolvePlayerEnemyCollision();

            if (!isJoinClient) this.waves.update(dt, this.enemyManager.enemies.length);
            this.networkTick.sendEnemySnapshotIfNeeded(now);

            this.objectives.updateExtractObjective(dt);

            this.combat.updateBullets(dt, isJoinClient);
            this.combat.updateHealDrops(dt);
            if (!this.freeCam) this.playerState.updateSurvival(dt);

            this.ui.updateHud();
        }

        this.ui.maybeShowGameOver();

        this.renderer.render(this.scene, this.camera);
        requestAnimationFrame(() => this.update());
    }
}
