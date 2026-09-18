// Client-side view of the SERVER-authoritative profile.
// The browser only holds an opaque token (localStorage); every purchase/upgrade/equip is a request
// to the server, which validates it and returns the updated profile.
import { ROBOTS, WEAPONS, robotUpgradeCost, weaponUpgradeCost, robotMaxLevel, weaponMaxLevel, SLOT_UNLOCK_COST } from '/shared/data.js';
import { hangarPayload as payloadOf, newProfile } from '/shared/economy.js';

const TOKEN_KEY = 'wr-classic-token-v2';

export let profile = newProfile();   // replaced by server copy after init()
export let token = localStorage.getItem(TOKEN_KEY) || null;
export let lastError = '';

async function post(url, body) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  let data = null;
  try { data = await res.json(); } catch { /* ignore */ }
  // 400 = rejected action with a structured {ok:false,error,profile}; everything else is a real failure
  if (!res.ok && !(res.status === 400 && data && typeof data.ok === 'boolean')) throw new Error((data && data.error) || `HTTP ${res.status}`);
  return data;
}

// Log in (or create) the profile on the server.
export async function init() {
  const data = await post('/api/profile', { token });
  token = data.token; profile = data.profile;
  localStorage.setItem(TOKEN_KEY, token);
  return profile;
}

export function setProfile(p) { if (p) profile = p; }

// Send an action; resolves true on success, false (with lastError set) on rejection.
// Actions are serialized through a queue so responses can never apply out of order.
let queue = Promise.resolve();
export function act(action) {
  const run = queue.then(async () => {
    lastError = '';
    try {
      const data = await post('/api/profile/action', { token, action });
      if (data.profile) profile = data.profile;
      if (!data.ok) lastError = data.error || '操作失败';
      return data.ok;
    } catch (e) {
      lastError = e.message || '网络错误';
      return false;
    }
  });
  queue = run.catch(() => {});
  return run;
}

export async function reset() {
  try { await post('/api/profile/reset', { token }); } catch { /* ignore */ }
  location.reload();
}

export const robotById = (id) => profile.robots.find(r => r.id === id) || null;
export const weaponById = (id) => profile.weapons.find(w => w.id === id) || null;
export const weaponMountedOn = (wid) => profile.robots.find(r => r.weapons.includes(wid)) || null;
export const canAfford = (cost) => !cost || ((cost.ag || 0) <= profile.ag && (cost.au || 0) <= profile.au);
export const hangarPayload = () => payloadOf(profile);

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

// Convenience wrappers (all async, all server-validated)
export const buyRobot = (key) => act({ type: 'buyRobot', key });
export const buyWeapon = (key) => act({ type: 'buyWeapon', key });
export const sellRobot = (id) => act({ type: 'sellRobot', id });
export const sellWeapon = (id) => act({ type: 'sellWeapon', id });
export const equipWeapon = (robotId, slot, weaponId) => act({ type: 'equip', robotId, slot, weaponId });
export const upgradeRobot = (id) => act({ type: 'upgradeRobot', id });
export const upgradeWeapon = (id) => act({ type: 'upgradeWeapon', id });
export const unlockSlot = () => act({ type: 'unlockSlot' });
export const setHangarSlot = (idx, robotId) => act({ type: 'setSlot', idx, robotId });
export const setName = (name) => act({ type: 'setName', name });

// Escape text for innerHTML insertion (player names come from other clients).
export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// re-exported for hangar UI convenience
export { ROBOTS, WEAPONS, robotUpgradeCost, weaponUpgradeCost, robotMaxLevel, weaponMaxLevel, SLOT_UNLOCK_COST };
