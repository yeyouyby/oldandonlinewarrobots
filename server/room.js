import { ROBOTS, WEAPONS, MATCH, robotHp, robotSpeed, weaponDmg, robotMaxLevel, weaponMaxLevel, rewardFor } from '../shared/data.js';
import { MAP, mapBounds } from '../shared/map.js';
import { losClear, nearestBoxHit, angleDiff, clamp, dist2d } from '../shared/geom.js';
import { stepMotion, startJump, startDash } from '../shared/sim.js';
import { NavGrid } from './nav.js';
import { grantReward, clearActive } from './profiles.js';
import { sanitizeName } from '../shared/economy.js';
import { BotBrain, randomBotHangar, BOT_NAMES } from './bots.js';

const TICK = 1 / 20;
const SEND_EVERY = 1; // ticks
const BOUNDS = mapBounds();
const NAV = new NavGrid();

let nextPid = 1;
let nextProjId = 1;

// ------------------------------------------------------------------ helpers
function num(v, dflt) { const n = Number(v); return Number.isFinite(n) ? n : dflt; }

function safeHangar(h) {
  if (!Array.isArray(h)) return [];
  const out = [];
  for (const r of h.slice(0, 5)) {
    if (!r || !ROBOTS[r.key]) continue;
    const def = ROBOTS[r.key];
    const level = clamp(Number(r.level) || def.minLevel, def.minLevel, robotMaxLevel(def));
    const weapons = [];
    def.slots.forEach((slot, i) => {
      const w = r.weapons && r.weapons[i];
      if (w && WEAPONS[w.key] && WEAPONS[w.key].slot === slot) {
        const wd = WEAPONS[w.key];
        weapons.push({ key: w.key, level: clamp(Number(w.level) || wd.minLevel, wd.minLevel, weaponMaxLevel(wd)) });
      } else weapons.push(null);
    });
    out.push({ key: r.key, level, weapons });
  }
  return out;
}

export function makeRobot(entry, team, spawn) {
  const def = ROBOTS[entry.key];
  const maxHp = robotHp(def, entry.level);
  const r = {
    key: entry.key, def, level: entry.level,
    x: spawn.x, y: 0, z: spawn.z, yaw: team === 0 ? Math.PI / 2 : -Math.PI / 2, vy: 0,
    jumpT: 0, dashT: 0, dashDx: 0, dashDz: 0, animSpeed: 0, moving: false,
    radius: def.radius, height: def.height,
    hp: maxHp, maxHp,
    baseSpeed: robotSpeed(def, entry.level),
    torsoYaw: team === 0 ? Math.PI / 2 : -Math.PI / 2,
    target: null,
    fireMask: 0,
    weapons: entry.weapons.map(w => w ? makeWeapon(w) : null),
    abilityCd: 0, charges: def.ability?.charges || 0,
    stealthT: 0, rushT: 0, rushMult: def.ability?.mult || 1,
    modeSentry: false, modeBastion: false, modeAssault: false, phalanx: false,
    pshield: def.pshield ? { hp: def.pshield.hp * maxHp, max: def.pshield.hp * maxHp } : null,
    ancile: def.ancile ? { hp: def.ancile.sentryOnly ? 0 : def.ancile.hp * maxHp, max: def.ancile.hp * maxHp, downT: 0 } : null,
    lastDamageT: 0,
  };
  return r;
}

function makeWeapon(w) {
  const def = WEAPONS[w.key];
  return {
    key: w.key, def, level: w.level, dmg: weaponDmg(def, w.level),
    ammo: def.clip, reloadT: 0, nextT: 0, fireT: 0, idleT: 1, wasFiring: false, burstLeft: 0,
  };
}

function accuracy(def, dist) {
  if (def.falloff === 'punisher') {
    const pts = [[200, 1], [250, .9], [300, .69], [350, .51], [400, .38], [450, .35], [500, .25]];
    return tableLerp(pts, dist);
  }
  if (def.falloff === 'molot') {
    const pts = [[350, 1], [450, .85], [550, .65], [650, .45], [750, .32], [800, .25]];
    return tableLerp(pts, dist);
  }
  return 1;
}
function tableLerp(pts, x) {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (x <= pts[i][0]) { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i]; return y0 + (y1 - y0) * (x - x0) / (x1 - x0); }
  }
  return pts[pts.length - 1][1];
}
function shotgunFalloff(def, dist) {
  if (def.noFalloff) return 1;
  if (dist <= 100) return 1;
  return Math.max(0.2, 1 - (dist - 100) / (def.range - 100) * 0.8);
}

// ------------------------------------------------------------------ Room
export class Room {
  constructor(id, onEmpty) {
    this.id = id;
    this.onEmpty = onEmpty;
    this.players = new Map();
    this.phase = 'waiting'; // waiting | battle | ended
    this.time = 0;
    this.countdown = 12;
    this.timeLeft = MATCH.duration;
    this.score = [MATCH.teamBar, MATCH.teamBar];
    this.beacons = MAP.beacons.map(() => ({ owner: -1, progress: 0 }));
    this.projectiles = [];
    this.events = [];
    this.tick = 0;
    this.timer = setInterval(() => this.step(), TICK * 1000);
    this.usedSpawn = [0, 0];
    this.botNames = [...BOT_NAMES].sort(() => Math.random() - 0.5);
  }

