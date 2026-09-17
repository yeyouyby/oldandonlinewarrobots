// DOM HUD helpers
import { ROBOTS, WEAPONS } from '/shared/data.js';
import { MAP } from '/shared/map.js';
import { ABILITY_SHORT } from './hangar.js';

const $ = (id) => document.getElementById(id);
const TEAM_CSS = ['#42a5f5', '#ef5350'];

export class HUD {
  constructor() {
    this.dmg = [];
    this.kills = [];
    this.lastWeaponKeys = '';
    this.mm = $('minimap').getContext('2d');
    this.centerT = 0;
    // beacon bar
    const bb = $('beaconBar'); bb.innerHTML = '';
    this.bcEls = MAP.beacons.map(b => { const d = document.createElement('div'); d.className = 'bc'; d.innerHTML = `${b.name}<div class="p"></div>`; bb.appendChild(d); return d; });
  }

  showScreen(name) {
    for (const id of ['hangar', 'lobby', 'hud', 'respawn', 'results']) $(id).classList.toggle('hidden', id !== name && !(name === 'respawn' && id === 'hud') && !(name === 'results' && id === 'hud'));
  }
  show(id, on = true) { $(id).classList.toggle('hidden', !on); }

  // ---- top bar
  updateScore(state) {
    const s = state.score;
    $('scoreBlue').style.width = (s[0] / 10) + '%'; $('scoreBlueTxt').textContent = s[0];
    $('scoreRed').style.width = (s[1] / 10) + '%'; $('scoreRedTxt').textContent = s[1];
    const t = state.phase === 'battle' ? state.left : state.phase === 'waiting' ? state.cd : 0;
    const m = Math.floor(t / 60), sec = Math.floor(t % 60);
    $('timer').textContent = `${m}:${sec < 10 ? '0' : ''}${sec}`;
    $('timer').style.color = state.phase === 'battle' && t < 60 ? '#ff7043' : '';
    state.beacons.forEach(([owner, prog], i) => {
      const el = this.bcEls[i];
      el.className = 'bc' + (owner >= 0 ? ' b' + owner : '');
      const p = el.querySelector('.p');
      p.style.width = Math.abs(prog) * 100 + '%';
      p.style.background = prog < 0 ? TEAM_CSS[0] : TEAM_CSS[1];
    });
  }

  // ---- my robot
  updateMe(r, me, myTeam) {
    if (!r) return;
    const def = ROBOTS[r.k];
    $('myName').textContent = `${def.name} Lv.${r.lv}`;
    const pct = Math.max(0, r.hp / r.mhp * 100);
    $('myHp').style.width = pct + '%';
    $('myHp').style.background = pct > 50 ? '' : pct > 25 ? 'linear-gradient(90deg,#f9a825,#ffee58)' : 'linear-gradient(90deg,#c62828,#ef5350)';
    $('myHpTxt').textContent = `${r.hp.toLocaleString()} / ${r.mhp.toLocaleString()}`;
    const sb = $('myShield');
    const sh = r.an != null ? r.an : r.ps != null ? r.ps : null;
    sb.classList.toggle('hidden', sh == null);
    sb.classList.toggle('phys', r.an == null && r.ps != null);
    if (sh != null) sb.firstElementChild.style.width = Math.max(0, sh * 100) + '%';

    // weapons
    const keys = r.w.join(',');
    const ws = $('weaponSlots');
    if (keys !== this.lastWeaponKeys) {
      this.lastWeaponKeys = keys; ws.innerHTML = '';
      r.w.forEach((k, i) => {
        const d = document.createElement('div'); d.className = 'wp';
        if (!k) { d.innerHTML = '<div class="n">—</div><div class="bar"><div class="fill"></div></div><div class="k">空槽</div>'; d.style.opacity = 0.4; }
        else d.innerHTML = `<div class="n">${WEAPONS[k].name}</div><div class="bar"><div class="fill"></div></div><div class="k"><span class="a"></span> · ${WEAPONS[k].range}m</div>`;
        ws.appendChild(d);
      });
    }
    if (me && me.w) {
      me.w.forEach((w, i) => {
        const d = ws.children[i]; if (!d || !w) return;
        const fill = d.querySelector('.fill');
        const reloading = w.a <= 0 && w.r > 0;
        const wd = WEAPONS[r.w[i]];
        fill.style.width = (reloading ? (1 - w.r / wd.reload) : (w.a / w.c)) * 100 + '%';
        d.classList.toggle('reloading', reloading);
        d.classList.toggle('firing', !!((r.f >> i) & 1));
        d.classList.toggle('out', w.a <= 0 && !reloading);
        d.querySelector('.a').textContent = reloading ? `装填 ${w.r.toFixed(1)}s` : `${w.a}/${w.c}`;
      });
    }

    // ability
    const ab = def.ability;
    const abEl = $('abilityBtn'); const mask = abEl.querySelector('.cdmask');
    if (!ab) { $('abilityLabel').textContent = '无技能'; abEl.classList.remove('ready', 'on'); mask.style.transform = 'scaleY(0)'; }
    else {
      let label = ABILITY_SHORT[ab.type];
      let frac = 0, on = false, ready = true;
      if (ab.type === 'dash') { label += ` ×${me?.ch ?? 0}`; ready = (me?.ch ?? 0) > 0; frac = ready ? 0 : 1; }
      else if (ab.type === 'phalanx') { on = !!(r.md & 8); }
      else if (ab.type === 'sentry') { on = !!(r.md & 1); }
      else if (ab.type === 'bastion') { on = !!(r.md & 2); }
      else { const cd = me?.cd ?? 0; frac = ab.cd ? cd / ab.cd : 0; ready = cd <= 0; if (ab.type === 'stealth' || ab.type === 'descend') on = !!r.st; if (ab.type === 'rush' || ab.type === 'assault') on = !!(r.md & 16); }
      if (frac > 0 && ab.cd) label += ` ${Math.ceil((me?.cd ?? 0))}s`;
      $('abilityLabel').textContent = label;
      mask.style.transform = `scaleY(${Math.min(1, Math.max(0, frac))})`;
      abEl.classList.toggle('ready', ready && !on);
      abEl.classList.toggle('on', on);
    }
  }

