import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { Room } from './room.js';
import { MATCH } from '../shared/data.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT || 8080);

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

function serveStatic(req, res) {
  let url = decodeURIComponent(req.url.split('?')[0]);
  if (url === '/') url = '/index.html';
  for (const s of STATIC) {
    if (url.startsWith(s.prefix)) {
      const rel = url.slice(s.prefix.length);
      const file = path.join(s.dir, rel);
      if (!file.startsWith(s.dir)) break;
      if (fs.existsSync(file) && fs.statSync(file).isFile()) {
        res.writeHead(200, {
          'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
          'Cache-Control': url.startsWith('/vendor/') ? 'public, max-age=86400' : 'no-cache',
        });
        fs.createReadStream(file).pipe(res);
        return;
      }
    }
  }
  if (url === '/api/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ rooms: rooms.map(r => r.summary()) }));
    return;
  }
  res.writeHead(404); res.end('not found');
}

const server = http.createServer(serveStatic);
const wss = new WebSocketServer({ server });

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
    if (!player) {
      if (msg.t === 'join') {
        const room = findRoom();
        player = room.addHuman(ws, msg);
      }
      return;
    }
    player.room.onMessage(player, msg);
  });
  ws.on('close', () => { if (player) player.room.removeHuman(player); });
  ws.on('error', () => {});
});

setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false; ws.ping();
  }
}, 15000);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`War Robots Classic server listening on http://0.0.0.0:${PORT}`);
});
