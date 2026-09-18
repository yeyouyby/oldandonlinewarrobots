// Server-side authoritative profile store.
// Each browser gets an opaque random token; the token maps to a profile that only the server mutates.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { newProfile, normalizeProfile, applyAction, applyReward, hangarPayload } from '../shared/economy.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.WR_DATA_DIR || path.join(__dirname, '..', 'data');
const FILE = path.join(DATA_DIR, 'profiles.json');
const TOKEN_RE = /^[a-f0-9]{48}$/;

const profiles = new Map(); // token -> profile
let dirty = false;
let saveTimer = null;

export function loadProfiles() {
  try {
    if (fs.existsSync(FILE)) {
      const raw = JSON.parse(fs.readFileSync(FILE, 'utf8'));
      for (const [tok, p] of Object.entries(raw)) if (TOKEN_RE.test(tok)) profiles.set(tok, normalizeProfile(p));
    }
  } catch (e) { console.warn('profiles: failed to load', e.message); }
  console.log(`profiles: ${profiles.size} loaded from ${FILE}`);
}

function scheduleSave() {
  dirty = true;
  if (saveTimer) return;
  saveTimer = setTimeout(flush, 2000);
}

export function flush() {
  saveTimer = null;
  if (!dirty) return;
  dirty = false;
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(Object.fromEntries(profiles)));
    fs.renameSync(tmp, FILE);
  } catch (e) { console.warn('profiles: failed to save', e.message); }
}

export function validToken(t) { return typeof t === 'string' && TOKEN_RE.test(t); }

// Returns { token, profile } — creates a fresh profile if token is missing/unknown.
export function getOrCreate(token) {
  if (validToken(token) && profiles.has(token)) return { token, profile: profiles.get(token) };
  const t = crypto.randomBytes(24).toString('hex');
  const p = newProfile();
  profiles.set(t, p);
  scheduleSave();
  return { token: t, profile: p };
}

export function get(token) { return validToken(token) ? profiles.get(token) || null : null; }

export function act(token, action) {
  const p = get(token);
  if (!p) return { ok: false, error: 'unknown profile' };
  const res = applyAction(p, action);
  if (res.ok) scheduleSave();
  return { ...res, profile: p };
}

export function resetProfile(token) {
  if (!validToken(token)) return null;
  const p = newProfile();
  profiles.set(token, p);
  scheduleSave();
  return p;
}

export function battleHangar(token) {
  const p = get(token);
  return p ? hangarPayload(p) : [];
}

export function grantReward(token, reward, stats, win) {
  const p = get(token);
  if (!p) return null;
  applyReward(p, reward, stats, win);
  scheduleSave();
  return p;
}

process.on('exit', flush);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { flush(); process.exit(0); });
