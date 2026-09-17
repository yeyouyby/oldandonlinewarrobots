// Procedural low-poly robot + weapon meshes, in the style of the 2018 hangar.
import * as THREE from 'three';
import { ROBOTS, WEAPONS } from '/shared/data.js';

const TEAM_COLORS = { 0: 0x2f7fd8, 1: 0xd8432f, self: 0xffb020 };
const matCache = new Map();

export function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (matCache.has(key)) return matCache.get(key);
  const m = new THREE.MeshStandardMaterial({ color, roughness: opts.roughness ?? 0.65, metalness: opts.metalness ?? 0.35, emissive: opts.emissive ?? 0x000000, emissiveIntensity: opts.emissiveIntensity ?? 1, flatShading: true, transparent: !!opts.transparent, opacity: opts.opacity ?? 1 });
  matCache.set(key, m);
  return m;
}

const G = {
  box: (w, h, d) => new THREE.BoxGeometry(w, h, d),
  cyl: (rt, rb, h, s = 8) => new THREE.CylinderGeometry(rt, rb, h, s),
};

function box(w, h, d, m, x = 0, y = 0, z = 0) {
  const me = new THREE.Mesh(G.box(w, h, d), m); me.position.set(x, y, z); me.castShadow = true; me.receiveShadow = true; return me;
}
function cyl(rt, rb, h, m, x = 0, y = 0, z = 0, seg = 8) {
  const me = new THREE.Mesh(G.cyl(rt, rb, h, seg), m); me.position.set(x, y, z); me.castShadow = true; return me;
}

