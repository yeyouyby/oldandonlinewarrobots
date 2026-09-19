// Profile / economy rules. Pure functions over a profile object.
// The SERVER is authoritative: it applies these to the stored profile. The client only sends
// action requests and displays the returned profile.
import { ROBOTS, WEAPONS, START_PROFILE, SLOT_UNLOCK_COST, robotUpgradeCost, weaponUpgradeCost, robotMaxLevel, weaponMaxLevel } from './data.js';

export const MAX_SLOTS = 5;
const own = (obj, k) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(obj, k) ? obj[k] : null;
export const robotDef = (k) => own(ROBOTS, k);
export const weaponDef = (k) => own(WEAPONS, k);
export const NAME_MAX = 14;

export function sanitizeName(n) {
  // letters/digits/space/underscore/hyphen/dot only; no markup, no control chars
  const s = String(n ?? '').replace(/[^\p{L}\p{N} _\-.]/gu, '').trim().slice(0, NAME_MAX);
  return s || 'Pilot';
}

export function newProfile() {
  const p = START_PROFILE();
  p.name = sanitizeName(p.name);
  return p;
}

export function robotById(p, id) { return typeof id === 'string' ? p.robots.find(r => r.id === id) || null : null; }
export function weaponById(p, id) { return typeof id === 'string' ? p.weapons.find(w => w.id === id) || null : null; }
export function weaponMountedOn(p, wid) { return p.robots.find(r => r.weapons.includes(wid)) || null; }
export function canAfford(p, cost) { return !cost || ((cost.ag || 0) <= p.ag && (cost.au || 0) <= p.au); }

function pay(p, cost) {
  if (!canAfford(p, cost)) return false;
  p.ag -= cost.ag || 0; p.au -= cost.au || 0;
  return true;
}
function newId(p) { return 'i' + (p.nextId++); }

// What gets used in battle. Derived from the profile only — never from client input.
export function hangarPayload(p) {
  const out = [];
  for (let i = 0; i < Math.min(p.slotsUnlocked, MAX_SLOTS); i++) {
    const r = p.hangar[i] && robotById(p, p.hangar[i]);
    if (!r) continue;
    const def = robotDef(r.key); if (!def) continue;
    out.push({
      key: r.key, level: r.level,
      weapons: def.slots.map((slot, si) => {
        const w = r.weapons[si] && weaponById(p, r.weapons[si]);
        const wd = w && weaponDef(w.key); return wd && wd.slot === slot ? { key: w.key, level: w.level } : null;
      }),
    });
  }
  return out;
}

export function applyReward(p, reward, stats, win) {
  p.ag += reward.ag; p.au += reward.au;
  p.stats.battles++; if (win) p.stats.wins++;
  p.stats.kills += stats.kills; p.stats.damage += Math.round(stats.damage);
}

