export class CollisionSystem {
  constructor(obstacles) {
    this.obstacles = obstacles;
  }

  resolveXZ(position, radius) {
    for (const obstacle of this.obstacles) {
      const obstacleSize = obstacle.userData.size;
      if (!obstacleSize) continue;
      const minX = obstacle.position.x - obstacleSize.w / 2 - radius;
      const maxX = obstacle.position.x + obstacleSize.w / 2 + radius;
      const minZ = obstacle.position.z - obstacleSize.d / 2 - radius;
      const maxZ = obstacle.position.z + obstacleSize.d / 2 + radius;
      if (position.x > minX && position.x < maxX && position.z > minZ && position.z < maxZ) {
        const distanceToLeft = Math.abs(position.x - minX);
        const distanceToRight = Math.abs(maxX - position.x);
        const distanceToTop = Math.abs(position.z - minZ);
        const distanceToBottom = Math.abs(maxZ - position.z);
        const minimumPenetration = Math.min(distanceToLeft, distanceToRight, distanceToTop, distanceToBottom);
        if (minimumPenetration === distanceToLeft) position.x = minX;
        else if (minimumPenetration === distanceToRight) position.x = maxX;
        else if (minimumPenetration === distanceToTop) position.z = minZ;
        else position.z = maxZ;
      }
    }
  }
}
