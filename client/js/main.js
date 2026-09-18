// War Robots Classic — client entry
import * as THREE from 'three';
import { ROBOTS, WEAPONS, robotSpeed } from '/shared/data.js';
import { MAP, mapBounds } from '/shared/map.js';
import { stepMotion, startJump, startDash } from '/shared/sim.js';
import { angleDiff, nearestBoxHit, losClear } from '/shared/geom.js';
import { buildRobot, animateRobot, mat } from './models.js';
import { buildWorld, updateBeaconVisual, TEAM_HEX } from './world.js';
import { Effects } from './effects.js';
import { HUD } from './hud.js';
import { initHangar, renderAll as renderHangar } from './hangar.js';
import * as P from './profile.js';

const $ = (id) => document.getElementById(id);
const BOUNDS = mapBounds();

// ------------------------------------------------------------------ renderer
const canvas = $('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.5, 1800);
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

// ------------------------------------------------------------------ hangar scene
const hangarScene = new THREE.Scene();
hangarScene.background = new THREE.Color(0x0a0f16);
hangarScene.fog = new THREE.Fog(0x0a0f16, 60, 160);
{
  hangarScene.add(new THREE.HemisphereLight(0x9fc5ff, 0x1a1410, 0.8));
  const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(20, 40, 25); key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024); key.shadow.camera.left = key.shadow.camera.bottom = -30; key.shadow.camera.right = key.shadow.camera.top = 30;
  hangarScene.add(key);
  const rim = new THREE.PointLight(0x4fc3f7, 60, 80); rim.position.set(-20, 12, -20); hangarScene.add(rim);
  const floor = new THREE.Mesh(new THREE.CylinderGeometry(14, 15, 1, 40), mat(0x2b3138, { metalness: 0.4, roughness: 0.6 })); floor.position.y = -0.5; floor.receiveShadow = true; hangarScene.add(floor);
  const grid = new THREE.GridHelper(200, 40, 0x223344, 0x1a2430); grid.position.y = -0.95; hangarScene.add(grid);
  const back = new THREE.Mesh(new THREE.BoxGeometry(120, 40, 2), mat(0x151b22)); back.position.set(0, 20, -40); back.receiveShadow = true; hangarScene.add(back);
  for (let i = 0; i < 6; i++) { const pillar = new THREE.Mesh(new THREE.BoxGeometry(3, 40, 3), mat(0x1e262f)); pillar.position.set(-50 + i * 20, 20, -38); hangarScene.add(pillar); }
}
let previewRobot = null, previewKey = '';
function setPreview(key, weaponKeys) {
  const sig = key + '|' + weaponKeys.join(',');
  if (sig === previewKey) return;
  previewKey = sig;
  if (previewRobot) hangarScene.remove(previewRobot.group);
  previewRobot = buildRobot(key, 0, true);
  previewRobot.setWeapons(weaponKeys);
  previewRobot.group.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  hangarScene.add(previewRobot.group);
}

// ------------------------------------------------------------------ battle scene
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x7f93a8);
scene.fog = new THREE.Fog(0x7f93a8, 250, 900);
let world = null;
const sun = new THREE.DirectionalLight(0xfff1dc, 2.4);
sun.position.set(180, 260, 120); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 50; sun.shadow.camera.far = 700;
sun.shadow.camera.left = sun.shadow.camera.bottom = -360; sun.shadow.camera.right = sun.shadow.camera.top = 360;
sun.shadow.bias = -0.0005;
scene.add(sun, sun.target, new THREE.HemisphereLight(0xbfd4ee, 0x4a4438, 0.9));
const effects = new Effects(scene, camera);
const hud = new HUD();
const audio = effects.audio;

// ------------------------------------------------------------------ game state
const G = {
  mode: 'hangar',   // hangar | lobby | battle
  ws: null, myId: null, myTeam: 0, state: null, phase: 'waiting',
  entities: new Map(),   // id -> entity
  pred: null,            // predicted self state
  camYaw: 0, camPitch: 0.18,
  target: null, fireMask: 0, abCounter: 0,
  keys: {}, mouseDown: false,
  hangar: [], used: [], alive: false, deathPos: null, deadT: 0,
  lastSend: 0, t: 0, lastServer: null,
  results: null,
};