// ------------------------------------------------------------ Weapons
export function buildWeapon(key, teamColor) {
  const def = WEAPONS[key];
  const g = new THREE.Group();
  const dark = mat(0x2b2f36, { metalness: 0.6, roughness: 0.5 });
  const steel = mat(0x8a9099, { metalness: 0.7, roughness: 0.4 });
  const accent = mat(teamColor);
  const scale = def.slot === 'L' ? 0.8 : def.slot === 'M' ? 1.0 : 1.35;
  switch (def.kind) {
    case 'mg': {
      g.add(box(0.9, 0.9, 1.6, dark, 0, 0, -0.4));
      g.add(box(0.7, 0.5, 0.6, accent, 0, 0.6, -0.5));
      const barrels = new THREE.Group();
      const n = def.slot === 'H' ? 8 : 6;
      for (let i = 0; i < n; i++) {
        const a = i / n * Math.PI * 2;
        const b = cyl(0.08, 0.08, 2.6, steel, Math.cos(a) * 0.28, Math.sin(a) * 0.28, 1.3);
        b.rotation.x = Math.PI / 2; barrels.add(b);
      }
      barrels.add(cyl(0.34, 0.34, 0.3, dark, 0, 0, 2.5).rotateX(Math.PI / 2));
      barrels.name = 'spin';
      g.add(barrels);
      break;
    }
    case 'rocket': case 'artillery': {
      const w = def.slot === 'H' ? 1.6 : 1.3;
      g.add(box(w, w * 0.8, 2.2, dark, 0, 0, 0.2));
      g.add(box(w * 0.9, w * 0.2, 0.8, accent, 0, w * 0.5, -0.4));
      const tubes = def.slot === 'L' ? [2, 2] : def.slot === 'M' ? [3, 3] : [3, 4];
      for (let i = 0; i < tubes[0]; i++) for (let j = 0; j < tubes[1]; j++) {
        const t = cyl(0.14, 0.14, 0.3, mat(0x111111), (i - (tubes[0] - 1) / 2) * (w / tubes[0]), (j - (tubes[1] - 1) / 2) * (w * 0.8 / tubes[1]), 1.35);
        t.rotation.x = Math.PI / 2; g.add(t);
      }
      break;
    }
    case 'homing': {
      g.add(box(1.2, 0.5, 1.6, dark, 0, 0, 0));
      for (let i = 0; i < 4; i++) {
        const m = cyl(0.12, 0.12, 1.2, steel, (i - 1.5) * 0.3, 0.45, 0); m.rotation.x = Math.PI / 2; g.add(m);
      }
      g.add(box(1.2, 0.15, 1.6, accent, 0, 0.7, 0));
      break;
    }
    case 'plasma': {
      g.add(box(0.9, 0.9, 1.8, dark, 0, 0, -0.3));
      const barrel = cyl(0.22, 0.28, 2.4, steel, 0, 0, 1.4); barrel.rotation.x = Math.PI / 2; g.add(barrel);
      for (let i = 0; i < 3; i++) {
        const ring = cyl(0.4, 0.4, 0.12, mat(0x2fe0ff, { emissive: 0x2fe0ff, emissiveIntensity: 1.2 }), 0, 0, 0.7 + i * 0.6); ring.rotation.x = Math.PI / 2; g.add(ring);
      }
      break;
    }
    case 'beam': {
      g.add(box(0.7, 0.9, 2.0, dark, 0, 0, -0.2));
      const barrel = cyl(0.12, 0.16, 3.6, steel, 0, 0, 2.2); barrel.rotation.x = Math.PI / 2; g.add(barrel);
      g.add(box(0.5, 0.3, 1.2, mat(0xff5030, { emissive: 0xff3010, emissiveIntensity: 0.8 }), 0, 0.5, 0.2));
      break;
    }
    case 'lightning': {
      g.add(box(1.1, 1.0, 1.6, dark, 0, 0, -0.2));
      const coil = cyl(0.35, 0.35, 1.6, mat(0x3a4aff, { emissive: 0x4060ff, emissiveIntensity: 1.0 }), 0, 0, 1.2); coil.rotation.x = Math.PI / 2; g.add(coil);
      for (let i = 0; i < 3; i++) { const p = cyl(0.06, 0.06, 1.0, steel, 0, 0.45 + i * 0.0, 0.6 + i * 0.5); p.rotation.z = Math.PI / 2; g.add(p); }
      break;
    }
    case 'cannon': {
      g.add(box(1.2, 1.2, 2.4, dark, 0, 0, -0.2));
      const barrel = cyl(0.18, 0.24, 4.5, steel, 0, 0, 2.8); barrel.rotation.x = Math.PI / 2; g.add(barrel);
      const brake = cyl(0.3, 0.3, 0.5, dark, 0, 0, 4.9); brake.rotation.x = Math.PI / 2; g.add(brake);
      g.add(box(1.0, 0.3, 1.0, accent, 0, 0.7, -0.3));
      break;
    }
    case 'shotgun': {
      g.add(box(1.4, 1.0, 2.0, dark, 0, 0, 0));
      const n = def.slot === 'H' ? 4 : 2;
      for (let i = 0; i < n; i++) { const b = cyl(0.2, 0.2, 1.8, steel, (i - (n - 1) / 2) * 0.5, 0.1, 1.5); b.rotation.x = Math.PI / 2; g.add(b); }
      g.add(box(1.2, 0.2, 1.4, accent, 0, 0.6, 0));
      break;
    }
    case 'flame': {
      g.add(box(1.3, 1.3, 2.0, dark, 0, 0, 0));
      const tank = cyl(0.5, 0.5, 1.6, mat(0xff7a1a), 0, 0.9, -0.2); tank.rotation.x = Math.PI / 2; g.add(tank);
      const nz = cyl(0.3, 0.15, 1.6, steel, 0, 0, 1.6); nz.rotation.x = Math.PI / 2; g.add(nz);
      break;
    }
  }
  g.scale.setScalar(scale);
  g.userData.muzzle = new THREE.Vector3(0, 0, 2.5 * scale);
  return g;
}