// Returns { ok: true, result? } or { ok: false, error }
export function applyAction(p, a) {
  if (!a || typeof a !== 'object') return fail('bad action');
  switch (a.type) {
    case 'setName': { if (typeof a.name !== 'string') return fail('bad name'); p.name = sanitizeName(a.name); return ok(); }
    case 'buyRobot': {
      const def = robotDef(a.key); if (!def) return fail('unknown robot');
      if (!pay(p, def.cost)) return fail('货币不足');
      const r = { id: newId(p), key: a.key, level: def.minLevel, weapons: def.slots.map(() => null) };
      p.robots.push(r);
      const empty = p.hangar.findIndex((s, i) => s === null && i < p.slotsUnlocked);
      if (empty >= 0) p.hangar[empty] = r.id;
      return ok(r.id);
    }
    case 'buyWeapon': {
      const def = weaponDef(a.key); if (!def) return fail('unknown weapon');
      if (!pay(p, def.cost)) return fail('货币不足');
      const w = { id: newId(p), key: a.key, level: def.minLevel };
      p.weapons.push(w);
      return ok(w.id);
    }
    case 'sellRobot': {
      const r = robotById(p, a.id); if (!r) return fail('no such robot');
      const def = ROBOTS[r.key];
      p.ag += Math.round((def.cost.ag || 0) * 0.5) + (def.cost.au ? 100000 : 0);
      p.robots = p.robots.filter(x => x.id !== r.id);
      p.hangar = p.hangar.map(s => s === r.id ? null : s);
      return ok();
    }
    case 'sellWeapon': {
      const w = weaponById(p, a.id); if (!w) return fail('no such weapon');
      const def = WEAPONS[w.key];
      p.ag += Math.round((def.cost.ag || 0) * 0.5) + (def.cost.au ? 50000 : 0);
      p.weapons = p.weapons.filter(x => x.id !== w.id);
      p.robots.forEach(r => { r.weapons = r.weapons.map(x => x === w.id ? null : x); });
      return ok();
    }
    case 'equip': {
      const r = robotById(p, a.robotId); if (!r) return fail('no such robot');
      const slotIdx = Number(a.slot) | 0;
      const slotType = ROBOTS[r.key].slots[slotIdx]; if (!slotType) return fail('bad slot');
      if (a.weaponId != null && a.weaponId !== '') {
        const w = weaponById(p, a.weaponId); if (!w) return fail('no such weapon');
        if (WEAPONS[w.key].slot !== slotType) return fail('slot type mismatch');
        p.robots.forEach(o => { o.weapons = o.weapons.map(x => x === w.id ? null : x); });
        r.weapons[slotIdx] = w.id;
      } else r.weapons[slotIdx] = null;
      return ok();
    }
    case 'upgradeRobot': {
      const r = robotById(p, a.id); if (!r) return fail('no such robot');
      const def = ROBOTS[r.key];
      if (r.level >= robotMaxLevel(def)) return fail('已满级');
      if (!pay(p, { ag: robotUpgradeCost(def, r.level) })) return fail('银币不足');
      r.level++; return ok();
    }
    case 'upgradeWeapon': {
      const w = weaponById(p, a.id); if (!w) return fail('no such weapon');
      const def = WEAPONS[w.key];
      if (w.level >= weaponMaxLevel(def)) return fail('已满级');
      if (!pay(p, { ag: weaponUpgradeCost(def, w.level) })) return fail('银币不足');
      w.level++; return ok();
    }
    case 'unlockSlot': {
      const idx = p.slotsUnlocked;
      if (idx >= MAX_SLOTS) return fail('已全部解锁');
      if (!pay(p, SLOT_UNLOCK_COST[idx])) return fail('货币不足');
      p.slotsUnlocked++; return ok();
    }
    case 'setSlot': {
      const idx = Number(a.idx) | 0;
      if (idx < 0 || idx >= p.slotsUnlocked) return fail('slot locked');
      if (a.robotId != null && typeof a.robotId !== 'string') return fail('bad robot id');
      const rid = a.robotId || null;
      if (rid && !robotById(p, rid)) return fail('no such robot');
      p.hangar = p.hangar.map((s, i) => (rid && s === rid && i !== idx) ? null : s);
      p.hangar[idx] = rid;
      return ok();
    }
    default: return fail('unknown action');
  }
}

function ok(result) { return { ok: true, result }; }
function fail(error) { return { ok: false, error }; }

// Defensive normalisation for profiles loaded from disk.
export function normalizeProfile(p) {
  const base = newProfile();
  if (!p || typeof p !== 'object') return base;
  const out = { ...base, ...p };
  out.name = sanitizeName(out.name);
  out.ag = Math.max(0, Number(out.ag) || 0); out.au = Math.max(0, Number(out.au) || 0);
  out.slotsUnlocked = Math.min(MAX_SLOTS, Math.max(1, Number(out.slotsUnlocked) || 3));
  out.robots = (Array.isArray(out.robots) ? out.robots : []).filter(r => r && robotDef(r.key)).map(r => ({
    id: String(r.id), key: r.key, level: Number(r.level) || ROBOTS[r.key].minLevel,
    weapons: ROBOTS[r.key].slots.map((_, i) => (Array.isArray(r.weapons) && r.weapons[i]) ? String(r.weapons[i]) : null),
  }));
  out.weapons = (Array.isArray(out.weapons) ? out.weapons : []).filter(w => w && weaponDef(w.key)).map(w => ({ id: String(w.id), key: w.key, level: Number(w.level) || WEAPONS[w.key].minLevel }));
  out.hangar = Array.from({ length: MAX_SLOTS }, (_, i) => (Array.isArray(out.hangar) && out.hangar[i] && robotById(out, out.hangar[i])) ? out.hangar[i] : null);
  out.stats = { battles: 0, wins: 0, kills: 0, damage: 0, ...(out.stats || {}) };
  out.nextId = Math.max(10, Number(out.nextId) || 10);
  out.touched = !!out.touched;
  out.lastSeen = Number(out.lastSeen) || 0;
  return out;
}
