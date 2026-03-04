import * as THREE from 'three';

export class MapEditorController {
  constructor(game) {
    this.game = game;
    this.mode = 'wall';
    this.color = 0x172233;
    this.height = 6;
    this.thickness = 1.8;
    this.block = 8;
    this.wallLength = 14;
    this.rotationY = 0;
    this.previewMesh = null;
    this.mouseNdc = new THREE.Vector2(0, 0);
  }

  init() {
    if (!this.game.freeCam) return;

    const wrap = document.createElement('div');
    wrap.id = 'mapEditorUi';
    wrap.style.cssText = 'position:fixed;left:10px;bottom:10px;z-index:30;background:#000c;border:1px solid #3b82f6;padding:8px;border-radius:8px;display:flex;gap:6px;flex-wrap:wrap;max-width:420px;font:12px system-ui';
    wrap.innerHTML = `
      <button id="me_wall">Wall</button>
      <button id="me_block">Block</button>
      <button id="me_place">Place (E)</button>
      <button id="me_look_toggle">MouseLook: OFF</button>
      <button id="me_del">Delete Last</button>
      <button id="me_del_target">Delete Target (X)</button>
      <button id="me_save">Save</button>
      <button id="me_export">Export</button>
      <label style="display:inline-flex;align-items:center;gap:4px;color:#cbd5e1">Import <input id="me_import" type="file" accept="application/json" style="width:140px"/></label>
      <span id="me_status" style="color:#cbd5e1">rot:0° size:14</span>
    `;
    document.body.appendChild(wrap);

    document.getElementById('me_wall')?.addEventListener('click', () => { this.mode = 'wall'; this.updateStatus(); });
    document.getElementById('me_block')?.addEventListener('click', () => { this.mode = 'block'; this.updateStatus(); });
    document.getElementById('me_place')?.addEventListener('click', () => this.placeAtCrosshair());
    document.getElementById('me_look_toggle')?.addEventListener('click', () => this.toggleMouseLook());
    document.getElementById('me_del')?.addEventListener('click', () => this.deleteLast());
    document.getElementById('me_del_target')?.addEventListener('click', () => this.deleteLookTarget());
    document.getElementById('me_save')?.addEventListener('click', () => this.saveToLocal());
    document.getElementById('me_export')?.addEventListener('click', () => this.exportJson());
    document.getElementById('me_import')?.addEventListener('change', (e) => this.importJson(e));

    addEventListener('mousemove', (e) => {
      const x = (e.clientX / window.innerWidth) * 2 - 1;
      const y = -(e.clientY / window.innerHeight) * 2 + 1;
      this.mouseNdc.set(x, y);
    });

    addEventListener('keydown', (e) => {
      if (e.key.toLowerCase() === 'e') this.placeAtCrosshair();
      if (e.key.toLowerCase() === 'm') this.toggleMouseLook();
      if (e.key.toLowerCase() === 'z') this.deleteLast();
      if (e.key.toLowerCase() === 'x') this.deleteLookTarget();
      if (e.key.toLowerCase() === 'p') this.saveToLocal();

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        this.rotationY -= Math.PI / 12;
        this.updateStatus();
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        this.rotationY += Math.PI / 12;
        this.updateStatus();
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (this.mode === 'wall') this.wallLength = Math.min(40, this.wallLength + 2);
        else this.block = Math.min(24, this.block + 1);
        this.updateStatus();
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (this.mode === 'wall') this.wallLength = Math.max(4, this.wallLength - 2);
        else this.block = Math.max(2, this.block - 1);
        this.updateStatus();
      }
    });