// ------------------------------------------------------------ Robots
// Returns { group, torso, legs:[...], hardpoints:[Object3D], setWeapons(keys) }
export function buildRobot(key, team, isSelf = false) {
  const def = ROBOTS[key];
  const teamColor = isSelf ? TEAM_COLORS.self : TEAM_COLORS[team];
  const hull = mat(isSelf ? 0x5a6a7a : team === 0 ? 0x4a5f78 : 0x785048);
  const hullDark = mat(0x23292f, { metalness: 0.5 });
  const accent = mat(teamColor, { emissive: teamColor, emissiveIntensity: 0.15 });
  const glass = mat(0x8fe3ff, { emissive: 0x2fb0ff, emissiveIntensity: 0.6, metalness: 0.9, roughness: 0.2 });
  const s = def.cls === 'light' ? 0.85 : def.cls === 'medium' ? 1.0 : 1.25;

  const group = new THREE.Group();
  const legs = new THREE.Group();
  const torso = new THREE.Group();
  group.add(legs, torso);

  // --- legs (reverse-joint bird legs like WR)
  const legParts = [];
  const hipY = 4.2 * s;
  const legSpread = (def.cls === 'heavy' ? 1.9 : 1.5) * s;
  for (const side of [-1, 1]) {
    const hip = new THREE.Group(); hip.position.set(side * legSpread, hipY, 0);
    const thigh = box(0.7 * s, 2.4 * s, 0.9 * s, hullDark, 0, -1.1 * s, 0.3 * s); thigh.rotation.x = 0.5;
    const knee = new THREE.Group(); knee.position.set(0, -2.1 * s, 1.0 * s);
    const shin = box(0.55 * s, 2.4 * s, 0.7 * s, hull, 0, -1.1 * s, -0.4 * s); shin.rotation.x = -0.7;
    const foot = box(1.1 * s, 0.35 * s, 1.8 * s, hullDark, 0, -2.2 * s, -0.6 * s);
    knee.add(shin, foot);
    hip.add(thigh, knee);
    hip.add(cyl(0.6 * s, 0.6 * s, 0.9 * s, accent, 0, 0, 0).rotateZ(Math.PI / 2));
    legs.add(hip);
    legParts.push({ hip, knee, side });
  }
  // pelvis
  legs.add(box(legSpread * 2 + 0.6 * s, 1.0 * s, 1.6 * s, hullDark, 0, hipY, 0));

  // --- torso
  torso.position.y = hipY + 0.9 * s;
  const shape = torsoShape(def);
  const body = box(shape.w * s, shape.h * s, shape.d * s, hull, 0, shape.h * s / 2, 0);
  torso.add(body);
  // cockpit
  torso.add(box(shape.w * 0.5 * s, shape.h * 0.45 * s, 0.6 * s, glass, 0, shape.h * 0.6 * s, shape.d * s / 2 + 0.2 * s));
  // stripes
  torso.add(box(shape.w * s * 1.02, 0.25 * s, shape.d * s * 0.6, accent, 0, shape.h * 0.25 * s, 0));
  // back exhaust / details
  torso.add(box(shape.w * 0.8 * s, 0.6 * s, 0.8 * s, hullDark, 0, shape.h * s * 0.9, -shape.d * s / 2));
  if (def.ability?.type === 'jump' || def.ability?.type === 'descend') {
    for (const side of [-1, 1]) torso.add(cyl(0.35 * s, 0.5 * s, 1.2 * s, hullDark, side * shape.w * 0.5 * s, 0.2 * s, -shape.d * 0.45 * s));
  }

  // --- hardpoints
  const hardpoints = [];
  const hpLayout = hardpointLayout(def, shape, s);
  hpLayout.forEach((pos) => {
    const hp = new THREE.Group(); hp.position.copy(pos); torso.add(hp);
    hardpoints.push(hp);
  });

  // --- shields
  let pshield = null, ancile = null;
  if (def.pshield) {
    const ps = def.pshield;
    const sh = new THREE.Mesh(new THREE.BoxGeometry(shape.w * s * 1.1, shape.h * s * 1.6, 0.35 * s), mat(0x9aa4ad, { metalness: 0.8, roughness: 0.3 }));
    const holder = new THREE.Group();
    holder.rotation.y = ps.side * Math.PI / 180;
    sh.position.set(0, shape.h * s * 0.3, (shape.d / 2 + 1.2) * s);
    sh.castShadow = true;
    holder.add(sh);
    if (ps.side === 0 && def.key !== 'raijin') {
      // Lancelot/Rhino style double front plates
      const sh2 = sh.clone(); sh2.position.x = -shape.w * s * 0.55; sh.position.x = shape.w * s * 0.55; holder.add(sh2);
    }
    holder.name = 'pshield';
    (ps.side === 0 ? torso : legs).add(holder);
    if (ps.side !== 0) holder.position.y = torso.position.y; // relative to legs
    pshield = { holder, mesh: sh, def: ps };
  }
  if (def.ancile) {
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(shape.w * s * 1.5, 16, 12), new THREE.MeshBasicMaterial({ color: 0x40d0ff, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false }));
    sphere.position.y = shape.h * s * 0.5;
    sphere.scale.y = 1.2;
    torso.add(sphere);
    ancile = sphere;
  }

  const obj = {
    group, torso, legs, legParts, hardpoints, pshield, ancile, def, weaponMeshes: [], scale: s,
    setWeapons(keys) {
      this.weaponMeshes.forEach(m => m.parent && m.parent.remove(m));
      this.weaponMeshes = [];
      keys.forEach((k, i) => {
        if (!k || !hardpoints[i]) return;
        const wm = buildWeapon(k, teamColor);
        hardpoints[i].add(wm);
        this.weaponMeshes[i] = wm;
      });
    },
    setStealth(on) {
      group.traverse(o => { if (o.isMesh) { o.material = on ? stealthMat : o.userData.origMat || o.material; if (!on) o.userData.origMat = null; else if (!o.userData.origMat) o.userData.origMat = o.material === stealthMat ? o.userData.origMat : o.material; } });
    },
  };
  // preserve original materials for stealth toggling
  group.traverse(o => { if (o.isMesh) o.userData.origMat = o.material; });
  obj.setStealth = (on) => { group.traverse(o => { if (o.isMesh && o.userData.origMat) o.material = on ? stealthMat : o.userData.origMat; }); };
  return obj;
}

