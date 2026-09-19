// Map rendering
import * as THREE from 'three';
import { MAP } from '/shared/map.js';
import { mat } from './models.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Collect box geometries per material and merge them into one mesh each (one draw call per material).
class Batcher {
  constructor() { this.buckets = new Map(); }
  box(w, h, d, x, y, z, material) {
    const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z);
    if (!this.buckets.has(material)) this.buckets.set(material, []);
    this.buckets.get(material).push(g);
  }
  flush(parent, { castShadow = true, receiveShadow = true } = {}) {
    for (const [material, geos] of this.buckets) {
      const merged = mergeGeometries(geos, false);
      geos.forEach(g => g.dispose());
      const m = new THREE.Mesh(merged, material);
      m.castShadow = castShadow; m.receiveShadow = receiveShadow;
      m.matrixAutoUpdate = false;
      parent.add(m);
    }
    this.buckets.clear();
  }
}

export function buildWorld(scene) {
  const world = new THREE.Group();
  scene.add(world);

  // ground
  const groundTex = makeGroundTexture();
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(MAP.halfW * 2 + 400, MAP.halfD * 2 + 400, 1, 1),
    new THREE.MeshStandardMaterial({ map: groundTex, roughness: 0.95, metalness: 0.05 }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
  world.add(ground);

  // road stripes
  const roadMat = new THREE.MeshLambertMaterial({ color: 0x2a2d31 });
  const road = new THREE.Mesh(new THREE.PlaneGeometry(MAP.halfW * 2, 40), roadMat);
  road.rotation.x = -Math.PI / 2; road.position.y = 0.02; road.receiveShadow = true; world.add(road);
  const road2 = new THREE.Mesh(new THREE.PlaneGeometry(40, MAP.halfD * 2), roadMat);
  road2.rotation.x = -Math.PI / 2; road2.position.y = 0.02; road2.receiveShadow = true; world.add(road2);

  // outer walls
  const wallMat = mat(0x3a4046, { roughness: 0.9 });
  const T = 6, H = 24;
  const walls = [
    [-MAP.halfW - T / 2, 0, T, MAP.halfD * 2 + T * 2], [MAP.halfW + T / 2, 0, T, MAP.halfD * 2 + T * 2],
    [0, -MAP.halfD - T / 2, MAP.halfW * 2 + T * 2, T], [0, MAP.halfD + T / 2, MAP.halfW * 2 + T * 2, T],
  ];
  const batch = new Batcher();
  for (const [x, z, w, d] of walls) batch.box(w, H, d, x, H / 2, z, wallMat);

  // buildings
  const kindMat = {
    bldg: mat(0x5c6670, { roughness: 0.85, metalness: 0.1 }),
    tower: mat(0x4e5860, { roughness: 0.8, metalness: 0.2 }),
    wall: mat(0x6c6a60, { roughness: 0.95 }),
    crate: mat(0x7a5a2e, { roughness: 0.9 }),
  };
  const winMat = mat(0x0c141c, { emissive: 0x2c4a66, emissiveIntensity: 0.4, roughness: 0.3, metalness: 0.5 });
  const stripeMat = mat(0xd8b23a);
  for (const b of MAP.boxes) {
    batch.box(b.w, b.h, b.d, b.x, b.h / 2, b.z, kindMat[b.kind] || kindMat.bldg);
    if (b.kind === 'bldg' || b.kind === 'tower') {
      // window strips
      const rows = Math.max(1, Math.floor(b.h / 5));
      for (let r = 0; r < rows; r++) {
        const y = 3 + r * 5;
        if (y > b.h - 1.5) break;
        batch.box(b.w * 0.8, 1.4, 0.2, b.x, y, b.z + b.d / 2 + 0.05, winMat);
        batch.box(b.w * 0.8, 1.4, 0.2, b.x, y, b.z - b.d / 2 - 0.05, winMat);
        batch.box(0.2, 1.4, b.d * 0.8, b.x + b.w / 2 + 0.05, y, b.z, winMat);
        batch.box(0.2, 1.4, b.d * 0.8, b.x - b.w / 2 - 0.05, y, b.z, winMat);
      }
      // roof detail
      batch.box(b.w * 0.4, 1.5, b.d * 0.4, b.x + b.w * 0.15, b.h + 0.75, b.z - b.d * 0.15, kindMat.tower);
    }
    if (b.kind === 'crate') batch.box(b.w * 1.01, b.h * 0.15, b.d * 1.01, b.x, b.h * 0.5, b.z, stripeMat);
  }
  batch.flush(world);

  // beacons (shared geometries)
  const beaconGeo = {
    base: new THREE.CylinderGeometry(4, 4.5, 0.8, 12), pole: new THREE.CylinderGeometry(0.35, 0.35, 12, 6),
    ring: new THREE.RingGeometry(20, 22, 32), beam: new THREE.CylinderGeometry(1.2, 1.2, 60, 8, 1, true),
  };
  const beaconObjs = MAP.beacons.map(b => {
    const g = new THREE.Group(); g.position.set(b.x, 0, b.z);
    const base = new THREE.Mesh(beaconGeo.base, mat(0x333940, { metalness: 0.4 })); base.position.y = 0.4; g.add(base);
    const pole = new THREE.Mesh(beaconGeo.pole, mat(0x9aa4ad, { metalness: 0.6 })); pole.position.y = 6.4; g.add(pole);
    const flagMat = new THREE.MeshBasicMaterial({ color: 0xbbbbbb, side: THREE.DoubleSide });
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(5, 3), flagMat); flag.position.set(2.5, 11, 0); g.add(flag);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xbbbbbb, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false });
    const ring = new THREE.Mesh(beaconGeo.ring, ringMat); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.1; g.add(ring);
    const beam = new THREE.Mesh(beaconGeo.beam, new THREE.MeshBasicMaterial({ color: 0xbbbbbb, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false })); beam.position.y = 30; g.add(beam);
    // label sprite
    const label = makeLabel(b.name); label.position.y = 16; label.scale.set(8, 4, 1); g.add(label);
    world.add(g);
    return { group: g, flagMat, ringMat, beamMat: beam.material, ring };
  });

  // sky-ish: distant silhouettes
  const farMat = mat(0x1b2129, { roughness: 1 });
  const far = new Batcher();
  for (let i = 0; i < 40; i++) {
    const ang = i / 40 * Math.PI * 2;
    const rad = 520 + Math.random() * 120;
    const h = 30 + Math.random() * 90;
    far.box(30 + Math.random() * 50, h, 30 + Math.random() * 50, Math.cos(ang) * rad, h / 2, Math.sin(ang) * rad, farMat);
  }
  far.flush(world, { castShadow: false, receiveShadow: false });

  world.traverse(o => { if (o !== world && !o.isSprite) { o.updateMatrix(); } });
  return { group: world, beacons: beaconObjs };
}