window.__G = G; // debug handle

// ------------------------------------------------------------------ hangar UI
// The profile lives on the server; log in first (creates one on first visit), then build the hangar UI.
(async () => {
  try {
    await P.init();
  } catch (e) {
    hud.center('无法连接服务器：' + (e.message || e), 6000, '#ff7043');
    $('hud').classList.remove('hidden');
  }
  initHangar({ preview: setPreview, onBattle: startMatchmaking });
})();
$('btnCancel').addEventListener('click', () => leaveBattle());
$('btnToHangar').addEventListener('click', () => leaveBattle());
$('btnSpectate').addEventListener('click', () => hud.show('respawn', false));

// ------------------------------------------------------------------ networking
function startMatchmaking() {
  audio.ensure();
  G.hangar = P.hangarPayload();
  hud.showScreen('lobby');
  hud.lobby('连接服务器…', G.hangar);
  G.mode = 'lobby';
  const url = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host;
  const ws = new WebSocket(url);
  G.ws = ws;
  ws.onopen = () => { ws.send(JSON.stringify({ t: 'join', token: P.token })); hud.lobby('已连接，等待其他玩家加入（空位由 AI 补齐）…', G.hangar); };
  ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch { return; } onMessage(m); };
  ws.onclose = () => {
    if (G.mode === 'hangar' || G.results) return; // results screen stays until the player clicks
    if (G.mode === 'battle') hud.center('与服务器断开连接', 4000, '#ff7043');
    else hud.lobby('连接已断开，请返回机库重试', G.hangar);
    setTimeout(() => { if (G.mode !== 'hangar' && !G.results) leaveBattle(); }, 2500);
  };
  ws.onerror = () => { hud.lobby('连接失败，请稍后再试', G.hangar); };
}

function onMessage(m) {
  switch (m.t) {
    case 'welcome':
      G.myId = m.id; G.myTeam = m.team; G.phase = m.phase;
      hud.lobby(`已加入房间 #${m.room} · 你在${m.team === 0 ? '蓝' : '红'}队 · 战斗即将开始`, G.hangar);
      if (m.phase === 'battle') enterBattle();
      break;
    case 's': onState(m); break;
    case 'error': hud.lobby('服务器拒绝加入：' + (m.error || '未知错误'), G.hangar); break;
    case 'destroyed':
      G.alive = false; G.deadT = 0;
      setTimeout(() => { if (G.mode === 'battle' && !G.alive && !G.results) hud.showRespawn(G.hangar, G.used, m.left, pickRespawn); }, 1800);
      if (m.left <= 0) hud.center('所有机甲已耗尽 — 观战中', 4000, '#ff9e80');
      break;
    case 'end':
      G.results = m;
      P.setProfile(m.profile); // server already credited the reward
      hud.show('respawn', false);
      document.exitPointerLock?.();
      hud.showResults(m, G.myId, G.myTeam);
      audio.play(m.win ? 'beacon' : 'boom');
      break;
  }
}

function pickRespawn(i) {
  G.used.push(i);
  hud.show('respawn', false);
  G.ws?.send(JSON.stringify({ t: 'spawn', index: i }));
}

function enterBattle() {
  if (G.mode === 'battle') return;
  G.mode = 'battle';
  G.results = null; G.used = [0]; G.alive = false;
  if (!world) world = buildWorld(scene);
  hud.showScreen('hud');
  hud.center('战斗开始 — 占领信标！', 2500);
  audio.play('start');
  $('hint').classList.remove('hidden');
  setTimeout(() => $('hint').classList.add('hidden'), 9000);
  const sp = MAP.spawns[G.myTeam][0];
  G.camYaw = G.myTeam === 0 ? Math.PI / 2 : -Math.PI / 2;
  G.deathPos = new THREE.Vector3(sp.x, 0, sp.z);
}

function leaveBattle() {
  if (G.ws) { try { G.ws.onclose = null; G.ws.close(); } catch { /* ignore */ } }
  G.ws = null;
  for (const e of G.entities.values()) scene.remove(e.obj.group, e.bars);
  G.entities.clear();
  effects.clear();
  G.state = null; G.pred = null; G.target = null; G.alive = false; G.results = null; G.mode = 'hangar';
  document.exitPointerLock?.();
  hud.showScreen('hangar');
  hud.show('respawn', false); hud.show('results', false);
  renderHangar();
}

