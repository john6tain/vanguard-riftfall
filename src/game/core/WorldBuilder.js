import * as THREE from 'three';

export class WorldBuilder {
  build() {
    const scene = this.buildScene();
    const camera = this.buildCamera();
    const renderer = this.buildRenderer();
    this.bindResize(camera, renderer);
    this.buildLights(scene);

    const { obstacles } = this.buildArena(scene);
    const { extractPoint, extractRing } = this.buildExtractObjective(scene);

    return { scene, camera, renderer, obstacles, extractPoint, extractRing };
  }

  buildScene() {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x070b16);
    scene.fog = new THREE.Fog(0x0a1220, 85, 300);

    this.addSky(scene);
    return scene;
  }

  addSky(scene) {
    const skyGeo = new THREE.SphereGeometry(420, 24, 24);
    const skyMat = new THREE.MeshBasicMaterial({ color: 0x0d1a2e, side: THREE.BackSide });
    const sky = new THREE.Mesh(skyGeo, skyMat);
    scene.add(sky);

    const starsGeo = new THREE.BufferGeometry();
    const starCount = 900;
    const starPos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const starRadius = 360 + Math.random() * 40;
      const azimuth = Math.random() * Math.PI * 2;
      const elevation = Math.random() * (Math.PI * 0.48);
      const horizontalRadius = Math.sin(elevation) * starRadius;
      const verticalPosition = Math.cos(elevation) * starRadius;
      starPos[i * 3 + 0] = Math.cos(azimuth) * horizontalRadius;
      starPos[i * 3 + 1] = verticalPosition;
      starPos[i * 3 + 2] = Math.sin(azimuth) * horizontalRadius;
    }
    starsGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    const stars = new THREE.Points(
      starsGeo,
      new THREE.PointsMaterial({ color: 0xf8fbff, size: 1.2, sizeAttenuation: true, fog: false, depthWrite: false }),
    );
    scene.add(stars);

    const moon = new THREE.Mesh(
      new THREE.SphereGeometry(14, 24, 24),
      new THREE.MeshBasicMaterial({ color: 0xf2f6ff, fog: false, depthWrite: false }),
    );
    moon.position.set(0, 190, -240);
    scene.add(moon);

    const moonGlow = new THREE.Mesh(
      new THREE.SphereGeometry(20, 20, 20),
      new THREE.MeshBasicMaterial({ color: 0xbfd4ff, transparent: true, opacity: 0.22, fog: false, depthWrite: false }),
    );
    moonGlow.position.copy(moon.position);
    scene.add(moonGlow);
  }

  buildCamera() {
    const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 500);
    // Players spawn at map center
    camera.position.set(0, 1.7, 0);
    return camera;
  }

  buildRenderer() {
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(innerWidth, innerHeight);
    renderer.setPixelRatio(devicePixelRatio);
    document.body.appendChild(renderer.domElement);
    return renderer;
  }

  bindResize(camera, renderer) {
    addEventListener('resize', () => {
      camera.aspect = innerWidth / innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(innerWidth, innerHeight);
    });
  }

  buildLights(scene) {
    scene.add(new THREE.HemisphereLight(0x8fb5ff, 0x223344, 0.8));
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.85);
    directionalLight.position.set(30, 40, 20);
    scene.add(directionalLight);
  }

  buildArena(scene) {
    const obstacles = [];
    const addBox = (width, height, depth, x, y, z, color = 0x1a2a42) => {
      const obstacleMesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), new THREE.MeshStandardMaterial({ color }));
      obstacleMesh.position.set(x, y, z);
      obstacleMesh.userData.size = { w: width, d: depth, h: height };
      scene.add(obstacleMesh);
      obstacles.push(obstacleMesh);
    };

    const mapSize = 180;
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(mapSize, mapSize),
      new THREE.MeshStandardMaterial({ color: 0x11151d, roughness: 0.95, metalness: 0.04 }),
    );
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);
    scene.add(new THREE.GridHelper(mapSize, 45, 0x1b2a44, 0x13233a));

    const wallColor = 0x172233;
    const h = 12;
    const t = 3;
    const e = mapSize / 2;

    // Outer walls
    addBox(mapSize, h, t, 0, h / 2, -e, wallColor);
    addBox(mapSize, h, t, 0, h / 2, e, wallColor);
    addBox(t, h, mapSize, -e, h / 2, 0, wallColor);
    addBox(t, h, mapSize, e, h / 2, 0, wallColor);

    // Corridor v2: long lanes with staggered blockers (maze-like, less arena)
    // Vertical spine walls with alternating gaps
    addBox(t, h, 60, -20, h / 2, -45, wallColor);
    addBox(t, h, 60, -20, h / 2, 45, wallColor);
    addBox(t, h, 50, 20, h / 2, -35, wallColor);
    addBox(t, h, 50, 20, h / 2, 55, wallColor);

    // Horizontal lane walls with offset cuts
    addBox(70, h, t, -45, h / 2, -20, wallColor);
    addBox(70, h, t, 45, h / 2, -20, wallColor);
    addBox(65, h, t, -40, h / 2, 20, wallColor);
    addBox(65, h, t, 50, h / 2, 20, wallColor);

    // Chokepoint blockers
    addBox(10, 7, 10, -55, 3.5, 0, 0x22354a);
    addBox(10, 7, 10, 55, 3.5, -5, 0x22354a);
    addBox(9, 7, 9, 0, 3.5, -55, 0x22354a);
    addBox(9, 7, 9, 5, 3.5, 55, 0x22354a);

    // Mid-lane cover
    addBox(8, 6, 8, -5, 3, -5, 0x22354a);
    addBox(8, 6, 8, 35, 3, 35, 0x22354a);
    addBox(8, 6, 8, -35, 3, 35, 0x22354a);

    return { obstacles };
  }

  buildExtractObjective(scene) {
    const extractPoint = new THREE.Vector3(34, 0, -34);
    const extractRing = new THREE.Mesh(
      new THREE.TorusGeometry(6, 0.5, 10, 40),
      new THREE.MeshBasicMaterial({ color: 0x34d399 }),
    );
    extractRing.rotation.x = Math.PI / 2;
    extractRing.position.copy(extractPoint);
    extractRing.position.y = 0.15;
    extractRing.visible = false;
    scene.add(extractRing);
    return { extractPoint, extractRing };
  }
}
