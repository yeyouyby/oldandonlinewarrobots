// Map rendering
import * as THREE from 'three';
import { MAP } from '/shared/map.js';
import { mat } from './models.js';

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
  const road = new THREE.Mesh(new THREE.PlaneGeometry(MAP.halfW * 2, 40), new THREE.MeshStandardMaterial({ color: 0x2a2d31, roughness: 1 }));
  road.rotation.x = -Math.PI / 2; road.position.y = 0.02; world.add(road);
  const road2 = new THREE.Mesh(new THREE.PlaneGeometry(40, MAP.halfD * 2), new THREE.MeshStandardMaterial({ color: 0x2a2d31, roughness: 1 }));
  road2.rotation.x = -Math.PI / 2; road2.position.y = 0.02; world.add(road2);

  // outer walls
  const wallMat = mat(0x3a4046, { roughness: 0.9 });
  const T = 6, H = 24;
  const walls = [
    [-MAP.halfW - T / 2, 0, T, MAP.halfD * 2 + T * 2], [MAP.halfW + T / 2, 0, T, MAP.halfD * 2 + T * 2],
    [0, -MAP.halfD - T / 2, MAP.halfW * 2 + T * 2, T], [0, MAP.halfD + T / 2, MAP.halfW * 2 + T * 2, T],
  ];
  for (const [x, z, w, d] of walls) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, H, d), wallMat); m.position.set(x, H / 2, z); m.receiveShadow = true; world.add(m); }

  // buildings
  const kindMat = {
    bldg: mat(0x5c6670, { roughness: 0.85, metalness: 0.1 }),
    tower: mat(0x4e5860, { roughness: 0.8, metalness: 0.2 }),
    wall: mat(0x6c6a60, { roughness: 0.95 }),
    crate: mat(0x7a5a2e, { roughness: 0.9 }),
  };
  const winMat = mat(0x0c141c, { emissive: 0x2c4a66, emissiveIntensity: 0.4, roughness: 0.3, metalness: 0.5 });
  for (const b of MAP.boxes) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(b.w, b.h, b.d), kindMat[b.kind] || kindMat.bldg);
    m.position.set(b.x, b.h / 2, b.z); m.castShadow = true; m.receiveShadow = true;
    world.add(m);
    if (b.kind === 'bldg' || b.kind === 'tower') {
      // window strips
      const rows = Math.max(1, Math.floor(b.h / 5));
      for (let r = 0; r < rows; r++) {
        const y = 3 + r * 5;
        if (y > b.h - 1.5) break;
        const s1 = new THREE.Mesh(new THREE.BoxGeometry(b.w * 0.8, 1.4, 0.2), winMat); s1.position.set(b.x, y, b.z + b.d / 2 + 0.05); world.add(s1);
        const s2 = s1.clone(); s2.position.z = b.z - b.d / 2 - 0.05; world.add(s2);
        const s3 = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.4, b.d * 0.8), winMat); s3.position.set(b.x + b.w / 2 + 0.05, y, b.z); world.add(s3);
        const s4 = s3.clone(); s4.position.x = b.x - b.w / 2 - 0.05; world.add(s4);
      }
      // roof detail
      const roof = new THREE.Mesh(new THREE.BoxGeometry(b.w * 0.4, 1.5, b.d * 0.4), kindMat.tower); roof.position.set(b.x + b.w * 0.15, b.h + 0.75, b.z - b.d * 0.15); world.add(roof);
    }
    if (b.kind === 'crate') {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(b.w * 1.01, b.h * 0.15, b.d * 1.01), mat(0xd8b23a)); stripe.position.set(b.x, b.h * 0.5, b.z); world.add(stripe);
    }
  }

  // beacons
  const beaconObjs = MAP.beacons.map(b => {
    const g = new THREE.Group(); g.position.set(b.x, 0, b.z);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(4, 4.5, 0.8, 16), mat(0x333940, { metalness: 0.4 })); base.position.y = 0.4; g.add(base);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 12, 8), mat(0x9aa4ad, { metalness: 0.6 })); pole.position.y = 6.4; g.add(pole);
    const flagMat = new THREE.MeshBasicMaterial({ color: 0xbbbbbb, side: THREE.DoubleSide });
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(5, 3), flagMat); flag.position.set(2.5, 11, 0); g.add(flag);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xbbbbbb, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false });
    const ring = new THREE.Mesh(new THREE.RingGeometry(20, 22, 48), ringMat); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.1; g.add(ring);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 60, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0xbbbbbb, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false })); beam.position.y = 30; g.add(beam);
    // label sprite
    const label = makeLabel(b.name); label.position.y = 16; label.scale.set(8, 4, 1); g.add(label);
    world.add(g);
    return { group: g, flagMat, ringMat, beamMat: beam.material, ring };
  });

  // sky-ish: distant silhouettes
  const farMat = mat(0x1b2129, { roughness: 1 });
  for (let i = 0; i < 40; i++) {
    const ang = i / 40 * Math.PI * 2;
    const rad = 520 + Math.random() * 120;
    const h = 30 + Math.random() * 90;
    const m = new THREE.Mesh(new THREE.BoxGeometry(30 + Math.random() * 50, h, 30 + Math.random() * 50), farMat);
    m.position.set(Math.cos(ang) * rad, h / 2, Math.sin(ang) * rad);
    world.add(m);
  }

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
