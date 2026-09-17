import { ROBOTS, WEAPONS, MATCH, robotMaxLevel, weaponMaxLevel } from '../shared/data.js';
import { MAP, mapBounds } from '../shared/map.js';
import { losClear, dist2d, clamp } from '../shared/geom.js';

const BOUNDS = mapBounds();

export const BOT_NAMES = [
  'IronWolf', 'Kasatka', 'RedBaron', 'Nightfall', 'Sgt.Pepper', 'Grom', 'Valkyrie', 'DeadEye', 'Tovarish', 'Hoplite',
  'Blitz', 'Kestrel', 'Mamba', 'Orbit', 'Frostbite', 'Tundra', 'Sable', 'Jaeger', 'Nomad', 'Ronin',
  'Havoc', 'Steppe', 'Bastion', 'Zoya', 'Kuznets', 'Falcon9', 'Marauder', 'Cinder', 'Ozone', 'Tempest',
];

const LIGHT_PICKS = { L: ['punisher', 'punisher', 'molot', 'pin', 'pinata', 'magnum', 'gust', 'spiral', 'aphid'], M: ['punisher_t', 'molot_t', 'tulumbas', 'orkan', 'taran', 'storm', 'hydra'], H: ['thunder', 'nashorn', 'kang_dae', 'zenit', 'zeus', 'trident'] };
const ROBOT_POOL_LOW = ['destrier', 'cossack', 'patton', 'vityaz', 'golem', 'boa', 'gareth', 'gepard'];
const ROBOT_POOL_MID = ['patton', 'vityaz', 'golem', 'boa', 'rogatka', 'galahad', 'griffin', 'leo', 'natasha', 'stalker', 'gareth', 'carnage', 'rhino', 'lancelot'];
const ROBOT_POOL_HIGH = ['griffin', 'leo', 'natasha', 'fury', 'lancelot', 'carnage', 'rhino', 'fujin', 'raijin', 'kumiho', 'haechi', 'bulgasari', 'strider', 'spectre', 'inquisitor', 'rogatka', 'galahad'];

function pick(a) { return a[Math.floor(Math.random() * a.length)]; }

// Build a themed loadout: mostly matched weapons of same range class
export function randomBotHangar(avgLevel) {
  const lvl = Math.round(avgLevel);
  const pool = lvl <= 3 ? ROBOT_POOL_LOW : lvl <= 7 ? ROBOT_POOL_MID : ROBOT_POOL_HIGH;
  const n = 3;
  const out = [];
  for (let i = 0; i < n; i++) {
    const key = pick(pool);
    const def = ROBOTS[key];
    const level = clamp(lvl + Math.floor(Math.random() * 3) - 1, def.minLevel, robotMaxLevel(def));
    // pick a range theme
    const theme = pick(['close', 'close', 'mid', 'long']);
    const weapons = def.slots.map(slot => {
      const candidates = Object.entries(WEAPONS).filter(([k, w]) => w.slot === slot && (
        theme === 'close' ? w.range <= 350 : theme === 'mid' ? (w.range >= 350 && w.range <= 600) : w.range >= 800));
      const list = candidates.length ? candidates.map(c => c[0]) : LIGHT_PICKS[slot];
      const wk = lvl <= 3 ? pick(LIGHT_PICKS[slot].filter(k => WEAPONS[k].slot === slot)) : pick(list);
      const wd = WEAPONS[wk];
      const wl = clamp(level + Math.floor(Math.random() * 2), wd.minLevel, weaponMaxLevel(wd));
      return { key: wk, level: wl };
    });
    out.push({ key, level, weapons });
  }
  return out;
}

export class BotBrain {
  constructor(p, room, nav) {
    this.p = p; this.room = room; this.nav = nav;
    this.path = null; this.pathT = 0; this.goal = null; this.goalT = 0;
    this.think_acc = Math.random() * 0.3;
    this.strafeDir = Math.random() < 0.5 ? 1 : -1;
    this.strafeT = 0;
    this.aggr = 0.6 + Math.random() * 0.4;
    this.reaction = 0;
  }

