import {GLTFLoader} from 'https://unpkg.com/three@0.161.0/examples/jsm/loaders/GLTFLoader.js';
import {EnemyFactory} from './EnemyFactory.js';
import {EnemyAiSystem} from './EnemyAiSystem.js';
import {EnemyProjectileSystem} from './EnemyProjectileSystem.js';

export class EnemyManager {
    constructor(scene, obstacles, collision) {
        this.scene = scene;
        this.obstacles = obstacles;
        this.collision = collision;
        this.enemies = [];
        this.enemyShots = [];

        this.loader = new GLTFLoader();
        this.modelCache = new Map();
        this.factory = new EnemyFactory(scene, collision);
        this.aiSystem = new EnemyAiSystem(scene, collision);
        this.projectileSystem = new EnemyProjectileSystem(scene, obstacles);
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

    createFallbackModel(enemyConfig) {
        return this.factory.createFallbackModel(enemyConfig);
    }

    spawn(type = 'red') {
        this.enemies.push(this.factory.createEnemy(type));
    }

    startWave(wave, stage) {
        const stageMultiplier = stage === 1 ? 1.25 : stage === 2 ? 1.45 : 1.7;
        const enemyCount = Math.floor((10 + wave * 3) * stageMultiplier);
        for (let i = 0; i < enemyCount; i++) {
            const enemyTypeRoll = Math.random();
            this.spawn(enemyTypeRoll < 0.24 ? 'green' : enemyTypeRoll < 0.5 ? 'blue' : 'red');
        }
    }

    update(dt, player, camera) {
        this.aiSystem.updateEnemies(dt, this.enemies, player, camera, this.enemyShots);
        this.projectileSystem.updateProjectiles(dt, this.enemyShots, player, camera);
        this.enemyShots = this.projectileSystem.cleanupExpiredProjectiles(this.enemyShots);
    }

    pointHitsObstacle(px, pz) {
        return this.projectileSystem.pointHitsObstacle(px, pz);
    }
}
