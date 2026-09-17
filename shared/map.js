// Map definition shared by server and client. Units = meters.
// Point-symmetric layout (rotate 180° around origin) like the classic maps.

const HALF_W = 320, HALF_D = 220;

function mirror(list) {
  const out = [];
  for (const b of list) {
    out.push({ ...b });
    out.push({ ...b, x: -b.x, z: -b.z });
  }
  return out;
}

// Buildings / cover: {x, z, w, d, h, kind}
// kind: 'bldg' (concrete), 'wall' (low), 'tower', 'crate', 'ramp'
const half = [
  // Home base area (blue side, negative x)
  { x: -285, z: -60, w: 30, d: 40, h: 14, kind: 'bldg' },
  { x: -285, z: 60, w: 30, d: 40, h: 14, kind: 'bldg' },
  { x: -240, z: 0, w: 14, d: 60, h: 4, kind: 'wall' },
  { x: -250, z: -150, w: 40, d: 30, h: 18, kind: 'bldg' },
  { x: -250, z: 150, w: 40, d: 30, h: 18, kind: 'bldg' },

  // Lane structures
  { x: -180, z: -110, w: 50, d: 36, h: 22, kind: 'bldg' },
  { x: -180, z: 110, w: 50, d: 36, h: 22, kind: 'bldg' },
  { x: -170, z: -40, w: 24, d: 24, h: 30, kind: 'tower' },
  { x: -120, z: -180, w: 60, d: 20, h: 12, kind: 'bldg' },
  { x: -120, z: 180, w: 60, d: 20, h: 12, kind: 'bldg' },
  { x: -110, z: 0, w: 16, d: 90, h: 6, kind: 'wall' },
  { x: -120, z: -70, w: 22, d: 22, h: 10, kind: 'crate' },
  { x: -120, z: 70, w: 22, d: 22, h: 10, kind: 'crate' },

  // Side beacon covers
  { x: -60, z: -150, w: 30, d: 18, h: 9, kind: 'crate' },
  { x: -60, z: 150, w: 30, d: 18, h: 9, kind: 'crate' },
  { x: -80, z: -120, w: 12, d: 40, h: 5, kind: 'wall' },
  { x: -80, z: 120, w: 12, d: 40, h: 5, kind: 'wall' },

  // Center structures
  { x: -40, z: -40, w: 34, d: 34, h: 26, kind: 'bldg' },
  { x: -40, z: 50, w: 20, d: 20, h: 8, kind: 'crate' },
  { x: -15, z: -95, w: 40, d: 12, h: 5, kind: 'wall' },
  { x: -10, z: 20, w: 10, d: 10, h: 3, kind: 'crate' },
];

export const MAP = {
  name: 'Dead City',
  halfW: HALF_W, halfD: HALF_D,
  boxes: mirror(half),
  beacons: [
    { id: 0, name: 'A', x: -270, z: 0 },
    { id: 1, name: 'B', x: -60, z: -190 },
    { id: 2, name: 'C', x: 0, z: 0 },
    { id: 3, name: 'D', x: 60, z: 190 },
    { id: 4, name: 'E', x: 270, z: 0 },
  ],
  spawns: {
    0: [{ x: -300, z: -20 }, { x: -300, z: 20 }, { x: -305, z: -95 }, { x: -305, z: 95 }, { x: -290, z: -120 }, { x: -290, z: 120 }],
    1: [{ x: 300, z: 20 }, { x: 300, z: -20 }, { x: 305, z: 95 }, { x: 305, z: -95 }, { x: 290, z: 120 }, { x: 290, z: -120 }],
  },
};

export function mapBounds() {
  const out = MAP.boxes.map(b => ({
    minX: b.x - b.w / 2, maxX: b.x + b.w / 2,
    minZ: b.z - b.d / 2, maxZ: b.z + b.d / 2,
    minY: 0, maxY: b.h,
  }));
  // outer walls
  const T = 20, H = 60;
  out.push({ minX: -HALF_W - T, maxX: -HALF_W, minZ: -HALF_D - T, maxZ: HALF_D + T, minY: 0, maxY: H });
  out.push({ minX: HALF_W, maxX: HALF_W + T, minZ: -HALF_D - T, maxZ: HALF_D + T, minY: 0, maxY: H });
  out.push({ minX: -HALF_W - T, maxX: HALF_W + T, minZ: -HALF_D - T, maxZ: -HALF_D, minY: 0, maxY: H });
  out.push({ minX: -HALF_W - T, maxX: HALF_W + T, minZ: HALF_D, maxZ: HALF_D + T, minY: 0, maxY: H });
  return out;
}