  think(dt) {
    const p = this.p, r = p.robot;
    if (!r) return;
    this.think_acc += dt;
    this.pathT -= dt; this.goalT -= dt; this.strafeT -= dt; this.reaction -= dt;
    const inp = p.input;

    // ---- targeting
    const maxRange = Math.max(...r.weapons.filter(Boolean).map(w => w.def.range), 100);
    const prefRange = this.preferredRange(r);
    let best = null, bestScore = Infinity;
    for (const q of this.room.players.values()) {
      if (q.team === p.team || !q.robot) continue;
      const e = q.robot;
      if (e.stealthT > 0) continue;
      const d = dist2d(r.x, r.z, e.x, e.z);
      if (d > Math.max(maxRange, 600) * 1.2) continue;
      const los = losClear(r.x, r.y + r.height * 0.6, r.z, e.x, e.y + e.height * 0.5, e.z, BOUNDS);
      let score = d;
      if (!los) score += 400;
      if (e.hp / e.maxHp < 0.3) score -= 120;
      if (score < bestScore) { bestScore = score; best = { q, e, d, los }; }
    }

    if (best && best.d <= maxRange && best.los) {
      if (inp.target !== best.q.id) { this.reaction = 0.25 + Math.random() * 0.4; }
      inp.target = best.q.id;
      inp.fire = this.reaction <= 0 ? this.fireMaskFor(r, best.d) : 0;
    } else {
      inp.target = best && best.d <= maxRange ? best.q.id : null;
      inp.fire = 0;
    }

    // ---- objective selection
    if (!this.goal || this.goalT <= 0) {
      this.goal = this.chooseGoal(r, best);
      this.goalT = 3 + Math.random() * 3;
      this.path = null;
    }

    // ---- movement
    let mx = 0, mz = 0;
    const inCombat = best && best.d < maxRange * 1.1 && best.los;
    if (inCombat && (r.def.ability?.type === 'sentry' || r.def.ability?.type === 'bastion')) {
      // deploy when enemy in range
      if (!(r.modeSentry || r.modeBastion) && best.d < prefRange * 1.05) inp.ab++;
    } else if (r.modeSentry || r.modeBastion) {
      if (!inCombat && this.goalT < 1) inp.ab++;
    }

    if (inCombat && best.d < prefRange * 1.15 && this.goal.kind !== 'beaconUrgent') {
      // fighting stance: keep preferred range, strafe
      const dx = best.e.x - r.x, dz = best.e.z - r.z, d = best.d || 1;
      const nx = dx / d, nz = dz / d;
      let radial = 0;
      if (d < prefRange * 0.6) radial = -1; else if (d > prefRange * 0.95) radial = 0.8;
      if (this.strafeT <= 0) { this.strafeDir *= Math.random() < 0.6 ? -1 : 1; this.strafeT = 1.5 + Math.random() * 2; }
      const tang = this.strafeDir * 0.8;
      mx = nx * radial + (-nz) * tang;
      mz = nz * radial + (nx) * tang;
      const l = Math.hypot(mx, mz) || 1; mx /= l; mz /= l;
      // if we would leave cover badly, sometimes advance instead
      if (r.hp / r.maxHp < 0.25 && Math.random() < 0.02) { this.goal = this.chooseRetreat(r); this.goalT = 4; this.path = null; }
    } else {
      // follow path to goal
      const g = this.goal;
      if (!this.path || this.pathT <= 0) {
        this.path = this.nav.findPath(r.x, r.z, g.x, g.z) || [[g.x, g.z]];
        this.pathT = 2.5;
      }
      while (this.path.length && dist2d(r.x, r.z, this.path[0][0], this.path[0][1]) < 6) this.path.shift();
      if (this.path.length) {
        const [tx, tz] = this.path[0];
        const dx = tx - r.x, dz = tz - r.z, d = Math.hypot(dx, dz) || 1;
        mx = dx / d; mz = dz / d;
      } else if (g.kind.startsWith('beacon')) {
        // jitter around the beacon
        const ang = this.room.time * 0.5 + p.id;
        mx = Math.cos(ang) * 0.3; mz = Math.sin(ang) * 0.3;
      }
    }
    inp.mx = mx; inp.mz = mz;
    inp.yaw = r.yaw;

    // ---- abilities
    const ab = r.def.ability;
    if (ab && this.think_acc > 0.5) {
      this.think_acc = 0;
      switch (ab.type) {
        case 'jump':
          if (r.abilityCd <= 0 && ((inCombat && Math.random() < 0.35) || (best && best.d < prefRange * 2 && !best.los && Math.random() < 0.5))) inp.ab++;
          break;
        case 'descend':
          if (r.abilityCd <= 0 && inCombat && (r.hp / r.maxHp < 0.5 || Math.random() < 0.3)) inp.ab++;
          break;
        case 'dash':
          if (r.charges > 0 && inCombat && Math.random() < 0.4) inp.ab++;
          else if (r.charges >= ab.charges && !inCombat && Math.random() < 0.3) inp.ab++;
          break;
        case 'rush':
        case 'assault':
          if (r.abilityCd <= 0 && ((best && best.d > prefRange && best.d < prefRange * 2.5) || (!inCombat && Math.random() < 0.3))) inp.ab++;
          break;
        case 'stealth':
          if (r.abilityCd <= 0 && inCombat && (best.d < 250 || r.hp / r.maxHp < 0.5)) inp.ab++;
          break;
        case 'phalanx':
          if (inCombat !== r.phalanx) inp.ab++;
          break;
      }
    }
  }

