// Shared geometry helpers (server + client). Boxes are axis-aligned:
// { x, z, w, d, h, y? }  -> centered at (x, y||0 .. +h, z), full width w (x), depth d (z), height h.

export function boxBounds(b) {
  return {
    minX: b.x - b.w / 2, maxX: b.x + b.w / 2,
    minZ: b.z - b.d / 2, maxZ: b.z + b.d / 2,
    minY: b.y || 0, maxY: (b.y || 0) + b.h,
  };
}

// Ray/segment vs AABB (slab). Returns t in [0, maxT] or -1.
export function rayBox(ox, oy, oz, dx, dy, dz, maxT, bb) {
  let tmin = 0, tmax = maxT;
  const axes = [[ox, dx, bb.minX, bb.maxX], [oy, dy, bb.minY, bb.maxY], [oz, dz, bb.minZ, bb.maxZ]];
  for (const [o, d, mn, mx] of axes) {
    if (Math.abs(d) < 1e-9) {
      if (o < mn || o > mx) return -1;
    } else {
      let t1 = (mn - o) / d, t2 = (mx - o) / d;
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return -1;
    }
  }
  return tmin;
}

export function nearestBoxHit(ox, oy, oz, dx, dy, dz, maxT, bounds) {
  let best = -1;
  for (const bb of bounds) {
    const t = rayBox(ox, oy, oz, dx, dy, dz, maxT, bb);
    if (t >= 0 && (best < 0 || t < best)) best = t;
  }
  return best;
}

export function losClear(ax, ay, az, bx, by, bz, bounds) {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-6) return true;
  const t = nearestBoxHit(ax, ay, az, dx / len, dy / len, dz / len, len, bounds);
  return t < 0;
}

export const STEP_EPS = 0.6;

// Height of the surface under (x,z) for a robot currently at altitude y: the tallest box top
// that the point is over and that is not above the robot (boxes above are walls, handled by resolveCircle).
export function groundHeight(x, z, y, bounds) {
  let g = 0;
  for (const bb of bounds) {
    if (bb.maxY <= g || bb.maxY > y + STEP_EPS) continue;
    if (x >= bb.minX && x <= bb.maxX && z >= bb.minZ && z <= bb.maxZ) g = bb.maxY;
  }
  return g;
}

// Push a circle (x,z,r) out of boxes (2D). Boxes whose top is at/below altitude y are ignored. Returns new [x, z].
export function resolveCircle(x, z, r, bounds, y = 0) {
  for (let iter = 0; iter < 3; iter++) {
    let moved = false;
    for (const bb of bounds) {
      if (bb.maxY < 2) continue; // very low things are walkable
      if (bb.maxY <= y + STEP_EPS) continue; // we're above this box (jumping over / standing on it)
      const cx = Math.max(bb.minX, Math.min(x, bb.maxX));
      const cz = Math.max(bb.minZ, Math.min(z, bb.maxZ));
      let dx = x - cx, dz = z - cz;
      let d2 = dx * dx + dz * dz;
      if (d2 < r * r) {
        if (d2 < 1e-8) {
          // inside the box: push out along smallest penetration axis
          const px1 = x - bb.minX, px2 = bb.maxX - x, pz1 = z - bb.minZ, pz2 = bb.maxZ - z;
          const m = Math.min(px1, px2, pz1, pz2);
          if (m === px1) x = bb.minX - r; else if (m === px2) x = bb.maxX + r;
          else if (m === pz1) z = bb.minZ - r; else z = bb.maxZ + r;
        } else {
          const d = Math.sqrt(d2);
          x = cx + dx / d * r; z = cz + dz / d * r;
        }
        moved = true;
      }
    }
    if (!moved) break;
  }
  return [x, z];
}

export function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function dist2d(ax, az, bx, bz) { return Math.hypot(ax - bx, az - bz); }
