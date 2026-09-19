// Visual + audio effects
import * as THREE from 'three';

const MAX_FX = 220;

function makeGlowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.4, 'rgba(255,255,255,0.5)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

const KIND_COLOR = {
  mg: 0xffe27a, cannon: 0xffb066, shotgun: 0xffc27a, beam: 0x66c8ff, flame: 0xff7a2a, lightning: 0xb0e0ff,
  plasma: 0x5ad0ff, rocket: 0xffa040, homing: 0xff6a3a, artillery: 0xffcc66,
};

export class Effects {
  constructor(scene, camera) {
    this.scene = scene; this.camera = camera;
    this.items = [];
    this.projMeshes = new Map();
    this.tracerMat = {};
    this.sparkGeo = new THREE.SphereGeometry(0.35, 6, 4);
    this.projGeo = {
      plasma: new THREE.SphereGeometry(0.6, 8, 6),
      rocket: new THREE.CylinderGeometry(0.22, 0.32, 1.8, 6),
      homing: new THREE.CylinderGeometry(0.2, 0.28, 1.5, 6),
      artillery: new THREE.SphereGeometry(0.7, 8, 6),
    };
    this.projMat = {};
    for (const k of Object.keys(this.projGeo)) this.projMat[k] = new THREE.MeshBasicMaterial({ color: KIND_COLOR[k] });
    this.smokeMat = new THREE.MeshBasicMaterial({ color: 0x333333, transparent: true, opacity: 0.5, depthWrite: false });
    this.debrisGeo = new THREE.BoxGeometry(1, 1, 1);
    this.debrisMat = new THREE.MeshLambertMaterial({ color: 0x444a50 });
    this.boomGeo = new THREE.SphereGeometry(1, 10, 7);
    this.audio = new Audio3();
  }

  add(obj, life, update) {
    // hard cap on live effect objects: drop the oldest when the budget is exceeded
    if (this.items.length >= MAX_FX) { const old = this.items.shift(); this.scene.remove(old.obj); }
    this.scene.add(obj);
    this.items.push({ obj, life, max: life, update });
  }

  // Muzzle-flash / explosion "light" without a real PointLight (adding/removing lights forces every
  // material's shader to recompile → frame hitches). An additive sprite reads nearly the same.
  glow(pos, color, size, life) {
    const sp = new THREE.Sprite(this.glowMat(color));
    sp.position.copy(pos); sp.scale.setScalar(size);
    this.add(sp, life, (o, t) => { o.material.opacity = t * 0.8; o.scale.setScalar(size * (1.3 - t * 0.3)); });
  }
  glowMat(color) {
    // one material per colour, cloned so opacity is independent per sprite
    if (!this._glowTex) this._glowTex = makeGlowTexture();
    return new THREE.SpriteMaterial({ map: this._glowTex, color, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false });
  }

  // straight tracer segment from a to b
  tracer(a, b, kind, width = 1) {
    const color = KIND_COLOR[kind] || 0xffffff;
    const dir = new THREE.Vector3().subVectors(b, a); const len = dir.length();
    if (len < 0.1) return;
    const geo = new THREE.CylinderGeometry(0.08 * width, 0.08 * width, len, 4, 1, true);
    geo.translate(0, len / 2, 0); geo.rotateX(Math.PI / 2);
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.position.copy(a); m.lookAt(b);
    const life = kind === 'beam' || kind === 'flame' || kind === 'lightning' ? 0.12 : 0.07;
    this.add(m, life, (o, t) => { o.material.opacity = t * 0.9; });
  }