  summary() { return { id: this.id, phase: this.phase, humans: this.humanCount(), players: this.players.size }; }
  humanCount() { let n = 0; for (const p of this.players.values()) if (p.human) n++; return n; }
  teamCount(t) { let n = 0; for (const p of this.players.values()) if (p.team === t) n++; return n; }

  humanTeamCount(t) { let n = 0; for (const p of this.players.values()) if (p.team === t && p.human) n++; return n; }

  // remove one bot from a team to make room for a human
  evictBot(team) {
    let victim = null;
    for (const p of this.players.values()) {
      if (p.human || p.team !== team) continue;
      if (!victim || (!p.robot && victim.robot)) victim = p;
    }
    if (!victim) return false;
    if (victim.robot) this.events.push({ k: 'leave', id: victim.id });
    this.players.delete(victim.id);
    return true;
  }

  addHuman(ws, msg) {
    const h0 = this.humanTeamCount(0), h1 = this.humanTeamCount(1);
    const team = h0 <= h1 ? 0 : 1;
    if (this.teamCount(team) >= MATCH.maxPlayers) this.evictBot(team);
    const p = {
      id: nextPid++, room: this, ws, human: true, team,
      name: sanitizeName(msg.name), token: msg.token || null,
      hangar: safeHangar(msg.hangar),
      used: [], robot: null, input: { mx: 0, mz: 0, fire: 0, target: null, ab: 0, yaw: 0 }, lastAb: 0, abResync: true,
      stats: { kills: 0, damage: 0, beacons: 0, deaths: 0 },
      spawnRequested: null, respawnAt: 0, lastSeen: Date.now(),
    };
    if (!p.hangar.length) p.hangar = [{ key: 'destrier', level: 1, weapons: [{ key: 'punisher', level: 1 }, { key: 'punisher', level: 1 }] }];
    this.players.set(p.id, p);
    this.send(p, { t: 'welcome', id: p.id, team, room: this.id, phase: this.phase, countdown: this.countdown });
    if (this.phase === 'battle') this.spawnRobot(p, 0);
    this.fillBots();
    return p;
  }

  // Hand the existing match participant over to a new socket (second tab / reconnect).
  // Nothing about the match state (robot, used list, stats) changes.
  takeOver(p, ws) {
    const old = p.ws;
    p.ws = ws;
    p.lastSeen = Date.now();
    // Drop the old socket's control state. The new client starts its ability counter from 0, so the
    // first input on this socket must re-baseline lastAb instead of being interpreted as a key press.
    p.input = { mx: 0, mz: 0, fire: 0, target: null, ab: 0, yaw: p.input.yaw };
    p.abResync = true;
    if (old && old !== ws) { try { old.send(JSON.stringify({ t: 'error', error: 'logged in elsewhere' })); old.close(4003, 'replaced'); } catch { /* ignore */ } }
    this.send(p, { t: 'welcome', id: p.id, team: p.team, room: this.id, phase: this.phase, countdown: this.countdown, resumed: true, used: [...p.used] });
    if (this.phase === 'battle' && !p.robot) this.send(p, { t: 'destroyed', left: p.hangar.length - p.used.length });
  }

  removeHuman(p) {
    if (!this.players.has(p.id)) return;
    if (p.robot) this.events.push({ k: 'leave', id: p.id });
    this.players.delete(p.id);
    if (p.token) clearActive(p.token, p);
    if (this.humanCount() === 0) { this.destroy(); return; }
    if (this.phase !== 'ended') this.fillBots();
  }

  destroy() {
    clearInterval(this.timer);
    for (const p of this.players.values()) {
      if (p.token) clearActive(p.token, p);
      if (p.human && p.ws) { try { p.ws.close(1000, 'room closed'); } catch { /* ignore */ } }
    }
    this.players.clear();
    this.onEmpty();
  }

  // level reference for bots: average human robot level
  humanLevel() {
    let sum = 0, n = 0;
    for (const p of this.players.values()) if (p.human) for (const r of p.hangar) { sum += r.level; n++; }
    return n ? sum / n : 3;
  }

  fillBots() {
    const lvl = this.humanLevel();
    for (const team of [0, 1]) {
      while (this.teamCount(team) < MATCH.maxPlayers) {
        const p = {
          id: nextPid++, room: this, ws: null, human: false, team,
          name: this.botNames.pop() || 'Bot' + nextPid,
          hangar: randomBotHangar(lvl), used: [], robot: null,
          input: { mx: 0, mz: 0, fire: 0, target: null, ab: 0, yaw: 0 }, lastAb: 0,
          stats: { kills: 0, damage: 0, beacons: 0, deaths: 0 },
          spawnRequested: null, respawnAt: 0,
        };
        p.brain = new BotBrain(p, this, NAV);
        this.players.set(p.id, p);
        if (this.phase === 'battle') this.spawnRobot(p, 0);
      }
    }
  }