// ------------------------------------------------------------------ state handling
function onState(s) {
  const prevPhase = G.phase;
  G.phase = s.phase; G.state = s; G.lastServer = performance.now();
  if (G.mode === 'lobby') {
    hud.lobby(`房间内 ${s.players.filter(p => p.h).length} 名玩家 · ${Math.ceil(s.cd)} 秒后开始 · 你在${G.myTeam === 0 ? '蓝' : '红'}队`, G.hangar);
    if (s.phase === 'battle') enterBattle();
  }
  if (G.mode !== 'battle') return;
  if (prevPhase === 'waiting' && s.phase === 'battle') hud.center('战斗开始 — 占领信标！', 2500);

  // entities
  const seen = new Set();
  for (const r of s.robots) {
    seen.add(r.id);
    let e = G.entities.get(r.id);
    const pl = s.players.find(p => p.id === r.id);
    const team = pl ? pl.t : 0;
    if (!e || e.key !== r.k) {
      if (e) scene.remove(e.obj.group, e.bars);
      e = makeEntity(r, team, pl ? pl.n : '?');
      G.entities.set(r.id, e);
    }
    e.srv = r; e.team = team; e.name = pl ? pl.n : e.name;
    if (r.w.join(',') !== e.wkeys) { e.wkeys = r.w.join(','); e.obj.setWeapons(r.w); }
    if (r.id === G.myId) {
      if (!G.alive) {
        // (re)spawned
        G.alive = true;
        G.pred = makePred(r);
        G.target = null;
        hud.show('respawn', false);
      }
    }
  }
  for (const [id, e] of G.entities) {
    if (!seen.has(id)) {
      // keep wreck briefly handled by kill event; just remove
      scene.remove(e.obj.group, e.bars);
      G.entities.delete(id);
      if (id === G.myId) { G.alive = false; G.deathPos = new THREE.Vector3(e.obj.group.position.x, 0, e.obj.group.position.z); }
    }
  }
  if (G.alive && !seen.has(G.myId)) G.alive = false;

  // reconcile prediction
  if (G.alive && G.pred) {
    const r = G.entities.get(G.myId).srv;
    const p = G.pred;
    const dx = r.x - p.x, dz = r.z - p.z;
    const d = Math.hypot(dx, dz);
    if (d > 6) { p.x = r.x; p.z = r.z; p.y = r.y; }
    else { p.x += dx * 0.25; p.z += dz * 0.25; }
    p.y += (r.y - p.y) * 0.3;
    p.yaw += angleDiff(r.yaw, p.yaw) * 0.3;
    p.modeSentry = !!(r.md & 1); p.modeBastion = !!(r.md & 2);
    if (s.me) { p.rushT = s.me.rush; }
    if ((r.md & 32) && p.dashT <= 0) { /* server dashing, we are not: trust server */ p.dashT = 0.05; p.dashDx = 0; p.dashDz = 0; }
  }

  // events
  for (const ev of s.ev) onEvent(ev);

  // HUD
  hud.updateScore(s);
  world.beacons.forEach((bo, i) => updateBeaconVisual(bo, s.beacons[i][0], s.beacons[i][1]));
  if (G.alive) {
    const me = G.entities.get(G.myId);
    hud.updateMe(me.srv, s.me, G.myTeam);
  }
}

function makePred(r) {
  const def = ROBOTS[r.k];
  return {
    x: r.x, y: r.y, z: r.z, yaw: r.yaw, vy: 0, jumpT: 0, dashT: 0, dashDx: 0, dashDz: 0, animSpeed: 0, moving: false,
    radius: def.radius, height: def.height, baseSpeed: robotSpeed(def, r.lv), rushT: 0, rushMult: def.ability?.mult || 1,
    modeSentry: false, modeBastion: false, def,
  };
}