export const TEAM_HEX = [0x3aa0ff, 0xff4b3a];

export function updateBeaconVisual(bo, owner, progress) {
  const c = owner === 0 ? TEAM_HEX[0] : owner === 1 ? TEAM_HEX[1] : 0xbbbbbb;
  bo.flagMat.color.setHex(c);
  bo.ringMat.color.setHex(progress < -0.05 ? TEAM_HEX[0] : progress > 0.05 ? TEAM_HEX[1] : c);
  bo.beamMat.color.setHex(c);
  bo.ring.scale.setScalar(1 + Math.abs(progress) * 0.0);
}

function makeGroundTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#4a4d46'; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 6000; i++) {
    g.fillStyle = `rgba(${20 + Math.random() * 40 | 0},${25 + Math.random() * 40 | 0},${20 + Math.random() * 30 | 0},${Math.random() * 0.5})`;
    g.fillRect(Math.random() * 512, Math.random() * 512, 2 + Math.random() * 4, 2 + Math.random() * 4);
  }
  g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 2;
  for (let i = 0; i < 8; i++) { g.beginPath(); g.moveTo(0, i * 64); g.lineTo(512, i * 64); g.stroke(); g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64, 512); g.stroke(); }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(24, 18);
  tex.anisotropy = 4;
  return tex;
}

export function makeLabel(text, color = '#ffffff', bg = 'rgba(0,0,0,0.55)') {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, 256, 128);
  g.fillStyle = color; g.font = 'bold 84px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 128, 66);
  const tex = new THREE.CanvasTexture(c);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  return sp;
}