const stealthMat = new THREE.MeshBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.22, wireframe: true });

function torsoShape(def) {
  switch (def.cls) {
    case 'light': return { w: 2.6, h: 2.2, d: 3.2 };
    case 'medium': return { w: 3.4, h: 2.6, d: 4.0 };
    default: return { w: 4.4, h: 3.0, d: 5.0 };
  }
}

function hardpointLayout(def, shape, s) {
  const out = [];
  const slots = def.slots;
  const top = shape.h * s + 0.3 * s;
  const sideX = (shape.w / 2 + 0.7) * s;
  const midY = shape.h * s * 0.55;
  // heavies on shoulders (top), mediums on sides, lights on outer sides/top
  const byType = { H: [], M: [], L: [] };
  slots.forEach((t, i) => byType[t].push(i));
  const positions = new Array(slots.length);
  const hs = byType.H, ms = byType.M, ls = byType.L;
  if (hs.length === 1) positions[hs[0]] = new THREE.Vector3(slots.length === 1 ? 0 : -sideX * 0.9, top + 0.6 * s, -0.2 * s);
  else if (hs.length === 2) { positions[hs[0]] = new THREE.Vector3(-sideX * 0.8, top + 0.6 * s, -0.2 * s); positions[hs[1]] = new THREE.Vector3(sideX * 0.8, top + 0.6 * s, -0.2 * s); }
  else if (hs.length === 3) { positions[hs[0]] = new THREE.Vector3(-sideX * 0.9, top + 0.6 * s, -0.4 * s); positions[hs[1]] = new THREE.Vector3(0, top + 1.4 * s, -0.6 * s); positions[hs[2]] = new THREE.Vector3(sideX * 0.9, top + 0.6 * s, -0.4 * s); }
  if (ms.length === 1) positions[ms[0]] = new THREE.Vector3(hs.length ? sideX : (slots.length === 1 ? sideX * 0.7 : 0), hs.length ? midY : top + 0.4 * s, 0);
  else if (ms.length === 2) { positions[ms[0]] = new THREE.Vector3(-sideX, hs.length ? midY : top + 0.4 * s, 0); positions[ms[1]] = new THREE.Vector3(sideX, hs.length ? midY : top + 0.4 * s, 0); }
  else if (ms.length === 3) { positions[ms[0]] = new THREE.Vector3(-sideX, midY, 0); positions[ms[1]] = new THREE.Vector3(0, top + 0.5 * s, -0.3 * s); positions[ms[2]] = new THREE.Vector3(sideX, midY, 0); }
  else if (ms.length === 4) { positions[ms[0]] = new THREE.Vector3(-sideX, midY, 0); positions[ms[1]] = new THREE.Vector3(-sideX * 0.45, top + 0.6 * s, -0.3 * s); positions[ms[2]] = new THREE.Vector3(sideX * 0.45, top + 0.6 * s, -0.3 * s); positions[ms[3]] = new THREE.Vector3(sideX, midY, 0); }
  const lightY = (hs.length || ms.length) ? (ms.length && hs.length ? top + 0.5 * s : midY) : top + 0.3 * s;
  const lightSpots = [
    new THREE.Vector3(-sideX * (ms.length ? 0.5 : 1), lightY, 0.3 * s), new THREE.Vector3(sideX * (ms.length ? 0.5 : 1), lightY, 0.3 * s),
    new THREE.Vector3(-sideX * 1.15, lightY - 0.8 * s, 0.2 * s), new THREE.Vector3(sideX * 1.15, lightY - 0.8 * s, 0.2 * s),
  ];
  if (ls.length === 1) positions[ls[0]] = new THREE.Vector3(-sideX, midY, 0.3 * s);
  else if (ls.length === 3) { positions[ls[0]] = lightSpots[2]; positions[ls[1]] = lightSpots[3]; positions[ls[2]] = new THREE.Vector3(sideX * 0.0, top + 0.4 * s, 0.4 * s); if (hs.length === 1) { positions[ls[2]] = new THREE.Vector3(sideX * 0.9, top + 0.4 * s, 0); } }
  else ls.forEach((idx, i) => positions[idx] = lightSpots[i]);
  // Special: lights on Gl. Patton 4 spots symmetrical, adjust
  if (def.name === 'Gl. Patton') { positions[0] = new THREE.Vector3(-sideX * 0.6, top + 0.4 * s, 0); positions[1] = new THREE.Vector3(sideX * 0.6, top + 0.4 * s, 0); positions[2] = new THREE.Vector3(-sideX * 1.1, midY, 0.2 * s); positions[3] = new THREE.Vector3(sideX * 1.1, midY, 0.2 * s); }
  if (def.name === 'Strider') { positions[0] = new THREE.Vector3(-sideX * 0.5, top + 0.4 * s, 0); positions[1] = new THREE.Vector3(sideX * 0.5, top + 0.4 * s, 0); positions[2] = new THREE.Vector3(-sideX * 1.1, midY, 0.2 * s); positions[3] = new THREE.Vector3(sideX * 1.1, midY, 0.2 * s); }
  if (def.name === 'Leo') { positions[1] = new THREE.Vector3(sideX * 0.9, top + 0.4 * s, 0); positions[2] = new THREE.Vector3(-sideX * 1.1, midY, 0.2 * s); positions[3] = new THREE.Vector3(sideX * 1.1, midY, 0.2 * s); }
  for (let i = 0; i < slots.length; i++) out.push(positions[i] || new THREE.Vector3(0, top, 0));
  return out;
}

// walking animation
export function animateRobot(obj, t, speed, airborne) {
  const s = obj.scale;
  const freq = 1.6 + Math.min(speed, 18) * 0.12;
  const amp = speed > 0.1 ? Math.min(0.55, 0.25 + speed * 0.03) : 0;
  obj.legParts.forEach(({ hip, knee, side }) => {
    const ph = t * freq * Math.PI * 2 + (side > 0 ? Math.PI : 0);
    if (airborne) { hip.rotation.x = -0.6; knee.rotation.x = 1.0; return; }
    hip.rotation.x = Math.sin(ph) * amp;
    knee.rotation.x = Math.max(0, Math.cos(ph)) * amp * 1.2;
  });
  // bob
  obj.torso.position.y = (4.2 * s + 0.9 * s) + (speed > 0.1 && !airborne ? Math.abs(Math.sin(t * freq * Math.PI * 2)) * 0.25 * s : 0);
  // spin mg barrels
}