function makeEntity(r, team, name) {
  const obj = buildRobot(r.k, team, r.id === G.myId);
  obj.group.position.set(r.x, r.y, r.z);
  obj.group.rotation.y = r.yaw;
  obj.group.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  scene.add(obj.group);
  // name + hp bars
  const bars = new THREE.Group();
  const w = 7;
  const bg = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.7), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.6, depthTest: false }));
  const isFriend = team === G.myTeam;
  const fill = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.5), new THREE.MeshBasicMaterial({ color: r.id === G.myId ? 0xffb020 : isFriend ? 0x42a5f5 : 0xef5350, depthTest: false }));
  fill.position.z = 0.01;
  const shield = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.2), new THREE.MeshBasicMaterial({ color: 0x80deea, depthTest: false }));
  shield.position.set(0, -0.5, 0.01); shield.visible = false;
  const label = makeNameLabel(name, isFriend ? '#9fd0ff' : '#ffb0a0'); label.position.y = 1.2;
  bars.add(bg, fill, shield, label);
  bars.renderOrder = 10;
  scene.add(bars);
  return { id: r.id, key: r.k, obj, bars, fill, shield, w, team, name, srv: r, wkeys: '', pos: new THREE.Vector3(r.x, r.y, r.z), yaw: r.yaw, ty: r.ty, animT: Math.random() * 10, stealth: false };
}

function makeNameLabel(text, color) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 96;
  const g = c.getContext('2d');
  g.fillStyle = color; g.font = 'bold 52px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = '#000'; g.shadowBlur = 8;
  g.fillText(text, 256, 48);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthTest: false }));
  sp.scale.set(10, 1.9, 1);
  return sp;
}

// ------------------------------------------------------------------ events
const V = { a: new THREE.Vector3(), b: new THREE.Vector3(), c: new THREE.Vector3() };
function entityPos(id, out, heightFrac = 0.5) {
  const e = G.entities.get(id); if (!e) return null;
  const def = ROBOTS[e.key];
  return out.set(e.obj.group.position.x, e.obj.group.position.y + def.height * heightFrac, e.obj.group.position.z);
}
function playerName(id) { const p = G.state?.players.find(p => p.id === id); return p ? p.n : '?'; }
function playerTeam(id) { const p = G.state?.players.find(p => p.id === id); return p ? p.t : -1; }