  send(p, msg) {
    if (!p.ws || p.ws.readyState !== 1) return;
    try { p.ws.send(JSON.stringify(msg)); } catch { /* ignore */ }
  }

  onMessage(p, msg) {
    p.lastSeen = Date.now();
    if (msg.t === 'in') {
      let yaw = num(msg.yaw, 0);
      if (Math.abs(yaw) > 1e4) yaw = 0;
      yaw = Math.atan2(Math.sin(yaw), Math.cos(yaw)); // normalise to (-PI, PI]
      const target = msg.target == null ? null : num(msg.target, NaN);
      const ab = num(msg.ab, 0) | 0;
      if (p.abResync) { p.lastAb = ab; p.abResync = false; }
      p.input = {
        mx: clamp(num(msg.mx, 0), -1, 1), mz: clamp(num(msg.mz, 0), -1, 1),
        fire: num(msg.fire, 0) | 0, target: Number.isInteger(target) ? target : null,
        ab, yaw,
      };
    } else if (msg.t === 'spawn') {
      if (!p.robot && this.phase === 'battle' && p.respawnAt <= 0) this.spawnRobot(p, num(msg.index, 0) | 0);
    }
  }

  pickSpawn(team) {
    const list = MAP.spawns[team];
    const s = list[this.usedSpawn[team] % list.length];
    this.usedSpawn[team]++;
    return { x: s.x + (Math.random() - 0.5) * 6, z: s.z + (Math.random() - 0.5) * 6 };
  }

  spawnRobot(p, index) {
    if (p.robot) return;
    const avail = p.hangar.map((_, i) => i).filter(i => !p.used.includes(i));
    if (!avail.length) return;
    if (!avail.includes(index)) index = avail[0];
    p.used.push(index);
    const r = makeRobot(p.hangar[index], p.team, this.pickSpawn(p.team));
    r.owner = p.id;
    p.robot = r;
    p.input.target = null;
    p.input.fire = 0;
    this.events.push({ k: 'spawn', id: p.id, x: r.x, z: r.z });
  }

  robotsLeft(p) { return p.hangar.length - p.used.length + (p.robot ? 0 : 0); }

  // ------------------------------------------------------------ main loop
  step() {
    this.tick++;
    this.time += TICK;
    if (this.phase === 'waiting') {
      if (this.humanCount() > 0) this.countdown -= TICK;
      if (this.countdown <= 0) this.startBattle();
    } else if (this.phase === 'battle') {
      this.timeLeft -= TICK;
      this.simulate(TICK);
      this.checkEnd();
    } else if (this.phase === 'ended') {
      this.endTimer -= TICK;
      if (this.endTimer <= 0) { this.destroy(); return; }
    }
    if (this.tick % SEND_EVERY === 0) this.broadcast();
  }

  startBattle() {
    this.phase = 'battle';
    this.fillBots();
    for (const p of this.players.values()) this.spawnRobot(p, 0);
    this.events.push({ k: 'start' });
  }

  checkEnd() {
    let winner = -1;
    if (this.score[0] <= 0) winner = 1;
    else if (this.score[1] <= 0) winner = 0;
    else {
      const alive = [0, 0];
      for (const p of this.players.values()) if (p.robot || p.used.length < p.hangar.length) alive[p.team]++;
      if (alive[0] === 0 && alive[1] > 0) winner = 1;
      else if (alive[1] === 0 && alive[0] > 0) winner = 0;
      else if (this.timeLeft <= 0) {
        const b = [0, 0];
        for (const bc of this.beacons) if (bc.owner >= 0) b[bc.owner]++;
        if (b[0] !== b[1]) winner = b[0] > b[1] ? 0 : 1;
        else winner = this.score[0] === this.score[1] ? 2 : (this.score[0] > this.score[1] ? 0 : 1);
      }
    }
    if (winner >= 0) this.endBattle(winner);
  }

  endBattle(winner) {
    this.phase = 'ended';
    this.endTimer = 20;
    const results = [...this.players.values()].map(p => ({
      id: p.id, name: p.name, team: p.team, human: p.human, kills: p.stats.kills, damage: Math.round(p.stats.damage), beacons: p.stats.beacons,
    })).sort((a, b) => (b.damage + b.kills * 20000 + b.beacons * 15000) - (a.damage + a.kills * 20000 + a.beacons * 15000));
    for (const p of this.players.values()) {
      if (!p.human) continue;
      const win = winner === p.team;
      const reward = rewardFor(p.stats, win);
      const profile = (p.token && !p.rewarded) ? grantReward(p.token, reward, p.stats, win) : null;
      p.rewarded = true;
      if (p.token) clearActive(p.token, p); // hangar edits allowed again while the results screen is up
      this.send(p, { t: 'end', winner, win, draw: winner === 2, results, reward, stats: p.stats, profile });
    }
  }

