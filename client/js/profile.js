import { ROBOTS, WEAPONS, START_PROFILE, robotUpgradeCost, weaponUpgradeCost, robotMaxLevel, weaponMaxLevel, SLOT_UNLOCK_COST } from '/shared/data.js';

const KEY = 'wr-classic-profile-v1';

export const profile = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw);
      // sanity: drop unknown items
      p.robots = p.robots.filter(r => ROBOTS[r.key]);
      p.weapons = p.weapons.filter(w => WEAPONS[w.key]);
      if (!p.stats) p.stats = { battles: 0, wins: 0, kills: 0, damage: 0 };
      if (!Array.isArray(p.hangar)) p.hangar = [null, null, null, null, null];
      return p;
    }
  } catch { /* ignore */ }
  return START_PROFILE();
}

export function save() { localStorage.setItem(KEY, JSON.stringify(profile)); }
export function reset() { localStorage.removeItem(KEY); location.reload(); }

export function newId() { return 'i' + (profile.nextId++); }
export function robotById(id) { return profile.robots.find(r => r.id === id); }
export function weaponById(id) { return profile.weapons.find(w => w.id === id); }

export function canAfford(cost) {
  if (!cost) return true;
  return (cost.ag || 0) <= profile.ag && (cost.au || 0) <= profile.au;
}
export function pay(cost) {
  if (!canAfford(cost)) return false;
  profile.ag -= cost.ag || 0; profile.au -= cost.au || 0;
  save(); return true;
}
export function costStr(cost) {
  if (!cost) return '免费';
  const parts = [];
  if (cost.ag) parts.push(fmt(cost.ag) + ' Ag');
  if (cost.au) parts.push(fmt(cost.au) + ' Au');
  return parts.join(' + ');
}
export function fmt(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(n % 1e6 === 0 ? 0 : 2) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(n % 1e3 === 0 ? 0 : 1) + 'K';
  return String(Math.round(n));
}

export function buyRobot(key) {
  const def = ROBOTS[key];
  if (!pay(def.cost)) return null;
  const r = { id: newId(), key, level: def.minLevel, weapons: def.slots.map(() => null) };
  profile.robots.push(r);
  // auto place in first empty hangar slot
  const empty = profile.hangar.findIndex((s, i) => s === null && i < profile.slotsUnlocked);
  if (empty >= 0) profile.hangar[empty] = r.id;
  save(); return r;
}

export function buyWeapon(key) {
  const def = WEAPONS[key];
  if (!pay(def.cost)) return null;
  const w = { id: newId(), key, level: def.minLevel };
  profile.weapons.push(w);
  save(); return w;
}

export function sellRobot(id) {
  const r = robotById(id);
  if (!r) return;
  r.weapons.forEach(wid => { if (wid) { /* keep weapons in inventory */ } });
  const def = ROBOTS[r.key];
  profile.ag += Math.round((def.cost.ag || 0) * 0.5) + (def.cost.au ? 100000 : 0);
  profile.robots = profile.robots.filter(x => x.id !== id);
  profile.hangar = profile.hangar.map(s => s === id ? null : s);
  save();
}

export function sellWeapon(id) {
  const w = weaponById(id);
  if (!w) return;
  const def = WEAPONS[w.key];
  profile.ag += Math.round((def.cost.ag || 0) * 0.5) + (def.cost.au ? 50000 : 0);
  profile.weapons = profile.weapons.filter(x => x.id !== id);
  profile.robots.forEach(r => { r.weapons = r.weapons.map(x => x === id ? null : x); });
  save();
}

export function weaponMountedOn(wid) {
  return profile.robots.find(r => r.weapons.includes(wid)) || null;
}

export function equipWeapon(robotId, slotIdx, weaponId) {
  const r = robotById(robotId); if (!r) return false;
  const slotType = ROBOTS[r.key].slots[slotIdx];
  if (weaponId) {
    const w = weaponById(weaponId); if (!w) return false;
    if (WEAPONS[w.key].slot !== slotType) return false;
    // unmount from wherever it currently is
    profile.robots.forEach(o => { o.weapons = o.weapons.map(x => x === weaponId ? null : x); });
  }
  r.weapons[slotIdx] = weaponId || null;
  save(); return true;
}

export function upgradeRobot(id) {
  const r = robotById(id); const def = ROBOTS[r.key];
  if (r.level >= robotMaxLevel(def)) return false;
  const cost = { ag: robotUpgradeCost(def, r.level) };
  if (!pay(cost)) return false;
  r.level++; save(); return true;
}
export function upgradeWeapon(id) {
  const w = weaponById(id); const def = WEAPONS[w.key];
  if (w.level >= weaponMaxLevel(def)) return false;
  const cost = { ag: weaponUpgradeCost(def, w.level) };
  if (!pay(cost)) return false;
  w.level++; save(); return true;
}

export function unlockSlot() {
  const idx = profile.slotsUnlocked;
  if (idx >= 5) return false;
  const cost = SLOT_UNLOCK_COST[idx];
  if (!pay(cost)) return false;
  profile.slotsUnlocked++; save(); return true;
}

export function setHangarSlot(idx, robotId) {
  if (idx >= profile.slotsUnlocked) return;
  profile.hangar = profile.hangar.map((s, i) => (s === robotId && i !== idx) ? null : s);
  profile.hangar[idx] = robotId;
  save();
}

// Build the payload sent to the server
export function hangarPayload() {
  const out = [];
  for (let i = 0; i < profile.slotsUnlocked; i++) {
    const id = profile.hangar[i]; if (!id) continue;
    const r = robotById(id); if (!r) continue;
    out.push({ key: r.key, level: r.level, weapons: r.weapons.map(wid => { const w = wid && weaponById(wid); return w ? { key: w.key, level: w.level } : null; }) });
  }
  return out;
}

export function applyReward(reward, stats, win) {
  profile.ag += reward.ag; profile.au += reward.au;
  profile.stats.battles++; if (win) profile.stats.wins++;
  profile.stats.kills += stats.kills; profile.stats.damage += Math.round(stats.damage);
  save();
}
