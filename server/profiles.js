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

// Abuse limits (all overridable by env for bigger deployments)
const MAX_PROFILES = Number(process.env.WR_MAX_PROFILES || 20000);          // hard cap on stored profiles
const CREATE_PER_IP_WINDOW = Number(process.env.WR_CREATE_PER_IP || 5);      // new profiles per IP per window
const CREATE_WINDOW_MS = 10 * 60 * 1000;
const IDLE_EVICT_MS = Number(process.env.WR_IDLE_EVICT_MS || 7 * 24 * 3600 * 1000); // untouched fresh profiles are dropped after this

const profiles = new Map(); // token -> profile
const active = new Map();   // token -> player currently in a room (one session per profile)
const createLog = new Map(); // ip -> [timestamps]
let dirty = false;
let saveTimer = null;
let saveBackoff = 2000;

export function loadProfiles() {
  try {
    if (fs.existsSync(FILE)) {
      const raw = JSON.parse(fs.readFileSync(FILE, 'utf8'));
      for (const [tok, p] of Object.entries(raw)) if (TOKEN_RE.test(tok)) profiles.set(tok, normalizeProfile(p));
    }
  } catch (e) { console.warn('profiles: failed to load', e.message); }
  console.log(`profiles: ${profiles.size} loaded from ${FILE}`);
}

function scheduleSave(delay = 2000) {
  dirty = true;
  if (saveTimer) return;
  saveTimer = setTimeout(flush, delay);
}

export function flush() {
  saveTimer = null;
  if (!dirty) return;
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(Object.fromEntries(profiles)));
    fs.renameSync(tmp, FILE);
    dirty = false;            // only mark clean after the rename succeeded
    saveBackoff = 2000;
  } catch (e) {
    console.warn(`profiles: failed to save (${e.message}); retrying in ${saveBackoff / 1000}s`);
    scheduleSave(saveBackoff); // keep dirty, retry with backoff (max 60 s)
    saveBackoff = Math.min(60000, saveBackoff * 2);
  }
}

export function validToken(t) { return typeof t === 'string' && TOKEN_RE.test(t); }

// Only profiles that have NEVER been modified (no purchase, rename, equip, layout change, battle) may be evicted.
function isPristine(p) { return !p.touched && p.stats.battles === 0; }

function evictIdle() {
  const now = Date.now();
  // 1) fresh, untouched profiles older than the idle window
  for (const [tok, p] of profiles) {
    if (profiles.size < MAX_PROFILES) break;
    if (isPristine(p) && now - (p.lastSeen || 0) > IDLE_EVICT_MS && !active.has(tok)) profiles.delete(tok);
  }
  // 2) still full: drop the least recently seen pristine profile regardless of age
  if (profiles.size >= MAX_PROFILES) {
    let oldest = null;
    for (const [tok, p] of profiles) if (isPristine(p) && !active.has(tok) && (!oldest || (p.lastSeen || 0) < (oldest.p.lastSeen || 0))) oldest = { tok, p };
    if (oldest) profiles.delete(oldest.tok);
  }
}

function rateLimited(ip) {
  const now = Date.now();
  const arr = (createLog.get(ip) || []).filter(t => now - t < CREATE_WINDOW_MS);
  if (arr.length >= CREATE_PER_IP_WINDOW) { createLog.set(ip, arr); return true; }
  arr.push(now); createLog.set(ip, arr);
  if (createLog.size > 50000) createLog.clear(); // bounded memory
  return false;
}

// Returns { token, profile } for a known token; otherwise creates a fresh profile subject to limits.
// The client generates and persists its own random token BEFORE the first request, so if the reply
// is lost the retry carries the same token and simply finds the profile that was already created
// (idempotent — no duplicate accounts, no extra quota consumed). A missing/invalid token gets a
// server-generated one.
// Returns { error } if creation is refused.
export function getOrCreate(token, ip = '?') {
  if (validToken(token) && profiles.has(token)) {
    const p = profiles.get(token); p.lastSeen = Date.now();
    return { token, profile: p };
  }
  if (rateLimited(ip)) return { error: 'too many new profiles from this address, try again later' };
  if (profiles.size >= MAX_PROFILES) evictIdle();
  if (profiles.size >= MAX_PROFILES) return { error: 'server is full' };
  const t = validToken(token) ? token : crypto.randomBytes(24).toString('hex');
  const p = newProfile(); p.lastSeen = Date.now();
  profiles.set(t, p);
  scheduleSave();
  return { token: t, profile: p };
}

export function get(token) { return validToken(token) ? profiles.get(token) || null : null; }

export function act(token, action) {
  const p = get(token);
  if (!p) return { ok: false, error: 'unknown profile' };
  if (active.has(token)) return { ok: false, error: '战斗中无法修改机库' };
  p.lastSeen = Date.now();
  const res = applyAction(p, action);
  if (res.ok) { p.touched = true; scheduleSave(); }
  return { ...res, profile: p };
}

export function resetProfile(token) {
  if (!validToken(token) || !profiles.has(token)) return null;
  if (active.has(token)) return null;
  const p = newProfile(); p.lastSeen = Date.now();
  profiles.set(token, p);
  scheduleSave();
  return p;
}

export function battleHangar(token) {
  const p = get(token);
  return p ? hangarPayload(p) : [];
}

// ---- one live session per profile
export function activePlayer(token) { return active.get(token) || null; }
export function setActive(token, player) { if (validToken(token)) active.set(token, player); }
export function clearActive(token, player) { if (active.get(token) === player) active.delete(token); }

export function grantReward(token, reward, stats, win) {
  const p = get(token);
  if (!p) return null;
  applyReward(p, reward, stats, win);
  p.touched = true;
  p.lastSeen = Date.now();
  scheduleSave();
  return p;
}

process.on('exit', flush);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { flush(); process.exit(0); });