  // ------------------------------------------------------------ simulation
  simulate(dt) {
    const robots = [];
    for (const p of this.players.values()) {
      if (!p.human && p.brain) p.brain.think(dt);
      if (p.robot) robots.push(p.robot);
    }
    // handle auto-respawn for bots & pending
    for (const p of this.players.values()) {
      if (!p.robot && p.used.length < p.hangar.length) {
        if (p.respawnAt > 0) p.respawnAt -= dt;
        if (!p.human && p.respawnAt <= 0) this.spawnRobot(p, p.used.length);
      }
    }

    for (const p of this.players.values()) {
      const r = p.robot; if (!r) continue;
      this.updateRobot(p, r, dt, robots);
    }
    this.updateProjectiles(dt, robots);
    this.updateBeacons(dt);
    // deaths
    for (const p of this.players.values()) {
      const r = p.robot; if (!r) continue;
      if (r.hp <= 0) this.killRobot(p, r);
    }
  }

  updateRobot(p, r, dt, robots) {
    const inp = p.input;
    const def = r.def;
    // timers
    if (r.abilityCd > 0) r.abilityCd -= dt;
    if (r.stealthT > 0) r.stealthT -= dt;
    if (r.rushT > 0) { r.rushT -= dt; if (r.rushT <= 0) r.modeAssault = false; }
    if (def.ability?.type === 'dash' && r.charges < def.ability.charges) {
      r.chargeT = (r.chargeT || 0) + dt;
      if (r.chargeT >= def.ability.cd) { r.chargeT = 0; r.charges++; }
    }
    // ancile regen
    if (r.ancile) {
      const active = !def.ancile.sentryOnly || r.modeSentry;
      if (r.ancile.downT > 0) { r.ancile.downT -= dt; if (r.ancile.downT <= 0) r.ancile.hp = r.ancile.max * 0.1; }
      else if (active && r.ancile.hp < r.ancile.max) r.ancile.hp = Math.min(r.ancile.max, r.ancile.hp + r.ancile.max * (def.ancile.regen) * dt);
    }

    // ability trigger (edge detect on counter)
    if (inp.ab !== p.lastAb) {
      p.lastAb = inp.ab;
      this.useAbility(p, r, inp);
    }

    // motion
    stepMotion(r, inp, dt, BOUNDS);

    // targeting
    let target = null;
    if (inp.target != null) {
      const tp = this.players.get(inp.target);
      if (tp && tp.robot && tp.team !== p.team && tp.robot.stealthT <= 0) target = tp.robot;
    }
    r.target = target;
    if (target) {
      const want = Math.atan2(target.x - r.x, target.z - r.z);
      r.torsoYaw += clamp(angleDiff(want, r.torsoYaw), -6 * dt, 6 * dt);
    } else {
      const want = inp.yaw || r.yaw;
      r.torsoYaw += clamp(angleDiff(want, r.torsoYaw), -6 * dt, 6 * dt);
    }

    // weapons
    r.fireMask = 0;
    const dmgMult = r.modeBastion ? (def.ability.mult || 1.25) : 1;
    r.weapons.forEach((w, i) => {
      if (!w) return;
      const wd = w.def;
      // reload logic
      if (wd.rwf) {
        if (w.ammo < wd.clip) { w.reloadT += dt; const per = wd.reload / wd.clip; while (w.reloadT >= per && w.ammo < wd.clip) { w.reloadT -= per; w.ammo++; } }
      } else if (w.ammo <= 0) {
        w.reloadT -= dt;
        if (w.reloadT <= 0) { w.ammo = wd.clip; }
      }
      if (w.nextT > 0) w.nextT -= dt;
      const wantFire = (inp.fire >> i) & 1;
      const inRange = target && dist2d(r.x, r.z, target.x, target.z) <= wd.range;
      const canFire = wantFire && target && inRange && w.ammo > 0 && w.nextT <= 0 && !r.modeAssault
        && (!wd.kind.match(/mg|cannon|shotgun|plasma|beam|lightning|rocket|flame/) || this.hasLOS(r, target));
      if (w.lastFireT != null && this.time - w.lastFireT < 0.25) r.fireMask |= (1 << i);
      // acceleration tracking
      if (w.wasFiring && wantFire && w.ammo > 0) { w.fireT += dt; w.idleT = 0; }
      else { w.idleT += dt; if (w.idleT > 1) w.fireT = 0; }
      w.wasFiring = wantFire && w.ammo > 0;

      if (canFire) {
        let interval = wd.interval;
        if (wd.kind === 'mg' && w.fireT > 3) interval /= 1.5;
        w.nextT += interval;
        if (w.nextT < 0) w.nextT = 0;
        this.fireWeapon(p, r, w, i, target, dmgMult);
        w.lastFireT = this.time;
        w.ammo--;
        if (w.ammo <= 0 && !wd.rwf) { w.reloadT = wd.reload; w.fireT = 0; }
        if (wd.kind === 'homing' && wd.salvo) {
          // launch full salvo at once
          while (w.ammo > 0) { this.fireWeapon(p, r, w, i, target, dmgMult); w.ammo--; }
          w.reloadT = wd.reload;
        }
      }
    });
  }