  updateTarget(t, dist) {
    const ti = $('targetInfo');
    $('crosshair').classList.toggle('locked', !!t);
    if (!t) { ti.classList.add('hidden'); return; }
    ti.classList.remove('hidden');
    $('tName').textContent = `${t.name} · ${ROBOTS[t.r.k].name} Lv.${t.r.lv}`;
    $('tHp').style.width = Math.max(0, t.r.hp / t.r.mhp * 100) + '%';
    const extra = t.r.an > 0 ? ' · 能量盾' : t.r.ps > 0 ? ' · 物理盾' : '';
    $('tSub').textContent = `${Math.round(dist)} m · ${t.r.hp.toLocaleString()} HP${extra}`;
  }

  // ---- killfeed
  addKill(html, cls) {
    const kf = $('killfeed');
    const d = document.createElement('div'); d.className = cls; d.innerHTML = html;
    kf.appendChild(d);
    while (kf.children.length > 6) kf.removeChild(kf.firstChild);
    setTimeout(() => { if (d.parentNode) d.parentNode.removeChild(d); }, 7000);
  }

  center(msg, ms = 2000, color = '') {
    const el = $('centerMsg'); el.textContent = msg; el.style.color = color; el.classList.remove('hidden');
    clearTimeout(this.centerT); this.centerT = setTimeout(() => el.classList.add('hidden'), ms);
  }

  hurt() {
    const v = $('vignette'); v.classList.add('hurt');
    clearTimeout(this.hurtT); this.hurtT = setTimeout(() => v.classList.remove('hurt'), 250);
  }

  // ---- damage numbers
  dmgNumber(sx, sy, d, big) {
    if (sx < 0 || sy < 0 || sx > innerWidth || sy > innerHeight) return;
    const el = document.createElement('div'); el.className = 'dn' + (big ? ' big' : '');
    el.textContent = d >= 1000 ? (d / 1000).toFixed(1) + 'k' : String(d);
    $('dmgNumbers').appendChild(el);
    this.dmg.push({ el, x: sx + (Math.random() - 0.5) * 40, y: sy - 10, vy: -60 - Math.random() * 30, t: 1.1 });
    if (this.dmg.length > 40) { const o = this.dmg.shift(); o.el.remove(); }
  }
  updateDmg(dt) {
    for (let i = this.dmg.length - 1; i >= 0; i--) {
      const d = this.dmg[i]; d.t -= dt; d.y += d.vy * dt; d.vy += 40 * dt;
      if (d.t <= 0) { d.el.remove(); this.dmg.splice(i, 1); continue; }
      d.el.style.transform = `translate(${d.x}px, ${d.y}px)`;
      d.el.style.opacity = Math.min(1, d.t * 2);
    }
  }