function onEvent(ev) {
  switch (ev.k) {
    case 'start': hud.center('战斗开始 — 占领信标！', 2500); audio.play('start'); break;
    case 'fire': {
      const e = G.entities.get(ev.id); if (!e) break;
      const wm = e.obj.weaponMeshes[ev.s];
      const muzzle = V.a;
      if (wm) { wm.getWorldPosition(muzzle); muzzle.add(V.c.set(0, 0, 0).applyQuaternion(wm.getWorldQuaternion(new THREE.Quaternion()))); const fwd = V.c.set(0, 0, 3).applyQuaternion(wm.getWorldQuaternion(new THREE.Quaternion())); muzzle.add(fwd); }
      else entityPos(ev.id, muzzle, 0.7);
      effects.muzzleFlash(muzzle.clone(), ev.w);
      audio.play(ev.w, muzzle);
      const spin = wm && wm.getObjectByName('spin'); if (spin) spin.userData.spin = 1;
      if (ev.tg != null) {
        const tp = entityPos(ev.tg, V.b, 0.5);
        if (tp) {
          if (ev.w === 'lightning') { effects.lightningBolt(muzzle.clone(), tp.clone()); if (ev.chain != null) { const cp = entityPos(ev.chain, V.c, 0.5); if (cp) effects.lightningBolt(tp.clone(), cp.clone()); } }
          else {
            if (!ev.hit) tp.add(new THREE.Vector3((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 8));
            else { tp.x += (Math.random() - 0.5) * 2; tp.y += (Math.random() - 0.5) * 2; tp.z += (Math.random() - 0.5) * 2; }
            effects.tracer(muzzle.clone(), tp.clone(), ev.w, ev.w === 'beam' ? 2.5 : ev.w === 'cannon' ? 2 : 1);
            if (ev.hit) effects.sparks(tp.clone(), ev.w, 3);
          }
        }
      }
      break;
    }
    case 'hit': effects.sparks(new THREE.Vector3(ev.x, ev.y, ev.z), ev.w, ev.env ? 5 : 8); audio.play('hit', ev); break;
    case 'boom': effects.explosion(new THREE.Vector3(ev.x, ev.y, ev.z), ev.r, ev.w); audio.play('boom', ev); break;
    case 'dmg': {
      if (ev.from === G.myId) {
        const p = entityPos(ev.tg, V.a, 0.9);
        if (p) { const sp = toScreen(p); if (sp) hud.dmgNumber(sp.x, sp.y, ev.d, ev.d > 3000); }
      }
      if (ev.tg === G.myId) hud.hurt();
      break;
    }
    case 'kill': {
      const pos = new THREE.Vector3(ev.x, ev.y + 2, ev.z);
      effects.bigExplosion(pos); audio.play('kill', pos);
      const victim = P.esc(playerName(ev.id)), vt = playerTeam(ev.id);
      const by = ev.by != null ? P.esc(playerName(ev.by)) : null;
      const rk = ROBOTS[ev.rk]?.name || '';
      const cls = ev.by === G.myId || ev.id === G.myId ? 'me' : 't' + vt;
      hud.addKill(`${by ? `<b>${by}</b> 摧毁了 ` : ''}<span style="color:${vt === 0 ? '#90caf9' : '#ef9a9a'}">${victim}</span> <small>(${rk})</small>`, cls);
      if (ev.by === G.myId) { hud.center(`击毁 ${victim} 的 ${rk}！`, 1800, '#ffd54f'); }
      break;
    }
    case 'jump': { const p = entityPos(ev.id, V.a, 0); if (p) { effects.jumpDust(p.clone()); audio.play('jump', p); } if (ev.id === G.myId && G.pred && G.pred.vy === 0) startJump(G.pred, G.pred._mx || 0, G.pred._mz || 0); break; }
    case 'dash': { const e = G.entities.get(ev.id); if (e) { const p = e.obj.group.position; effects.dashTrail(p.clone(), new THREE.Vector3(Math.sin(e.yaw), 0, Math.cos(e.yaw))); audio.play('dash', p); } break; }
    case 'stealth': { const p = entityPos(ev.id, V.a, 0.5); if (p) audio.play('stealth', p); if (ev.id === G.myId) hud.center('隐身启动', 1200); break; }
    case 'shieldbreak': { const p = entityPos(ev.id, V.a, 0.5); if (p) { effects.sparks(p.clone(), 'cannon', 14); } if (ev.id === G.myId) hud.center('物理盾已被击碎！', 1500, '#ffab91'); break; }
    case 'ancilebreak': { const p = entityPos(ev.id, V.a, 0.5); if (p) effects.sparks(p.clone(), 'plasma', 14); if (ev.id === G.myId) hud.center('能量盾过载！', 1500, '#80deea'); break; }
    case 'beacon': {
      const b = MAP.beacons[ev.i];
      effects.beaconFlash(new THREE.Vector3(b.x, 0, b.z), TEAM_HEX[ev.team]);
      audio.play('beacon');
      hud.center(ev.team === G.myTeam ? `我方占领了信标 ${b.name}` : `敌方占领了信标 ${b.name}`, 1800, ev.team === G.myTeam ? '#90caf9' : '#ef9a9a');
      break;
    }
    case 'spawn': { if (ev.id === G.myId) hud.center('出击！', 1000); break; }
  }
}

function toScreen(v) {
  const p = v.clone().project(camera);
  if (p.z > 1) return null;
  return { x: (p.x + 1) / 2 * innerWidth, y: (1 - p.y) / 2 * innerHeight };
}

// ------------------------------------------------------------------ input
addEventListener('keydown', (e) => {
  if (e.repeat) return;
  G.keys[e.code] = true;
  if (G.mode !== 'battle') return;
  if (e.code === 'Space') { e.preventDefault(); useAbility(); }
  if (e.code === 'Tab') { e.preventDefault(); cycleTarget(); }
  if (e.code === 'KeyM') { const m = audio.toggleMute(); hud.center(m ? '已静音' : '声音开启', 800); }
  if (e.code === 'Escape') { /* pointer lock exits automatically */ }
});
addEventListener('keyup', (e) => { G.keys[e.code] = false; });
addEventListener('blur', () => { G.keys = {}; G.mouseDown = false; });
canvas.addEventListener('mousedown', (e) => {
  if (G.mode !== 'battle') return;
  audio.ensure();
  if (document.pointerLockElement !== canvas) { canvas.requestPointerLock?.(); return; }
  if (e.button === 0) G.mouseDown = true;
  if (e.button === 2) cycleTarget();
});
addEventListener('mouseup', (e) => { if (e.button === 0) G.mouseDown = false; });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
addEventListener('mousemove', (e) => {
  if (G.mode !== 'battle' || document.pointerLockElement !== canvas) return;
  G.camYaw -= (e.movementX || 0) * 0.0025;
  G.camPitch = Math.max(-0.45, Math.min(0.75, G.camPitch + (e.movementY || 0) * 0.0022));
});
document.addEventListener('pointerlockchange', () => {
  if (G.mode === 'battle') $('hint').classList.toggle('hidden', document.pointerLockElement === canvas);
  if (document.pointerLockElement !== canvas) G.mouseDown = false;
});

function useAbility() {
  if (!G.alive || !G.pred) return;
  G.abCounter++;
  sendInput(true);
  // local prediction for jump/dash
  const ab = G.pred.def.ability; const me = G.state?.me;
  if (!ab || !me) return;
  const inp = moveInput();
  if (ab.type === 'jump' || ab.type === 'descend') { if (me.cd <= 0 && G.pred.vy === 0) startJump(G.pred, inp.mx, inp.mz); }
  else if (ab.type === 'dash') { if (me.ch > 0 && G.pred.dashT <= 0) startDash(G.pred, inp.mx, inp.mz); }
  audio.play('ui');
}

function moveInput() {
  let f = 0, r = 0;
  if (G.keys.KeyW || G.keys.ArrowUp) f += 1;
  if (G.keys.KeyS || G.keys.ArrowDown) f -= 1;
  if (G.keys.KeyD || G.keys.ArrowRight) r += 1;
  if (G.keys.KeyA || G.keys.ArrowLeft) r -= 1;
  const sy = Math.sin(G.camYaw), cy = Math.cos(G.camYaw);
  // forward = (sin yaw, cos yaw); right = (cos yaw, -sin yaw)
  let mx = sy * f + cy * r, mz = cy * f - sy * r;
  const l = Math.hypot(mx, mz); if (l > 1) { mx /= l; mz /= l; }
  return { mx, mz };
}

function currentFireMask() {
  if (!G.alive) return 0;
  const e = G.entities.get(G.myId); if (!e) return 0;
  const slots = ROBOTS[e.key].slots;
  let mask = 0;
  const groupKeys = { Digit1: 'L', Digit2: 'M', Digit3: 'H' };
  let any = false;
  for (const [code, st] of Object.entries(groupKeys)) if (G.keys[code]) { any = true; slots.forEach((s, i) => { if (s === st) mask |= 1 << i; }); }
  if (G.mouseDown || G.keys.KeyF) { slots.forEach((_, i) => { mask |= 1 << i; }); any = true; }
  return any ? mask : 0;
}

function sendInput(force = false) {
  if (!G.ws || G.ws.readyState !== 1 || G.mode !== 'battle') return;
  const now = performance.now();
  if (!force && now - G.lastSend < 50) return;
  G.lastSend = now;
  const inp = moveInput();
  if (G.pred) { G.pred._mx = inp.mx; G.pred._mz = inp.mz; }
  G.ws.send(JSON.stringify({ t: 'in', mx: +inp.mx.toFixed(3), mz: +inp.mz.toFixed(3), fire: currentFireMask(), target: G.target, ab: G.abCounter, yaw: +G.camYaw.toFixed(3) }));
}

// ------------------------------------------------------------------ targeting
const camDir = new THREE.Vector3();
function targetCandidates() {
  const out = [];
  if (!G.alive) return out;
  const me = G.entities.get(G.myId); if (!me) return out;
  camera.getWorldDirection(camDir);
  for (const e of G.entities.values()) {
    if (e.id === G.myId || e.team === G.myTeam || e.srv.st) continue;
    const dx = e.pos.x - me.pos.x, dz = e.pos.z - me.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 800) continue;
    const dir = V.a.set(dx, e.pos.y + ROBOTS[e.key].height * 0.5 - camera.position.y + me.pos.y, dz);
    const ang = camDir.angleTo(V.b.set(e.pos.x - camera.position.x, e.pos.y + ROBOTS[e.key].height * 0.5 - camera.position.y, e.pos.z - camera.position.z));
    void dir;
    const los = losClear(me.pos.x, me.pos.y + me.obj.def.height * 0.6, me.pos.z, e.pos.x, e.pos.y + ROBOTS[e.key].height * 0.5, e.pos.z, BOUNDS);
    out.push({ e, dist, ang, los });
  }
  return out;
}
function updateTarget() {
  const cands = targetCandidates();
  const cur = cands.find(c => c.e.id === G.target);
  if (cur && cur.ang < 0.8) return; // keep
  // pick best: within 30 deg, prefer LOS, then angle
  let best = null;
  for (const c of cands) {
    if (c.ang > 0.55) continue;
    const score = c.ang + (c.los ? 0 : 0.5) + c.dist / 4000;
    if (!best || score < best.score) best = { ...c, score };
  }
  const nt = best ? best.e.id : (cur ? G.target : null);
  if (nt !== G.target) { G.target = nt; if (nt != null) audio.play('lock'); }
}
function cycleTarget() {
  const cands = targetCandidates().filter(c => c.ang < 1.4).sort((a, b) => a.ang - b.ang);
  if (!cands.length) return;
  const i = cands.findIndex(c => c.e.id === G.target);
  G.target = cands[(i + 1) % cands.length].e.id;
  audio.play('lock');
  sendInput(true);
}

