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
    camera.position.set(0, 1.7, 8);
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

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(320, 320),
      new THREE.MeshStandardMaterial({ color: 0x11151d, roughness: 0.95, metalness: 0.04 }),
    );
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);
    scene.add(new THREE.GridHelper(320, 80, 0x1b2a44, 0x13233a));

    for (let i = 0; i < 110; i++) {
      const width = 2 + Math.random() * 7;
      const height = 1 + Math.random() * 6;
      const depth = 2 + Math.random() * 7;
      addBox(width, height, depth, (Math.random() - 0.5) * 120, height / 2, (Math.random() - 0.5) * 120);
    }

    for (let i = 0; i < 70; i++) {
      const height = 12 + Math.random() * 46;
      const width = 6 + Math.random() * 12;
      const depth = 6 + Math.random() * 12;
      const ringRadius = 105 + Math.random() * 35;
      const ringAngle = (i / 70) * Math.PI * 2;
      addBox(width, height, depth, Math.cos(ringAngle) * ringRadius, height / 2, Math.sin(ringAngle) * ringRadius, 0x101827);
    }

    const wallHeight = 34;
    const wallThickness = 6;
    const wallLength = 312;
    const wallEdge = 156;
    addBox(wallLength, wallHeight, wallThickness, 0, wallHeight / 2, -wallEdge, 0x0b0f17);
    addBox(wallLength, wallHeight, wallThickness, 0, wallHeight / 2, wallEdge, 0x0b0f17);
    addBox(wallThickness, wallHeight, wallLength, -wallEdge, wallHeight / 2, 0, 0x0b0f17);
    addBox(wallThickness, wallHeight, wallLength, wallEdge, wallHeight / 2, 0, 0x0b0f17);

    return { obstacles };
  }

  buildExtractObjective(scene) {
    const extractPoint = new THREE.Vector3(78, 0, -78);
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