  useAbility(p, r, inp) {
    const ab = r.def.ability; if (!ab) return;
    const dirX = inp.mx, dirZ = inp.mz;
    switch (ab.type) {
      case 'jump':
        if (r.abilityCd <= 0 && r.vy === 0) { startJump(r, dirX, dirZ); r.abilityCd = ab.cd; this.events.push({ k: 'jump', id: p.id }); }
        break;
      case 'dash':
        if (r.charges > 0 && r.dashT <= 0) { r.charges--; startDash(r, dirX, dirZ); this.events.push({ k: 'dash', id: p.id }); }
        break;
      case 'rush':
        if (r.abilityCd <= 0) { r.rushT = ab.dur; r.rushMult = ab.mult; r.abilityCd = ab.cd; }
        break;
      case 'assault':
        if (r.abilityCd <= 0) { r.rushT = ab.dur; r.rushMult = ab.mult; r.modeAssault = true; r.abilityCd = ab.cd; }
        break;
      case 'stealth':
        if (r.abilityCd <= 0) { r.stealthT = ab.dur; r.abilityCd = ab.cd; this.events.push({ k: 'stealth', id: p.id }); }
        break;
      case 'descend':
        if (r.abilityCd <= 0 && r.vy === 0) { startJump(r, dirX, dirZ); r.stealthT = ab.dur; r.abilityCd = ab.cd; this.events.push({ k: 'jump', id: p.id }); }
        break;
      case 'phalanx': r.phalanx = !r.phalanx; break;
      case 'sentry': r.modeSentry = !r.modeSentry; if (!r.modeSentry && r.ancile) r.ancile.hp = 0; break;
      case 'bastion': r.modeBastion = !r.modeBastion; break;
    }
  }

  hasLOS(a, b) {
    return losClear(a.x, a.y + a.height * 0.6, a.z, b.x, b.y + b.height * 0.5, b.z, BOUNDS);
  }

  // compute lead point for projectile weapons
  leadPoint(r, target, speed) {
    const dx = target.x - r.x, dz = target.z - r.z;
    const dist = Math.hypot(dx, dz);
    const t = dist / speed;
    const vx = target.moving ? Math.sin(target.yaw) * (target.animSpeed || 0) : 0;
    const vz = target.moving ? Math.cos(target.yaw) * (target.animSpeed || 0) : 0;
    return { x: target.x + vx * t, y: target.y + target.height * 0.5, z: target.z + vz * t };
  }

  fireWeapon(p, r, w, slot, target, dmgMult) {
    const wd = w.def;
    const dist = dist2d(r.x, r.z, target.x, target.z);
    const base = w.dmg * dmgMult;
    const muzzle = { x: r.x + Math.sin(r.torsoYaw) * 2, y: r.y + r.height * 0.6, z: r.z + Math.cos(r.torsoYaw) * 2 };
    const ev = { k: 'fire', id: p.id, s: slot, w: wd.kind };
    switch (wd.kind) {
      case 'mg': {
        const hit = Math.random() < accuracy(wd, dist);
        ev.hit = hit ? 1 : 0; ev.tg = target.owner;
        if (hit) this.applyDamage(p, target, base, wd.type, r, false, 'mg');
        break;
      }
      case 'cannon': {
        ev.tg = target.owner; ev.hit = 1;
        this.applyDamage(p, target, base, wd.type, r, false, 'cannon');
        break;
      }
      case 'shotgun': {
        const f = shotgunFalloff(wd, dist);
        ev.tg = target.owner; ev.hit = 1;
        this.applyDamage(p, target, base * f, wd.type, r, false, 'shotgun');
        break;
      }
      case 'beam':
      case 'flame': {
        let d = base;
        if (wd.closeBonus) d *= 1 + clamp((150 - dist) / 100, 0, 1);
        ev.tg = target.owner; ev.hit = 1;
        this.applyDamage(p, target, d, wd.type, r, false, wd.kind);
        break;
      }
      case 'lightning': {
        ev.tg = target.owner; ev.hit = 1;
        this.applyDamage(p, target, base, wd.type, r, false, 'lightning');
        if (wd.chain) {
          // chain to nearest other enemy within 100m of target
          let best = null, bd = 100;
          for (const q of this.players.values()) {
            if (!q.robot || q.team === p.team || q.robot === target || q.robot.stealthT > 0) continue;
            const dd = dist2d(target.x, target.z, q.robot.x, q.robot.z);
            if (dd < bd) { bd = dd; best = q.robot; }
          }
          if (best) { this.applyDamage(p, best, base * wd.chain, wd.type, r, false, 'lightning'); ev.chain = best.owner; }
        }
        break;
      }
      case 'plasma':
      case 'rocket':
      case 'homing':
      case 'artillery': {
        const speed = wd.kind === 'plasma' ? (wd.slow ? 110 : 220) : wd.kind === 'rocket' ? 95 : wd.kind === 'homing' ? 75 : 90;
        const lp = this.leadPoint(r, target, speed);
        let dx = lp.x - muzzle.x, dy = lp.y - muzzle.y, dz = lp.z - muzzle.z;
        const len = Math.hypot(dx, dy, dz) || 1;
        dx /= len; dy /= len; dz /= len;
        const proj = {
          id: nextProjId++, kind: wd.kind, type: wd.type, team: p.team, owner: p.id, ownerRobot: r,
          x: muzzle.x, y: muzzle.y, z: muzzle.z, dmg: base, aoe: wd.aoe || 0, life: 8, target: wd.kind === 'homing' ? target : null,
          speed, wkey: wd.key,
        };
        if (wd.kind === 'rocket' || wd.kind === 'plasma') {
          const spread = wd.kind === 'rocket' ? 0.035 : 0.01;
          dx += (Math.random() - 0.5) * spread; dy += (Math.random() - 0.5) * spread; dz += (Math.random() - 0.5) * spread;
          const l2 = Math.hypot(dx, dy, dz);
          proj.vx = dx / l2 * speed; proj.vy = dy / l2 * speed; proj.vz = dz / l2 * speed;
          proj.life = wd.range / speed + 0.3;
        } else if (wd.kind === 'homing') {
          // launch upward with a bit of side spread, then home
          proj.vx = (Math.random() - 0.5) * 30; proj.vy = 45 + Math.random() * 10; proj.vz = (Math.random() - 0.5) * 30;
          proj.homeDelay = 0.35; proj.life = 7;
        } else if (wd.kind === 'artillery') {
          // ballistic: solve for arc to target position
          const g = 32;
          const tt = clamp(dist / 90, 1.2, 4);
          const tx = lp.x + (Math.random() - 0.5) * 14, tz = lp.z + (Math.random() - 0.5) * 14;
          proj.vx = (tx - muzzle.x) / tt; proj.vz = (tz - muzzle.z) / tt;
          proj.vy = (0 - muzzle.y) / tt + 0.5 * g * tt;
          proj.gravity = g; proj.life = tt + 0.5;
        }
        this.projectiles.push(proj);
        break;
      }
    }
    this.events.push(ev);
  }