  preferredRange(r) {
    const ws = r.weapons.filter(Boolean);
    if (!ws.length) return 200;
    const ranges = ws.map(w => w.def.range);
    const mn = Math.min(...ranges);
    return clamp(mn * 0.75, 90, 900);
  }

  fireMaskFor(r, d) {
    let m = 0;
    r.weapons.forEach((w, i) => { if (w && d <= w.def.range && w.ammo > 0) m |= 1 << i; });
    return m;
  }

  chooseGoal(r, best) {
    const p = this.p;
    const room = this.room;
    const options = [];
    MAP.beacons.forEach((b, i) => {
      const st = room.beacons[i];
      const d = dist2d(r.x, r.z, b.x, b.z);
      let score = d;
      if (st.owner === p.team && Math.abs(st.progress) >= 1) score += 900; // already ours
      else if (st.owner === -1) score -= 150;
      else score -= 50; // enemy: contest
      // how many allies already heading there
      let allies = 0;
      for (const q of room.players.values()) if (q.team === p.team && q !== p && q.brain && q.brain.goal && q.brain.goal.beacon === i) allies++;
      score += allies * 180;
      // center beacon slightly more valuable
      if (i === 2) score -= 60;
      score += Math.random() * 120;
      options.push({ kind: 'beacon', beacon: i, x: b.x + (Math.random() - 0.5) * 12, z: b.z + (Math.random() - 0.5) * 12, score });
    });
    if (best && this.aggr > 0.8) {
      options.push({ kind: 'hunt', x: best.e.x, z: best.e.z, score: best.d - 100 + Math.random() * 100 });
    }
    // team losing on beacons -> urgent
    const owned = [0, 0];
    for (const b of room.beacons) if (b.owner >= 0) owned[b.owner]++;
    options.sort((a, b) => a.score - b.score);
    const g = options[0];
    if (g.kind === 'beacon' && owned[p.team] < owned[1 - p.team]) g.kind = 'beaconUrgent';
    return g;
  }

  chooseRetreat(r) {
    // move toward own spawn side
    const sx = this.p.team === 0 ? -260 : 260;
    return { kind: 'retreat', x: sx + (Math.random() - 0.5) * 40, z: r.z * 0.5 };
  }
}
