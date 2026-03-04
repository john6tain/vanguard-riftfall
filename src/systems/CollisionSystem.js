import { clamp } from '../utils/math.js';

export class CollisionSystem {
  constructor(obstacles) {
    this.obstacles = obstacles;
  }

  resolveXZ(pos, r) {
    for (const m of this.obstacles) {
      const s = m.userData.size;
      if (!s) continue;
      const minX = m.position.x - s.w / 2 - r;
      const maxX = m.position.x + s.w / 2 + r;
      const minZ = m.position.z - s.d / 2 - r;
      const maxZ = m.position.z + s.d / 2 + r;
      if (pos.x > minX && pos.x < maxX && pos.z > minZ && pos.z < maxZ) {
        const left = Math.abs(pos.x - minX);
        const right = Math.abs(maxX - pos.x);
        const top = Math.abs(pos.z - minZ);
        const bot = Math.abs(maxZ - pos.z);
        const mmin = Math.min(left, right, top, bot);
        if (mmin === left) pos.x = minX;
        else if (mmin === right) pos.x = maxX;
        else if (mmin === top) pos.z = minZ;
        else pos.z = maxZ;
      }
    }
  }
}