  updateProjectiles(dt, robots) {
    const keep = [];
    for (const pr of this.projectiles) {
      pr.life -= dt;
      if (pr.kind === 'homing') {
        if (pr.homeDelay > 0) pr.homeDelay -= dt;
        else if (pr.target && pr.target.hp > 0 && pr.target.stealthT <= 0) {
          const tx = pr.target.x, ty = pr.target.y + pr.target.height * 0.5, tz = pr.target.z;
          let dx = tx - pr.x, dy = ty - pr.y, dz = tz - pr.z;
          const l = Math.hypot(dx, dy, dz) || 1; dx /= l; dy /= l; dz /= l;
          const sp = pr.speed;
          const turn = 4.5 * dt;
          let vx = pr.vx / sp, vy = pr.vy / sp, vz = pr.vz / sp;
          vx += (dx - vx) * turn * 1.5; vy += (dy - vy) * turn * 1.5; vz += (dz - vz) * turn * 1.5;
          const vl = Math.hypot(vx, vy, vz) || 1;
          pr.vx = vx / vl * sp; pr.vy = vy / vl * sp; pr.vz = vz / vl * sp;
        }
      }
      if (pr.gravity) pr.vy -= pr.gravity * dt;
      const ox = pr.x, oy = pr.y, oz = pr.z;
      const nx = pr.x + pr.vx * dt, ny = pr.y + pr.vy * dt, nz = pr.z + pr.vz * dt;
      const sdx = nx - ox, sdy = ny - oy, sdz = nz - oz;
      const slen = Math.hypot(sdx, sdy, sdz) || 1e-6;
      // robot hit test
      let hitRobot = null, hitT = slen;
      for (const r of robots) {
        if (r.team === pr.team || r === pr.ownerRobot) continue;
        if (this.ownerTeam(r) === pr.team) continue;
        const cx = r.x, cy = r.y + r.height * 0.5, cz = r.z;
        const rad = r.radius * 1.35;
        // closest point on segment to center
        const t = clamp(((cx - ox) * sdx + (cy - oy) * sdy + (cz - oz) * sdz) / (slen * slen), 0, 1);
        const px = ox + sdx * t, py = oy + sdy * t, pz = oz + sdz * t;
        const dd = Math.hypot(px - cx, (py - cy) * 0.6, pz - cz);
        if (dd < rad && t * slen < hitT) { hitT = t * slen; hitRobot = r; }
      }
      let boxT = -1;
      if (!hitRobot || pr.aoe) boxT = nearestBoxHit(ox, oy, oz, sdx / slen, sdy / slen, sdz / slen, slen, BOUNDS);
      const groundHit = ny <= 0;
      if (hitRobot && (boxT < 0 || hitT <= boxT)) {
        const ownerP = this.players.get(pr.owner);
        if (pr.aoe) this.explode(pr, ox + sdx / slen * hitT, oy + sdy / slen * hitT, oz + sdz / slen * hitT, hitRobot, robots, ownerP);
        else { if (ownerP) this.applyDamage(ownerP, hitRobot, pr.dmg, pr.type, pr.ownerRobot, false, pr.kind); this.events.push({ k: 'hit', x: hitRobot.x, y: hitRobot.y + hitRobot.height * 0.5, z: hitRobot.z, w: pr.kind, tg: hitRobot.owner }); }
        continue;
      }
      if (boxT >= 0 || groundHit || pr.life <= 0) {
        const ownerP = this.players.get(pr.owner);
        let hx = nx, hy = Math.max(0, ny), hz = nz;
        if (boxT >= 0) { hx = ox + sdx / slen * boxT; hy = oy + sdy / slen * boxT; hz = oz + sdz / slen * boxT; }
        if (pr.aoe) this.explode(pr, hx, hy, hz, null, robots, ownerP);
        else this.events.push({ k: 'hit', x: hx, y: hy, z: hz, w: pr.kind, env: 1 });
        continue;
      }
      pr.x = nx; pr.y = ny; pr.z = nz;
      keep.push(pr);
    }
    this.projectiles = keep;
  }

