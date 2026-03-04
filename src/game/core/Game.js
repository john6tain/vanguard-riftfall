import * as THREE from 'three';
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
        };

        const worldBuilder = new WorldBuilder();
        const world = worldBuilder.build();
        this.scene = world.scene;
        this.camera = world.camera;
        this.renderer = world.renderer;
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

    update() {
        const dt = Math.min(0.033, this.clock.getDelta());

        if (this.paused) {
            this.renderer.render(this.scene, this.camera);
            requestAnimationFrame(() => this.update());
            return;
        }

        if (!this.gameOver) {
            const isJoinClient = !!(this.netClient?.connected && !this.netClient.isHost);
            if (!this.freeCam && this.input.locked && this.input.mouseDown) this.shoot();

            this.motion.updateCameraRotation();

            const now = performance.now();
            this.networkTick.sendPlayerStateIfNeeded(now);
            this.motion.updateMovement(dt);

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