    this.updateStatus();
    this.startPreviewLoop();
  }

  getCrosshairPlacementPosition() {
    const g = this.game;
    const dir = new THREE.Vector3();
    g.camera.getWorldDirection(dir);
    dir.y = 0;
    if (dir.lengthSq() === 0) dir.set(0, 0, -1);
    dir.normalize();

    const dist = 10;
    return {
      x: g.camera.position.x + dir.x * dist,
      z: g.camera.position.z + dir.z * dist,
    };
  }

  startPreviewLoop() {
    const tick = () => {
      this.updatePreviewMesh();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  updatePreviewMesh() {
    const g = this.game;
    const pos = this.getCrosshairPlacementPosition();
    const spec = this.mode === 'wall'
      ? { w: this.wallLength, h: this.height, d: this.thickness, color: this.color }
      : { w: this.block, h: 5, d: this.block, color: 0x22354a };

    if (!this.previewMesh) {
      this.previewMesh = new THREE.Mesh(
        new THREE.BoxGeometry(spec.w, spec.h, spec.d),
        new THREE.MeshStandardMaterial({ color: spec.color, transparent: true, opacity: 0.62 }),
      );
      this.previewMesh.userData.preview = true;
      g.scene.add(this.previewMesh);
    }

    // Rebuild geometry only when dimensions changed
    const geo = this.previewMesh.geometry;
    if (
      geo.parameters.width !== spec.w ||
      geo.parameters.height !== spec.h ||
      geo.parameters.depth !== spec.d
    ) {
      this.previewMesh.geometry.dispose();
      this.previewMesh.geometry = new THREE.BoxGeometry(spec.w, spec.h, spec.d);
    }

    this.previewMesh.material.color.setHex(spec.color);
    this.previewMesh.position.set(pos.x, spec.h / 2, pos.z);
    this.previewMesh.rotation.y = this.rotationY;
  }

  getEditableObstacles() {
    return this.game.obstacles.filter((o) => o.userData?.editable);
  }

  toggleMouseLook() {
    const input = this.game.input;
    input.freeCamLook = !input.freeCamLook;
    const btn = document.getElementById('me_look_toggle');
    if (btn) btn.textContent = `MouseLook: ${input.freeCamLook ? 'ON' : 'OFF'}`;
  }

  updateStatus() {
    const el = document.getElementById('me_status');
    if (!el) return;
    const deg = Math.round((this.rotationY * 180) / Math.PI);
    const size = this.mode === 'wall' ? this.wallLength : this.block;
    el.textContent = `rot:${deg}° size:${size}`;
  }

  placeAtCrosshair() {
    const g = this.game;
    const { x, z } = this.getCrosshairPlacementPosition();

    const spec = this.mode === 'wall'
      ? { w: this.wallLength, h: this.height, d: this.thickness, color: this.color }
      : { w: this.block, h: 5, d: this.block, color: 0x22354a };

    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(spec.w, spec.h, spec.d),
      new THREE.MeshStandardMaterial({ color: spec.color }),
    );
    mesh.position.set(x, spec.h / 2, z);
    mesh.rotation.y = this.rotationY;
    mesh.userData.size = { w: spec.w, d: spec.d, h: spec.h };
    mesh.userData.rotY = this.rotationY;
    mesh.userData.editable = true;
    mesh.userData.mapRecord = { w: spec.w, h: spec.h, d: spec.d, x, y: spec.h / 2, z, color: spec.color, editable: true };
    g.scene.add(mesh);
    g.obstacles.push(mesh);
  }

  deleteLast() {
    const g = this.game;
    for (let i = g.obstacles.length - 1; i >= 0; i--) {
      const o = g.obstacles[i];
      if (!o.userData?.editable) continue;
      g.scene.remove(o);
      g.obstacles.splice(i, 1);
      break;
    }
  }

  deleteLookTarget() {
    const g = this.game;
    const ray = new THREE.Raycaster();
    ray.setFromCamera(this.mouseNdc, g.camera);
    const hits = ray.intersectObjects(g.obstacles, false);
    if (!hits.length) return;

    const target = hits[0].object;
    const idx = g.obstacles.indexOf(target);
    if (idx >= 0) g.obstacles.splice(idx, 1);
    g.scene.remove(target);
  }

  serialize() {
    return this.getEditableObstacles().map((o) => {
      const s = o.userData.size;
      return {
        w: s.w,
        h: s.h,
        d: s.d,
        x: o.position.x,
        y: o.position.y,
        z: o.position.z,
        color: o.material?.color?.getHex?.() ?? 0x172233,
        rotY: o.rotation?.y || 0,
        editable: true,
      };
    });
  }

  saveToLocal() {
    localStorage.setItem('riftfall.customMap', JSON.stringify(this.serialize()));
  }

  exportJson() {
    const blob = new Blob([JSON.stringify(this.serialize(), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'riftfall-map.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  async importJson(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const items = JSON.parse(text);
    if (!Array.isArray(items)) return;

    // clear editable
    this.game.obstacles = this.game.obstacles.filter((o) => {
      if (!o.userData?.editable) return true;
      this.game.scene.remove(o);
      return false;
    });

    for (const it of items) {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(it.w, it.h, it.d),
        new THREE.MeshStandardMaterial({ color: it.color ?? 0x172233 }),
      );
      mesh.position.set(it.x, it.y, it.z);
      mesh.rotation.y = Number(it.rotY || 0);
      mesh.userData.size = { w: it.w, d: it.d, h: it.h };
      mesh.userData.rotY = Number(it.rotY || 0);
      mesh.userData.editable = true;
      mesh.userData.mapRecord = { ...it, editable: true };
      this.game.scene.add(mesh);
      this.game.obstacles.push(mesh);
    }

    this.saveToLocal();
  }
}
