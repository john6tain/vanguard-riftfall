export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const dist2 = (ax, az, bx, bz) => {
  const dx = ax - bx;
  const dz = az - bz;
  return dx * dx + dz * dz;
};
