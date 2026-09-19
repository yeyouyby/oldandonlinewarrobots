// Coarse grid A* for bots.
import { MAP } from '../shared/map.js';

const CELL = 8;
const MARGIN = 6;

export class NavGrid {
  constructor() {
    this.w = Math.ceil((MAP.halfW * 2) / CELL);
    this.h = Math.ceil((MAP.halfD * 2) / CELL);
    this.blocked = new Uint8Array(this.w * this.h);
    for (let gy = 0; gy < this.h; gy++) {
      for (let gx = 0; gx < this.w; gx++) {
        const [x, z] = this.cellCenter(gx, gy);
        let b = 0;
        if (Math.abs(x) > MAP.halfW - MARGIN || Math.abs(z) > MAP.halfD - MARGIN) b = 1;
        else for (const box of MAP.boxes) {
          if (box.h < 2) continue;
          if (x > box.x - box.w / 2 - MARGIN && x < box.x + box.w / 2 + MARGIN &&
              z > box.z - box.d / 2 - MARGIN && z < box.z + box.d / 2 + MARGIN) { b = 1; break; }
        }
        this.blocked[gy * this.w + gx] = b;
      }
    }
  }
  cellCenter(gx, gy) { return [-MAP.halfW + (gx + 0.5) * CELL, -MAP.halfD + (gy + 0.5) * CELL]; }
  toCell(x, z) {
    return [
      Math.max(0, Math.min(this.w - 1, Math.floor((x + MAP.halfW) / CELL))),
      Math.max(0, Math.min(this.h - 1, Math.floor((z + MAP.halfD) / CELL))),
    ];
  }
  isBlocked(gx, gy) { return gx < 0 || gy < 0 || gx >= this.w || gy >= this.h || this.blocked[gy * this.w + gx] === 1; }

  nearestFree(gx, gy) {
    if (!this.isBlocked(gx, gy)) return [gx, gy];
    for (let r = 1; r < 8; r++) {
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (!this.isBlocked(gx + dx, gy + dy)) return [gx + dx, gy + dy];
      }
    }
    return [gx, gy];
  }

  // 2D line of walkability between two world points (checks cells along the segment)
  lineFree(ax, az, bx, bz) {
    const d = Math.hypot(bx - ax, bz - az);
    const n = Math.ceil(d / (CELL * 0.5));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const [gx, gy] = this.toCell(ax + (bx - ax) * t, az + (bz - az) * t);
      if (this.isBlocked(gx, gy)) return false;
    }
    return true;
  }

  findPath(sx, sz, tx, tz) {
    let [sgx, sgy] = this.nearestFree(...this.toCell(sx, sz));
    let [tgx, tgy] = this.nearestFree(...this.toCell(tx, tz));
    const W = this.w, H = this.h;
    const start = sgy * W + sgx, goal = tgy * W + tgx;
    if (start === goal) return [[tx, tz]];
    const g = new Float32Array(W * H).fill(Infinity);
    const parent = new Int32Array(W * H).fill(-1);
    const closed = new Uint8Array(W * H);
    const open = new MinHeap();
    g[start] = 0;
    open.push(start, this.heur(sgx, sgy, tgx, tgy));
    const dirs = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];
    let found = false, iter = 0;
    while (open.size() && iter++ < 20000) {
      const cur = open.pop();
      if (cur === goal) { found = true; break; }
      if (closed[cur]) continue;
      closed[cur] = 1;
      const cx = cur % W, cy = (cur / W) | 0;
      for (const [dx, dy, cost] of dirs) {
        const nx = cx + dx, ny = cy + dy;
        if (this.isBlocked(nx, ny)) continue;
        if (dx && dy && (this.isBlocked(cx + dx, cy) || this.isBlocked(cx, cy + dy))) continue;
        const ni = ny * W + nx;
        const ng = g[cur] + cost;
        if (ng < g[ni]) { g[ni] = ng; parent[ni] = cur; open.push(ni, ng + this.heur(nx, ny, tgx, tgy)); }
      }
    }
    if (!found) return null;
    const cells = [];
    let c = goal;
    while (c !== -1) { cells.push(c); c = parent[c]; }
    cells.reverse();
    // to world + smoothing
    const pts = cells.map(i => this.cellCenter(i % W, (i / W) | 0));
    pts[pts.length - 1] = [tx, tz];
    const out = [];
    let i = 0;
    let cur = [sx, sz];
    while (i < pts.length - 1) {
      let j = pts.length - 1;
      while (j > i + 1 && !this.lineFree(cur[0], cur[1], pts[j][0], pts[j][1])) j--;
      out.push(pts[j]); cur = pts[j]; i = j;
    }
    if (!out.length) out.push(pts[pts.length - 1]);
    return out;
  }
  heur(ax, ay, bx, by) { const dx = Math.abs(ax - bx), dy = Math.abs(ay - by); return Math.max(dx, dy) + 0.414 * Math.min(dx, dy); }
}

class MinHeap {
  constructor() { this.a = []; }
  size() { return this.a.length; }
  push(v, k) {
    const a = this.a; a.push([v, k]);
    let i = a.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (a[p][1] <= a[i][1]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; }
  }
  pop() {
    const a = this.a; const top = a[0]; const last = a.pop();
    if (a.length) {
      a[0] = last; let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1; let m = i;
        if (l < a.length && a[l][1] < a[m][1]) m = l;
        if (r < a.length && a[r][1] < a[m][1]) m = r;
        if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m;
      }
    }
    return top[0];
  }
}