// ------------------------------------------------------------------ camera
const camTmp = new THREE.Vector3();
function updateCamera(dt) {
  let focus, dist, h;
  if (G.alive && G.pred) {
    const def = G.pred.def;
    focus = camTmp.set(G.pred.x, G.pred.y + def.height * 0.75, G.pred.z);
    dist = def.cls === 'light' ? 20 : def.cls === 'medium' ? 24 : 29;
    h = 0;
  } else {
    // spectate: slowly orbit death position
    G.deadT += dt;
    G.camYaw += dt * 0.15;
    focus = camTmp.copy(G.deathPos || new THREE.Vector3()); focus.y += 8;
    dist = 40; h = 0;
  }
  const pitch = G.camPitch;
  const dir = new THREE.Vector3(-Math.sin(G.camYaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(G.camYaw) * Math.cos(pitch));
  // camera collision
  const hitT = nearestBoxHit(focus.x, focus.y, focus.z, dir.x, dir.y, dir.z, dist, BOUNDS);
  const d = hitT >= 0 ? Math.max(3, hitT - 1) : dist;
  const pos = focus.clone().addScaledVector(dir, d);
  if (pos.y < 1.5) pos.y = 1.5;
  camera.position.lerp(pos, 1 - Math.exp(-dt * 18));
  // aim point: far along view direction
  const look = focus.clone().addScaledVector(dir, -200);
  look.y += h;
  camera.lookAt(look);
  audio.setListener(focus.x, focus.y, focus.z);
  sun.target.position.set(focus.x, 0, focus.z);
  sun.position.set(focus.x + 180, 260, focus.z + 120);
}

// ------------------------------------------------------------------ main loop
let last = performance.now();
function frame() {
  requestAnimationFrame(frame);
  const now = performance.now();
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  G.t += dt;

  if (G.mode === 'hangar' || G.mode === 'lobby') {
    if (previewRobot) {
      previewRobot.group.rotation.y = G.t * 0.35;
      previewRobot.torso.rotation.y = Math.sin(G.t * 0.7) * 0.3;
      animateRobot(previewRobot, G.t, 0, false);
    }
    camera.position.set(Math.sin(G.t * 0.05) * 3, 10, 30);
    camera.lookAt(0, 6, 0);
    renderer.render(hangarScene, camera);
    return;
  }

  // battle
  if (G.alive && G.pred) {
    const inp = moveInput();
    G.pred._mx = inp.mx; G.pred._mz = inp.mz;
    stepMotion(G.pred, inp, dt, BOUNDS);
  }
  sendInput();
  updateTarget();

  // entities
  for (const e of G.entities.values()) {
    const r = e.srv;
    const def = ROBOTS[e.key];
    let x, y, z, yaw;
    if (e.id === G.myId && G.pred) { x = G.pred.x; y = G.pred.y; z = G.pred.z; yaw = G.pred.yaw; e.animSpeed = G.pred.animSpeed; }
    else {
      const k = 1 - Math.exp(-dt * 12);
      e.pos.x += (r.x - e.pos.x) * k; e.pos.y += (r.y - e.pos.y) * k; e.pos.z += (r.z - e.pos.z) * k;
      e.yaw += angleDiff(r.yaw, e.yaw) * k;
      x = e.pos.x; y = e.pos.y; z = e.pos.z; yaw = e.yaw; e.animSpeed = r.sp;
    }
    if (e.id === G.myId) e.pos.set(x, y, z), e.yaw = yaw;
    e.ty += angleDiff(r.ty, e.ty) * (1 - Math.exp(-dt * 10));
    if (e.id === G.myId && r.tg == null) e.ty += angleDiff(G.camYaw, e.ty) * (1 - Math.exp(-dt * 10));
    e.obj.group.position.set(x, y, z);
    e.obj.group.rotation.y = yaw;
    e.obj.torso.rotation.y = angleDiff(e.ty, yaw);
    e.animT += dt * (e.animSpeed > 0.1 ? 1 : 0);
    const airborne = e.id === G.myId && G.pred ? G.pred.vy !== 0 : Math.abs(y - (e.prevY ?? y)) > 0.02;
    e.prevY = y;
    animateRobot(e.obj, e.animT, e.animSpeed, airborne);
    // spin mg barrels
    for (const wm of e.obj.weaponMeshes) { if (!wm) continue; const sp = wm.getObjectByName('spin'); if (sp) { sp.userData.spin = Math.max(0, (sp.userData.spin || 0) - dt * 2); sp.rotation.z += sp.userData.spin * 30 * dt; } }
    // stealth
    const st = !!r.st;
    if (st !== e.stealth) { e.stealth = st; e.obj.setStealth(st); }
    e.bars.visible = !st || e.team === G.myTeam;
    // shields
    if (e.obj.pshield) {
      const ps = def.pshield;
      const on = (r.ps > 0) && (!ps.bastionOnly || (r.md & 2)) && !(r.md & 4);
      e.obj.pshield.holder.visible = on;
      const targetRot = (r.md & 8) ? 0 : ps.side * Math.PI / 180;
      e.obj.pshield.holder.rotation.y += angleDiff(targetRot, e.obj.pshield.holder.rotation.y) * Math.min(1, dt * 6);
      e.obj.pshield.mesh.material.opacity = 1;
    }
    if (e.obj.ancile) {
      const an = def.ancile;
      e.obj.ancile.visible = r.an > 0 && (!an.sentryOnly || (r.md & 1));
      e.obj.ancile.material.opacity = 0.12 + 0.1 * Math.sin(G.t * 4) + 0.15 * (r.an || 0);
    }
    // bars
    e.bars.position.set(x, y + def.height + 2.2, z);
    e.bars.quaternion.copy(camera.quaternion);
    const frac = Math.max(0, r.hp / r.mhp);
    e.fill.scale.x = Math.max(0.001, frac); e.fill.position.x = -e.w / 2 * (1 - frac);
    const sh = r.an != null ? r.an : r.ps != null ? r.ps : 0;
    e.shield.visible = sh > 0; e.shield.scale.x = Math.max(0.001, sh); e.shield.position.x = -e.w / 2 * (1 - sh);
    e.shield.material.color.setHex(r.an != null ? 0x80deea : 0xffe082);
    e.bars.visible = e.bars.visible && e.id !== G.myId;
  }

  // projectiles & fx
  if (G.state) effects.syncProjectiles(G.state.projs, dt);
  effects.update(dt);
  hud.updateDmg(dt);

  // target info
  if (G.target != null && G.entities.has(G.target) && G.alive) {
    const te = G.entities.get(G.target); const me = G.entities.get(G.myId);
    hud.updateTarget({ name: te.name, r: te.srv }, me ? Math.hypot(te.pos.x - me.pos.x, te.pos.z - me.pos.z) : 0);
  } else hud.updateTarget(null, 0);

  // minimap
  if (G.state) { const me = G.entities.get(G.myId); hud.drawMinimap(G.state, G.myId, G.myTeam, me ? me.pos : null, G.camYaw); }

  // beacon ring pulse
  if (world) world.beacons.forEach((b, i) => { b.ring.rotation.z = G.t * 0.3; });

  updateCamera(dt);
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);