  lightningBolt(a, b) {
    const pts = []; const n = 10;
    for (let i = 0; i <= n; i++) {
      const p = new THREE.Vector3().lerpVectors(a, b, i / n);
      if (i > 0 && i < n) { p.x += (Math.random() - 0.5) * 3; p.y += (Math.random() - 0.5) * 3; p.z += (Math.random() - 0.5) * 3; }
      pts.push(p);
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xcfefff, transparent: true, opacity: 1 }));
    this.add(line, 0.15, (o, t) => { o.material.opacity = t; });
  }

  muzzleFlash(pos, kind) {
    const s = new THREE.Mesh(this.sparkGeo, new THREE.MeshBasicMaterial({ color: KIND_COLOR[kind] || 0xffffaa, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    s.position.copy(pos); s.scale.setScalar(kind === 'cannon' || kind === 'rocket' ? 3.5 : 2);
    this.add(s, 0.06, (o, t) => { o.material.opacity = t; });
    this.glow(pos, KIND_COLOR[kind] || 0xffffaa, kind === 'cannon' || kind === 'rocket' ? 9 : 5, 0.08);
  }

  sparks(pos, kind, count = 6) {
    for (let i = 0; i < count; i++) {
      const s = new THREE.Mesh(this.sparkGeo, new THREE.MeshBasicMaterial({ color: KIND_COLOR[kind] || 0xffddaa, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      s.position.copy(pos);
      const v = new THREE.Vector3((Math.random() - 0.5) * 20, Math.random() * 14, (Math.random() - 0.5) * 20);
      this.add(s, 0.35 + Math.random() * 0.25, (o, t, dt) => { v.y -= 40 * dt; o.position.addScaledVector(v, dt); o.material.opacity = t; o.scale.setScalar(t); });
    }
  }

  explosion(pos, radius, kind) {
    const r = Math.max(2, radius || 3);
    const m = new THREE.Mesh(this.boomGeo, new THREE.MeshBasicMaterial({ color: kind === 'plasma' ? 0x5ad0ff : 0xffa030, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.position.copy(pos);
    this.add(m, 0.4, (o, t) => { o.scale.setScalar(r * (1.2 - t)); o.material.opacity = t * 0.85; });
    this.glow(pos, kind === 'plasma' ? 0x5ad0ff : 0xffb060, r * 4, 0.3);
    // smoke
    for (let i = 0; i < 2; i++) {
      const sm = new THREE.Mesh(this.boomGeo, this.smokeMat.clone());
      sm.position.copy(pos).add(new THREE.Vector3((Math.random() - 0.5) * r, Math.random() * r * 0.5, (Math.random() - 0.5) * r));
      const rise = 3 + Math.random() * 3;
      this.add(sm, 1.2, (o, t, dt) => { o.position.y += rise * dt; o.scale.setScalar(r * 0.5 * (1.6 - t)); o.material.opacity = t * 0.4; });
    }
    this.sparks(pos, kind, 5);
  }

  bigExplosion(pos) {
    this.explosion(pos, 9, 'rocket');
    for (let i = 0; i < 4; i++) setTimeout(() => this.explosion(pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 8, Math.random() * 6, (Math.random() - 0.5) * 8)), 4 + Math.random() * 4, 'rocket'), i * 120 + 80);
    // debris
    for (let i = 0; i < 12; i++) {
      const d = new THREE.Mesh(this.debrisGeo, this.debrisMat); d.scale.set(0.6 + Math.random(), 0.6 + Math.random(), 0.6 + Math.random());
      d.position.copy(pos); d.position.y += 3;
      const v = new THREE.Vector3((Math.random() - 0.5) * 30, 10 + Math.random() * 20, (Math.random() - 0.5) * 30);
      const rot = new THREE.Vector3(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      this.add(d, 2.5, (o, t, dt) => { v.y -= 32 * dt; o.position.addScaledVector(v, dt); if (o.position.y < 0.3) { o.position.y = 0.3; v.set(v.x * 0.5, -v.y * 0.3, v.z * 0.5); } o.rotation.x += rot.x * dt; o.rotation.y += rot.y * dt; });
    }
  }

  jumpDust(pos) {
    for (let i = 0; i < 8; i++) {
      const sm = new THREE.Mesh(this.boomGeo, new THREE.MeshBasicMaterial({ color: 0x8a8578, transparent: true, opacity: 0.5, depthWrite: false }));
      sm.position.copy(pos); sm.position.y += 0.5;
      const ang = i / 8 * Math.PI * 2; const v = new THREE.Vector3(Math.cos(ang) * 12, 2, Math.sin(ang) * 12);
      this.add(sm, 0.7, (o, t, dt) => { o.position.addScaledVector(v, dt); o.scale.setScalar(2 * (1.5 - t)); o.material.opacity = t * 0.5; });
    }
  }

  dashTrail(pos, dir) {
    const m = new THREE.Mesh(this.boomGeo, new THREE.MeshBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.position.copy(pos); m.position.y += 3; m.scale.set(3, 3, 6);
    m.lookAt(pos.clone().add(dir));
    this.add(m, 0.3, (o, t) => { o.material.opacity = t * 0.4; o.scale.z = 6 + (1 - t) * 10; });
  }

  beaconFlash(pos, colorHex) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(1, 1.6, 40), new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.copy(pos); ring.position.y += 0.3;
    this.add(ring, 0.8, (o, t) => { o.scale.setScalar(1 + (1 - t) * 30); o.material.opacity = t * 0.8; });
  }

  // projectiles from server state
  syncProjectiles(list, dt) {
    const seen = new Set();
    for (const pr of list) {
      seen.add(pr.id);
      let m = this.projMeshes.get(pr.id);
      if (!m) {
        m = new THREE.Mesh(this.projGeo[pr.k] || this.projGeo.plasma, this.projMat[pr.k] || this.projMat.plasma);
        m.position.set(pr.x, pr.y, pr.z);
        m.userData.target = new THREE.Vector3(pr.x, pr.y, pr.z);
        m.userData.prev = m.position.clone();
        m.userData.kind = pr.k;
        m.userData.smokeT = 0;
        this.scene.add(m); this.projMeshes.set(pr.id, m);
      } else {
        m.userData.prev.copy(m.userData.target);
        m.userData.target.set(pr.x, pr.y, pr.z);
      }
    }
    for (const [id, m] of this.projMeshes) {
      if (!seen.has(id)) { this.scene.remove(m); this.projMeshes.delete(id); continue; }
      // interpolate toward target (server 20Hz -> 50ms)
      m.position.lerp(m.userData.target, Math.min(1, dt * 14));
      const vel = new THREE.Vector3().subVectors(m.userData.target, m.userData.prev);
      if (vel.lengthSq() > 0.01 && m.userData.kind !== 'plasma') {
        const look = m.position.clone().add(vel);
        m.lookAt(look); m.rotateX(Math.PI / 2);
      }
      if (m.userData.kind === 'rocket' || m.userData.kind === 'homing') {
        m.userData.smokeT += dt;
        if (m.userData.smokeT > 0.09) {
          m.userData.smokeT = 0;
          const sm = new THREE.Mesh(this.boomGeo, new THREE.MeshBasicMaterial({ color: 0x9a9a9a, transparent: true, opacity: 0.35, depthWrite: false }));
          sm.position.copy(m.position); sm.scale.setScalar(0.4);
          this.add(sm, 0.5, (o, t) => { o.scale.setScalar(0.4 + (1 - t) * 1.2); o.material.opacity = t * 0.35; });
        }
      }
    }
  }

  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.life -= dt;
      if (it.life <= 0) {
        this.scene.remove(it.obj);
        const g = it.obj.geometry;
        if (g && g !== this.sparkGeo && g !== this.boomGeo && g !== this.debrisGeo) g.dispose?.();
        const mt = it.obj.material;
        if (mt && mt !== this.smokeMat && mt !== this.debrisMat) mt.dispose?.();
        this.items.splice(i, 1);
        continue;
      }
      it.update && it.update(it.obj, it.life / it.max, dt);
    }
  }

  clear() {
    for (const it of this.items) this.scene.remove(it.obj);
    this.items = [];
    for (const m of this.projMeshes.values()) this.scene.remove(m);
    this.projMeshes.clear();
  }
}

// ------------------------------------------------------------------ audio
// Procedural WebAudio SFX — keeps the game asset-free.
class Audio3 {
  constructor() { this.ctx = null; this.muted = localStorage.getItem('wr-mute') === '1'; this.listener = { x: 0, y: 0, z: 0 }; this.last = {}; }
  ensure() {
    if (!this.ctx) { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); this.master = this.ctx.createGain(); this.master.gain.value = 0.5; this.master.connect(this.ctx.destination); } catch { /* no audio */ } }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }
  toggleMute() { this.muted = !this.muted; localStorage.setItem('wr-mute', this.muted ? '1' : '0'); return this.muted; }
  setListener(x, y, z) { this.listener.x = x; this.listener.y = y; this.listener.z = z; }
  gainFor(pos) {
    if (!pos) return 1;
    const d = Math.hypot(pos.x - this.listener.x, pos.z - this.listener.z);
    return Math.max(0, 1 - d / 260) ** 1.5;
  }
  play(kind, pos) {
    if (this.muted || !this.ctx) return;
    const now = performance.now();
    if (this.last[kind] && now - this.last[kind] < 25) return; // rate-limit
    this.last[kind] = now;
    const g = this.gainFor(pos); if (g <= 0.01) return;
    const c = this.ctx; const t = c.currentTime;
    const out = c.createGain(); out.connect(this.master);
    const env = (peak, dur) => { out.gain.setValueAtTime(0.0001, t); out.gain.exponentialRampToValueAtTime(peak * g, t + 0.005); out.gain.exponentialRampToValueAtTime(0.0001, t + dur); };
    const noise = (dur, filterHz) => {
      const buf = c.createBuffer(1, c.sampleRate * dur, c.sampleRate); const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      const src = c.createBufferSource(); src.buffer = buf;
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filterHz;
      src.connect(f); f.connect(out); src.start(t); src.stop(t + dur);
    };
    const osc = (type, f0, f1, dur) => { const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur); o.connect(out); o.start(t); o.stop(t + dur); };
    switch (kind) {
      case 'mg': env(0.25, 0.08); noise(0.08, 3000); osc('square', 220, 80, 0.06); break;
      case 'cannon': env(0.6, 0.3); noise(0.3, 1200); osc('sawtooth', 120, 40, 0.25); break;
      case 'shotgun': env(0.5, 0.2); noise(0.2, 2500); break;
      case 'rocket': env(0.35, 0.25); noise(0.25, 900); osc('sawtooth', 300, 60, 0.2); break;
      case 'homing': env(0.3, 0.3); noise(0.3, 700); break;
      case 'artillery': env(0.5, 0.4); noise(0.4, 500); osc('sine', 90, 30, 0.35); break;
      case 'plasma': env(0.35, 0.18); osc('sine', 900, 200, 0.15); osc('triangle', 1400, 300, 0.12); break;
      case 'beam': env(0.15, 0.1); osc('sawtooth', 600, 620, 0.1); break;
      case 'flame': env(0.2, 0.12); noise(0.12, 600); break;
      case 'lightning': env(0.6, 0.3); noise(0.3, 6000); osc('square', 1800, 100, 0.25); break;
      case 'boom': env(0.8, 0.6); noise(0.6, 400); osc('sine', 80, 25, 0.5); break;
      case 'kill': env(1.0, 1.4); noise(1.4, 300); osc('sine', 60, 20, 1.2); break;
      case 'hit': env(0.2, 0.06); noise(0.06, 5000); break;
      case 'jump': env(0.5, 0.5); noise(0.5, 800); osc('sine', 100, 300, 0.4); break;
      case 'dash': env(0.5, 0.35); noise(0.35, 2000); osc('sawtooth', 200, 900, 0.3); break;
      case 'stealth': env(0.4, 0.5); osc('sine', 400, 1600, 0.45); break;
      case 'beacon': env(0.5, 0.5); osc('sine', 520, 520, 0.15); setTimeout(() => { const o2 = c.createOscillator(); const g2 = c.createGain(); g2.gain.setValueAtTime(0.4, c.currentTime); g2.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.4); o2.frequency.value = 780; o2.connect(g2); g2.connect(this.master); o2.start(); o2.stop(c.currentTime + 0.4); }, 160); break;
      case 'lock': env(0.3, 0.12); osc('square', 1200, 1200, 0.05); break;
      case 'reload': env(0.3, 0.15); osc('square', 300, 500, 0.12); break;
      case 'ui': env(0.3, 0.08); osc('sine', 800, 900, 0.07); break;
      case 'start': env(0.8, 1.2); osc('sawtooth', 100, 400, 1.0); noise(1.0, 600); break;
    }
  }
}