  ownerTeam(r) { const p = this.players.get(r.owner); return p ? p.team : -1; }

  explode(pr, x, y, z, direct, robots, ownerP) {
    this.events.push({ k: 'boom', x, y, z, r: pr.aoe, w: pr.kind });
    for (const r of robots) {
      if (this.ownerTeam(r) === pr.team) continue;
      const d = Math.hypot(r.x - x, (r.y + r.height * 0.5 - y) * 0.5, r.z - z);
      let dmg = 0;
      if (r === direct) dmg = pr.dmg;
      else if (d < pr.aoe + r.radius) dmg = pr.dmg * Math.max(0.35, 1 - (Math.max(0, d - r.radius) / pr.aoe));
      if (dmg > 0 && ownerP) this.applyDamage(ownerP, r, dmg, pr.type, pr.ownerRobot, r !== direct, pr.kind);
    }
  }

  // Apply damage from attacker robot `from` to `target`. Handles shields.
  applyDamage(attackerP, target, dmg, dmgType, from, isSplash, kind) {
    if (target.hp <= 0) return;
    const tp = this.players.get(target.owner);
    if (!tp || tp.team === attackerP.team) return;
    let remaining = dmg;
    // direction from target to attacker
    const ang = from ? Math.atan2(from.x - target.x, from.z - target.z) : target.yaw;
    // physical shield
    if (target.pshield && target.pshield.hp > 0 && !isSplash) {
      const ps = target.def.pshield;
      const active = (!ps.bastionOnly || target.modeBastion) && !target.modeAssault;
      if (active) {
        let side = ps.side * Math.PI / 180;
        if (target.phalanx) side = 0;
        const shieldDir = target.yaw + side;
        const rel = Math.abs(angleDiff(ang, shieldDir));
        if (rel < ps.arc * Math.PI / 180) {
          const mult = (kind === 'mg' || kind === 'shotgun') ? 2 : 1;
          const absorbed = Math.min(target.pshield.hp, remaining * mult);
          target.pshield.hp -= absorbed;
          remaining -= absorbed / mult;
          if (target.pshield.hp <= 0) this.events.push({ k: 'shieldbreak', id: target.owner });
          if (remaining <= 0.5) { attackerP.stats.damage += absorbed / mult; return; }
        }
      }
    }
    // ancile (energy shield): blocks kinetic + explosive, energy passes
    const ancileActive = target.ancile && target.ancile.hp > 0 && (!target.def.ancile.sentryOnly || target.modeSentry);
    if (ancileActive && dmgType !== 'energy') {
      const absorbed = Math.min(target.ancile.hp, remaining);
      target.ancile.hp -= absorbed;
      remaining -= absorbed;
      if (target.ancile.hp <= 0) { target.ancile.downT = 6; this.events.push({ k: 'ancilebreak', id: target.owner }); }
      attackerP.stats.damage += absorbed;
      if (remaining <= 0.5) return;
    }
    target.hp -= remaining;
    target.lastDamageT = this.time;
    target.lastAttacker = attackerP.id;
    attackerP.stats.damage += Math.min(remaining, Math.max(0, target.hp + remaining));
    if (kind !== 'mg' && kind !== 'beam' && kind !== 'flame') this.events.push({ k: 'dmg', tg: target.owner, d: Math.round(remaining), from: attackerP.id });
    else {
      // aggregate small ticks
      target.pendingDmg = (target.pendingDmg || 0) + remaining;
      target.pendingFrom = attackerP.id;
    }
  }

  killRobot(p, r) {
    p.robot = null;
    p.stats.deaths++;
    const killer = r.lastAttacker != null ? this.players.get(r.lastAttacker) : null;
    if (killer && killer.team !== p.team) killer.stats.kills++;
    this.events.push({ k: 'kill', id: p.id, by: killer ? killer.id : null, x: r.x, y: r.y, z: r.z, rk: r.key });
    p.respawnAt = MATCH.respawnDelay + (p.human ? 0 : 2 + Math.random() * 3);
    if (p.human) this.send(p, { t: 'destroyed', left: p.hangar.length - p.used.length });
  }