  // ---- minimap
  drawMinimap(state, myId, myTeam, myPos, camYaw) {
    const g = this.mm; const W = 200, H = 140;
    const sc = Math.min(W / (MAP.halfW * 2 + 10), H / (MAP.halfD * 2 + 10));
    const X = (x) => W / 2 + x * sc, Z = (z) => H / 2 + z * sc;
    g.clearRect(0, 0, W, H);
    g.fillStyle = 'rgba(70,75,70,0.9)'; g.fillRect(X(-MAP.halfW), Z(-MAP.halfD), MAP.halfW * 2 * sc, MAP.halfD * 2 * sc);
    g.fillStyle = 'rgba(25,28,32,0.9)';
    for (const b of MAP.boxes) g.fillRect(X(b.x - b.w / 2), Z(b.z - b.d / 2), b.w * sc, b.d * sc);
    state.beacons.forEach(([owner, prog], i) => {
      const b = MAP.beacons[i];
      g.beginPath(); g.arc(X(b.x), Z(b.z), 6, 0, Math.PI * 2);
      g.fillStyle = owner === 0 ? TEAM_CSS[0] : owner === 1 ? TEAM_CSS[1] : '#cfcfcf'; g.fill();
      if (Math.abs(prog) > 0.02 && Math.abs(prog) < 1) { g.beginPath(); g.arc(X(b.x), Z(b.z), 8, -Math.PI / 2, -Math.PI / 2 + Math.abs(prog) * Math.PI * 2); g.strokeStyle = prog < 0 ? TEAM_CSS[0] : TEAM_CSS[1]; g.lineWidth = 2; g.stroke(); }
      g.fillStyle = '#000'; g.font = 'bold 8px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(b.name, X(b.x), Z(b.z) + 0.5);
    });
    for (const r of state.robots) {
      if (r.id === myId) continue;
      const t = this._teamOf(state, r.id);
      if (t !== myTeam && r.st) continue;
      g.beginPath(); g.arc(X(r.x), Z(r.z), 3, 0, Math.PI * 2);
      g.fillStyle = t === myTeam ? (myTeam === 0 ? TEAM_CSS[0] : TEAM_CSS[1]) : (myTeam === 0 ? TEAM_CSS[1] : TEAM_CSS[0]);
      g.fill();
    }
    if (myPos) {
      g.save(); g.translate(X(myPos.x), Z(myPos.z)); g.rotate(-camYaw);
      g.beginPath(); g.moveTo(0, -6); g.lineTo(4, 4); g.lineTo(-4, 4); g.closePath(); g.fillStyle = '#ffb020'; g.fill(); g.restore();
    }
  }
  _teamOf(state, id) { const p = state.players.find(p => p.id === id); return p ? p.t : -1; }

  // ---- respawn
  showRespawn(hangar, used, left, onPick) {
    $('respawnTitle').textContent = left > 0 ? '机甲被摧毁' : '所有机甲已耗尽';
    const list = $('respawnList'); list.innerHTML = '';
    hangar.forEach((h, i) => {
      const d = document.createElement('div');
      const def = ROBOTS[h.key];
      const isUsed = used.includes(i);
      d.className = 'rs' + (isUsed ? ' used' : '');
      d.innerHTML = `<b>${def.name}</b><small>Lv.${h.level} · ${h.weapons.filter(Boolean).map(w => WEAPONS[w.key].name).join(' / ') || '无武器'}</small>`;
      if (!isUsed) d.addEventListener('click', () => onPick(i));
      list.appendChild(d);
    });
    this.show('respawn', true);
  }

  showResults(msg, myId, myTeam) {
    const title = $('resultTitle');
    title.textContent = msg.draw ? '平局' : msg.win ? '胜利 VICTORY' : '失败 DEFEAT';
    title.className = msg.draw ? '' : msg.win ? 'win' : 'lose';
    $('rewardTxt').textContent = `奖励：+${msg.reward.ag.toLocaleString()} Ag · +${msg.reward.au} Au · 击杀 ${msg.stats.kills} · 伤害 ${Math.round(msg.stats.damage).toLocaleString()} · 信标 ${msg.stats.beacons}`;
    const tbl = $('resultTable');
    let html = '<tr><th>驾驶员</th><th>阵营</th><th>击杀</th><th>伤害</th><th>信标</th></tr>';
    for (const team of [myTeam, 1 - myTeam]) {
      for (const r of msg.results.filter(x => x.team === team)) {
        html += `<tr class="t${r.team}${r.id === myId ? ' me' : ''}"><td>${r.name}${r.human ? '' : ' <small>(AI)</small>'}</td><td>${r.team === 0 ? '蓝' : '红'}</td><td>${r.kills}</td><td>${r.damage.toLocaleString()}</td><td>${r.beacons}</td></tr>`;
      }
    }
    tbl.innerHTML = html;
    this.show('results', true);
  }

  lobby(text, hangar) {
    $('lobbyInfo').textContent = text;
    if (hangar) $('lobbyHangar').innerHTML = hangar.map(h => `<span>${ROBOTS[h.key].name} Lv.${h.level}</span>`).join('');
  }
}
