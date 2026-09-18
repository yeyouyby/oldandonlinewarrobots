import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { Room } from './room.js';
import { MATCH } from '../shared/data.js';
import * as Profiles from './profiles.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT || 8080);
const MAX_BODY = 16 * 1024;
const MAX_WS_MSG = 4 * 1024;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.wasm': 'application/wasm', '.txt': 'text/plain',
};

const STATIC = [
  { prefix: '/vendor/three/', dir: path.join(ROOT, 'node_modules', 'three') },
  { prefix: '/shared/', dir: path.join(ROOT, 'shared') },
  { prefix: '/', dir: path.join(ROOT, 'client') },
];

function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > MAX_BODY) { reject(new Error('body too large')); req.destroy(); return; } chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function parseJson(text) {
  try { const v = JSON.parse(text); return v && typeof v === 'object' && !Array.isArray(v) ? v : null; } catch { return null; }
}

// ------------------------------------------------------------------ profile API
async function handleApi(req, res, url) {
  if (url === '/api/status' && req.method === 'GET') return json(res, 200, { rooms: rooms.map(r => r.summary()) });
  if (req.method !== 'POST') return json(res, 405, { error: 'method not allowed' });
  let body;
  try { body = parseJson(await readBody(req)); } catch { return json(res, 413, { error: 'body too large' }); }
  if (!body) return json(res, 400, { error: 'bad json' });

  if (url === '/api/profile') {
    // login / create: returns token + profile
    const { token, profile } = Profiles.getOrCreate(body.token);
    return json(res, 200, { token, profile });
  }
  if (url === '/api/profile/action') {
    if (!Profiles.get(body.token)) return json(res, 401, { error: 'unknown profile' });
    const r = Profiles.act(body.token, body.action);
    return json(res, r.ok ? 200 : 400, r);
  }
  if (url === '/api/profile/reset') {
    const p = Profiles.resetProfile(body.token);
    return p ? json(res, 200, { ok: true, profile: p }) : json(res, 401, { error: 'unknown profile' });
  }
  return json(res, 404, { error: 'not found' });
}

// ------------------------------------------------------------------ static
function handle(req, res) {
  let url;
  try { url = decodeURIComponent((req.url || '/').split('?')[0]); } catch { res.writeHead(400); res.end('bad request'); return; }
  if (url.includes('\0')) { res.writeHead(400); res.end('bad request'); return; }
  if (url.startsWith('/api/')) { handleApi(req, res, url).catch(() => { try { json(res, 500, { error: 'internal' }); } catch { /* ignore */ } }); return; }
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return; }
  if (url === '/') url = '/index.html';
  for (const s of STATIC) {
    if (!url.startsWith(s.prefix)) continue;
    const rel = url.slice(s.prefix.length);
    const file = path.resolve(s.dir, '.' + path.posix.sep + rel);
    if (file !== s.dir && !file.startsWith(s.dir + path.sep)) break;
    let st;
    try { st = fs.statSync(file); } catch { continue; }
    if (!st.isFile()) continue;
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
      'Content-Length': st.size,
      'Cache-Control': url.startsWith('/vendor/') ? 'public, max-age=86400' : 'no-cache',
    });
    if (req.method === 'HEAD') { res.end(); return; }
    fs.createReadStream(file).on('error', () => res.destroy()).pipe(res);
    return;
  }
  res.writeHead(404); res.end('not found');
}

const server = http.createServer((req, res) => {
  try { handle(req, res); } catch (e) { console.error('http error', e); try { res.writeHead(500); res.end(); } catch { /* ignore */ } }
});
const wss = new WebSocketServer({ server, maxPayload: MAX_WS_MSG });

// ------------------------------------------------------------------ rooms
const rooms = [];
function findRoom() {
  // prefer rooms still in the lobby, then battles with plenty of time left; never join finished rooms
  const cap = MATCH.maxPlayers * 2;
  let r = rooms.find(r => r.phase === 'waiting' && r.humanCount() < cap)
    || rooms.find(r => r.phase === 'battle' && r.timeLeft > 150 && r.humanCount() < cap);
  if (!r) { r = new Room(rooms.length + 1, () => { const i = rooms.indexOf(r); if (i >= 0) rooms.splice(i, 1); }); rooms.push(r); }
  return r;
}

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  let player = null;
  ws.on('message', (data) => {
    let msg;
    try { msg = JSON.parse(data); } catch { return; }
    if (!msg || typeof msg !== 'object' || Array.isArray(msg) || typeof msg.t !== 'string') return;
    try {
      if (!player) {
        if (msg.t !== 'join') return;
        // hangar is taken from the server-side profile; the client only sends its token
        const profile = Profiles.get(msg.token);
        if (!profile) { try { ws.send(JSON.stringify({ t: 'error', error: 'unknown profile' })); ws.close(4001, 'unknown profile'); } catch { /* ignore */ } return; }
        const hangar = Profiles.battleHangar(msg.token);
        if (!hangar.length) { try { ws.send(JSON.stringify({ t: 'error', error: 'empty hangar' })); ws.close(4002, 'empty hangar'); } catch { /* ignore */ } return; }
        const room = findRoom();
        player = room.addHuman(ws, { name: profile.name, hangar, token: msg.token });
        return;
      }
      player.room.onMessage(player, msg);
    } catch (e) {
      console.error('ws message error', e);
    }
  });
  ws.on('close', () => { if (player) { try { player.room.removeHuman(player); } catch (e) { console.error('remove error', e); } } });
  ws.on('error', () => {});
});

setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false; ws.ping();
  }
}, 15000);

process.on('uncaughtException', (e) => { console.error('uncaught', e); });
process.on('unhandledRejection', (e) => { console.error('unhandled', e); });

Profiles.loadProfiles();
server.listen(PORT, '0.0.0.0', () => {
  console.log(`War Robots Classic server listening on http://0.0.0.0:${PORT}`);
});