  updateBeacons(dt) {
    const rate = 1 / MATCH.captureTime;
    this.beacons.forEach((b, i) => {
      const def = MAP.beacons[i];
      const near = [0, 0];
      const nearP = [[], []];
      for (const p of this.players.values()) {
        const r = p.robot; if (!r) continue;
        if (dist2d(r.x, r.z, def.x, def.z) < MATCH.beaconRadius) { near[p.team]++; nearP[p.team].push(p); }
      }
      if (near[0] > 0 && near[1] > 0) return; // contested
      const team = near[0] > 0 ? 0 : near[1] > 0 ? 1 : -1;
      if (team < 0) return;
      if (b.owner === team && b.progress >= 1) return;
      const sign = team === 0 ? -1 : 1;
      // progress in [-1,1]: -1 = fully team0, +1 = fully team1
      const before = b.progress;
      b.progress = clamp(b.progress + sign * rate * Math.min(near[team], 3) * dt, -1, 1);
      const owner = b.progress <= -1 ? 0 : b.progress >= 1 ? 1 : (Math.sign(b.progress) === sign && b.owner === team ? team : (b.owner === team ? team : -1));
      // ownership changes when the bar passes through the neutral point in the capturing direction
      if (b.owner !== team && ((team === 0 && before > 0 && b.progress <= 0) || (team === 1 && before < 0 && b.progress >= 0) || (b.owner === -1 && Math.abs(b.progress) >= 1))) {
        b.owner = team;
        for (const q of nearP[team]) q.stats.beacons++;
        this.events.push({ k: 'beacon', i, team });
      }
      if (b.owner === -1 && Math.abs(b.progress) >= 1) { b.owner = team; for (const q of nearP[team]) q.stats.beacons++; this.events.push({ k: 'beacon', i, team }); }
      void owner;
    });
    // drain
    const owned = [0, 0];
    for (const b of this.beacons) if (b.owner >= 0) owned[b.owner]++;
    this.score[0] -= owned[1] * MATCH.drainPerBeacon * dt;
    this.score[1] -= owned[0] * MATCH.drainPerBeacon * dt;
  }

  // ------------------------------------------------------------ networking
  broadcast() {
    const robots = [];
    const players = [];
    for (const p of this.players.values()) {
      const r = p.robot;
      players.push({ id: p.id, n: p.name, t: p.team, h: p.human ? 1 : 0, k: p.stats.kills, d: Math.round(p.stats.damage), b: p.stats.beacons, left: p.hangar.length - p.used.length, alive: r ? 1 : 0 });
      if (!r) continue;
      if (r.pendingDmg > 0) { this.events.push({ k: 'dmg', tg: p.id, d: Math.round(r.pendingDmg), from: r.pendingFrom }); r.pendingDmg = 0; }
      robots.push({
        id: p.id, k: r.key, lv: r.level,
        x: +r.x.toFixed(2), y: +r.y.toFixed(2), z: +r.z.toFixed(2), yaw: +r.yaw.toFixed(3), ty: +r.torsoYaw.toFixed(3),
        hp: Math.round(r.hp), mhp: r.maxHp,
        ps: r.pshield ? +(r.pshield.hp / r.pshield.max).toFixed(2) : undefined,
        an: r.ancile ? +(r.ancile.hp / r.ancile.max).toFixed(2) : undefined,
        st: r.stealthT > 0 ? 1 : 0,
        md: (r.modeSentry ? 1 : 0) | (r.modeBastion ? 2 : 0) | (r.modeAssault ? 4 : 0) | (r.phalanx ? 8 : 0) | (r.rushT > 0 ? 16 : 0) | (r.dashT > 0 ? 32 : 0),
        sp: +r.animSpeed.toFixed(1), f: r.fireMask, tg: r.target ? r.target.owner : null,
        w: r.weapons.map(w => w ? w.key : null),
      });
    }
    const projs = this.projectiles.map(pr => ({ id: pr.id, k: pr.kind, x: +pr.x.toFixed(1), y: +pr.y.toFixed(1), z: +pr.z.toFixed(1), t: pr.team }));
    const base = {
      t: 's', time: +this.time.toFixed(2), phase: this.phase, cd: Math.max(0, this.countdown), left: Math.max(0, this.timeLeft),
      score: [Math.max(0, Math.round(this.score[0])), Math.max(0, Math.round(this.score[1]))],
      beacons: this.beacons.map(b => [b.owner, +b.progress.toFixed(2)]),
      robots, players, projs, ev: this.events,
    };
    for (const p of this.players.values()) {
      if (!p.human) continue;
      const r = p.robot;
      const me = r ? {
        w: r.weapons.map(w => w ? { a: w.ammo, c: w.def.clip, r: w.def.rwf ? 0 : +(w.reloadT).toFixed(1) } : null),
        cd: +Math.max(0, r.abilityCd).toFixed(1), ch: r.charges, st: +Math.max(0, r.stealthT).toFixed(1),
        rush: +Math.max(0, r.rushT).toFixed(1),
      } : null;
      this.send(p, { ...base, me });
    }
    this.events = [];
  }
}
