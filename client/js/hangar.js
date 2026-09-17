// Hangar screen: slots, robot panel, shop, inventory, equip modal
import { ROBOTS, WEAPONS, SLOT_NAME, robotHp, robotSpeed, weaponDmg, weaponDps, robotUpgradeCost, weaponUpgradeCost, robotMaxLevel, weaponMaxLevel, SLOT_UNLOCK_COST } from '/shared/data.js';
import * as P from './profile.js';

const $ = (id) => document.getElementById(id);

export const ABILITY_NAME = {
  jump: '跳跃 Jump', dash: '冲刺 Dash', stealth: '隐身 Stealth', descend: '突袭 Descend', rush: '疾冲 Rush', assault: '突击 Assault',
  phalanx: '方阵 Phalanx', sentry: '哨戒 Sentry', bastion: '堡垒 Bastion',
};
export const ABILITY_SHORT = { jump: '跳跃', dash: '冲刺', stealth: '隐身', descend: '突袭', rush: '疾冲', assault: '突击', phalanx: '方阵', sentry: '哨戒', bastion: '堡垒' };
const CLS_NAME = { light: '轻型', medium: '中型', heavy: '重型' };
const TYPE_NAME = { kinetic: '动能', explosive: '爆炸', energy: '能量' };
const KIND_NAME = { mg: '机枪', cannon: '火炮', shotgun: '霰弹', beam: '光束', flame: '火焰', lightning: '闪电', plasma: '等离子', rocket: '火箭', homing: '制导', artillery: '曲射' };

let selected = null;      // selected robot id
let tab = 'robots';
let onPreview = () => {}; // callback (robotKey, weaponKeys, team)

export function initHangar({ preview, onBattle }) {
  onPreview = preview;
  selected = P.profile.hangar.find(Boolean) || (P.profile.robots[0] && P.profile.robots[0].id) || null;
  document.querySelectorAll('.tab').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x === b));
    tab = b.dataset.tab; renderShop();
  }));
  $('btnBattle').addEventListener('click', () => {
    if (!P.hangarPayload().length) { alert('机库里至少要有一台装备了武器的机甲！'); return; }
    onBattle();
  });
  $('btnReset').addEventListener('click', () => { if (confirm('确定重置存档？所有机甲和货币将恢复初始状态。')) P.reset(); });
  $('btnHelp').addEventListener('click', () => $('help').classList.remove('hidden'));
  $('helpClose').addEventListener('click', () => $('help').classList.add('hidden'));
  $('modalClose').addEventListener('click', closeModal);
  $('modal').addEventListener('click', (e) => { if (e.target === $('modal')) closeModal(); });
  $('pilotName').addEventListener('click', () => {
    const n = prompt('输入驾驶员名称（最多 14 字符）', P.profile.name);
    if (n && n.trim()) { P.profile.name = n.trim().slice(0, 14); P.save(); renderAll(); }
  });
  renderAll();
}

export function renderAll() {
  $('ag').textContent = P.fmt(P.profile.ag);
  $('au').textContent = P.fmt(P.profile.au);
  $('pilotName').textContent = P.profile.name + ' ✎';
  renderSlots();
  renderRobotPanel();
  renderShop();
  const s = P.profile.stats;
  $('profileStats').innerHTML = `对战 ${s.battles} · 胜利 ${s.wins} · 击杀 ${s.kills}<br>累计伤害 ${P.fmt(s.damage)}`;
  const r = selected && P.robotById(selected);
  if (r) onPreview(r.key, r.weapons.map(id => { const w = id && P.weaponById(id); return w ? w.key : null; }));
}

function renderSlots() {
  const el = $('hangarSlots'); el.innerHTML = '';
  for (let i = 0; i < 5; i++) {
    const d = document.createElement('div');
    if (i >= P.profile.slotsUnlocked) {
      d.className = 'slot locked';
      d.innerHTML = `🔒 解锁第 ${i + 1} 槽位 · ${P.costStr(SLOT_UNLOCK_COST[i])}`;
      if (i === P.profile.slotsUnlocked) d.addEventListener('click', () => { if (!P.unlockSlot()) alert('货币不足'); renderAll(); });
      el.appendChild(d); continue;
    }
    const id = P.profile.hangar[i];
    const r = id && P.robotById(id);
    if (!r) {
      d.className = 'slot empty'; d.textContent = '+ 放入机甲';
      d.addEventListener('click', () => pickRobotForSlot(i));
    } else {
      const def = ROBOTS[r.key];
      d.className = 'slot' + (selected === r.id ? ' active' : '');
      const wcount = r.weapons.filter(Boolean).length;
      d.innerHTML = `<div><div class="n">${def.name}</div><div class="lv">Lv.${r.level} · ${CLS_NAME[def.cls]} · 武器 ${wcount}/${def.slots.length}${wcount === 0 ? ' ⚠' : ''}</div></div><span class="lv">${i + 1}</span>`;
      d.addEventListener('click', () => { selected = r.id; renderAll(); });
      d.addEventListener('contextmenu', (e) => { e.preventDefault(); pickRobotForSlot(i); });
    }
    el.appendChild(d);
  }
}

function pickRobotForSlot(i) {
  const list = P.profile.robots;
  openModal(`选择放入槽位 ${i + 1} 的机甲`, [
    { title: '（清空槽位）', meta: '', onClick: () => { P.setHangarSlot(i, null); closeModal(); renderAll(); } },
    ...list.map(r => {
      const def = ROBOTS[r.key];
      const inSlot = P.profile.hangar.indexOf(r.id);
      return { title: `${def.name} Lv.${r.level}`, meta: `${CLS_NAME[def.cls]} · ${Math.round(robotHp(def, r.level) / 1000)}k HP${inSlot >= 0 ? ` · 已在槽位 ${inSlot + 1}` : ''}`, onClick: () => { P.setHangarSlot(i, r.id); selected = r.id; closeModal(); renderAll(); } };
    }),
  ]);
}

function renderRobotPanel() {
  const el = $('robotPanel');
  const r = selected && P.robotById(selected);
  if (!r) { el.innerHTML = '<h3>机甲详情</h3><p class="rp-desc">在左侧机库中选择一台机甲，或到下方商店购买。</p>'; return; }
  const def = ROBOTS[r.key];
  const max = robotMaxLevel(def);
  const upCost = r.level < max ? robotUpgradeCost(def, r.level) : null;
  const ab = def.ability ? ABILITY_NAME[def.ability.type] : '无';
  const abDetail = def.ability ? abilityDetail(def.ability) : '';
  const inHangar = P.profile.hangar.includes(r.id);
  let html = `<div class="rp-title"><h2>${def.name}</h2><span class="lv">Lv.${r.level}/${max} · ${CLS_NAME[def.cls]} · T${def.tier}</span></div>
    <div class="rp-desc">${def.desc || ''}</div>
    <div class="statline"><span>耐久</span><b>${robotHp(def, r.level).toLocaleString()}${r.level < max ? ` → ${robotHp(def, r.level + 1).toLocaleString()}` : ''}</b></div>
    <div class="statline"><span>速度</span><b>${robotSpeed(def, r.level)} km/h</b></div>
    <div class="statline"><span>技能</span><b>${ab}</b></div>
    ${abDetail ? `<div class="rp-desc">${abDetail}</div>` : ''}
    ${def.pshield ? `<div class="statline"><span>物理盾</span><b>${def.pshield.hp.toLocaleString()} HP</b></div>` : ''}
    ${def.ancile ? `<div class="statline"><span>Ancile 能量盾</span><b>${def.ancile.hp.toLocaleString()} HP</b></div>` : ''}
    <div class="wslots">`;
  def.slots.forEach((st, i) => {
    const wid = r.weapons[i]; const w = wid && P.weaponById(wid);
    if (w) {
      const wd = WEAPONS[w.key];
      html += `<div class="wslot" data-slot="${i}"><span class="tag ${st}">${SLOT_NAME[st]}</span><span class="wn"><b>${wd.name}</b> <span class="wl">Lv.${w.level} · ${weaponDmg(wd, w.level)} × ${wd.clip} · ${wd.range}m</span></span><button class="ghost small up" data-upw="${w.id}">${w.level < weaponMaxLevel(wd) ? '升级 ' + P.fmt(weaponUpgradeCost(wd, w.level)) : 'MAX'}</button></div>`;
    } else {
      html += `<div class="wslot" data-slot="${i}"><span class="tag ${st}">${SLOT_NAME[st]}</span><span class="wn wl">（空）点击装配 ${SLOT_NAME[st]}武器</span></div>`;
    }
  });
  html += `</div><div class="actions">
    <button class="primary" id="btnUpRobot" ${upCost && P.profile.ag >= upCost ? '' : 'disabled'}>${upCost ? '升级 ' + P.fmt(upCost) + ' Ag' : '已满级'}</button>
    ${inHangar ? '' : '<button class="ghost" id="btnToSlot">放入机库</button>'}
    <button class="ghost" id="btnSellRobot">出售</button>
  </div>`;
  el.innerHTML = html;
  el.querySelectorAll('.wslot').forEach(ws => ws.addEventListener('click', (e) => {
    if (e.target.closest('[data-upw]')) return;
    openEquipModal(r.id, +ws.dataset.slot);
  }));
  el.querySelectorAll('[data-upw]').forEach(b => b.addEventListener('click', () => { if (!P.upgradeWeapon(b.dataset.upw)) alert('银币不足或已满级'); renderAll(); }));
  el.querySelector('#btnUpRobot')?.addEventListener('click', () => { if (!P.upgradeRobot(r.id)) alert('银币不足'); renderAll(); });
  el.querySelector('#btnToSlot')?.addEventListener('click', () => {
    const empty = P.profile.hangar.findIndex((s, i) => s === null && i < P.profile.slotsUnlocked);
    if (empty < 0) { alert('机库已满，请先清空一个槽位（右键槽位）'); return; }
    P.setHangarSlot(empty, r.id); renderAll();
  });
  el.querySelector('#btnSellRobot')?.addEventListener('click', () => { if (confirm(`出售 ${def.name}？（返还 50% 银币）`)) { P.sellRobot(r.id); selected = P.profile.hangar.find(Boolean) || null; renderAll(); } });
}

function abilityDetail(ab) {
  switch (ab.type) {
    case 'jump': return `跳跃至空中，冷却 ${ab.cd}s，可越过建筑。`;
    case 'dash': return `${ab.charges} 次冲刺，每 ${ab.cd}s 恢复一次。`;
    case 'stealth': return `隐身 ${ab.dur}s，敌人无法锁定，冷却 ${ab.cd}s。`;
    case 'descend': return `跳跃同时隐身 ${ab.dur}s，冷却 ${ab.cd}s。`;
    case 'rush': return `速度 ×${ab.mult} 持续 ${ab.dur}s，冷却 ${ab.cd}s。`;
    case 'assault': return `速度 ×${ab.mult} 持续 ${ab.dur}s，期间无法开火，冷却 ${ab.cd}s。`;
    case 'phalanx': return '切换方阵模式：物理盾移到正面，但速度降低。';
    case 'sentry': return '切换哨戒模式：静止不动，展开 Ancile 能量盾。';
    case 'bastion': return `切换堡垒模式：静止不动，伤害 ×${ab.mult}。`;
    default: return '';
  }
}

function openEquipModal(robotId, slotIdx) {
  const r = P.robotById(robotId); const st = ROBOTS[r.key].slots[slotIdx];
  const items = [];
  if (r.weapons[slotIdx]) items.push({ title: '（卸下武器）', meta: '', onClick: () => { P.equipWeapon(robotId, slotIdx, null); closeModal(); renderAll(); } });
  const owned = P.profile.weapons.filter(w => WEAPONS[w.key].slot === st);
  for (const w of owned) {
    const wd = WEAPONS[w.key]; const on = P.weaponMountedOn(w.id);
    items.push({ title: `${wd.name} Lv.${w.level}`, meta: `${KIND_NAME[wd.kind]} · ${TYPE_NAME[wd.type]} · ${wd.range}m · ${weaponDmg(wd, w.level)}×${wd.clip}${on ? ` · 装在 ${ROBOTS[on.key].name}` : ''}`, onClick: () => { P.equipWeapon(robotId, slotIdx, w.id); closeModal(); renderAll(); } });
  }
  // shop shortcut
  Object.entries(WEAPONS).filter(([, wd]) => wd.slot === st).forEach(([key, wd]) => {
    items.push({ title: `购买 ${wd.name}`, meta: `${KIND_NAME[wd.kind]} · ${wd.range}m · ${P.costStr(wd.cost)}`, disabled: !P.canAfford(wd.cost), onClick: () => { const w = P.buyWeapon(key); if (w) { P.equipWeapon(robotId, slotIdx, w.id); closeModal(); renderAll(); } } });
  });
  openModal(`装配 ${SLOT_NAME[st]}武器槽 ${slotIdx + 1}`, items);
}

function openModal(title, items) {
  $('modalTitle').textContent = title;
  const body = $('modalBody'); body.innerHTML = '';
  for (const it of items) {
    const d = document.createElement('div'); d.className = 'item' + (it.disabled ? ' disabled' : '');
    d.innerHTML = `<b>${it.title}</b><span class="m">${it.meta || ''}</span>`;
    if (!it.disabled) d.addEventListener('click', it.onClick);
    body.appendChild(d);
  }
  $('modal').classList.remove('hidden');
}
function closeModal() { $('modal').classList.add('hidden'); }

function renderShop() {
  const el = $('shop'); el.innerHTML = '';
  if (tab === 'robots') {
    Object.entries(ROBOTS).sort((a, b) => a[1].tier - b[1].tier || (a[1].cost.au || 0) - (b[1].cost.au || 0) || (a[1].cost.ag || 0) - (b[1].cost.ag || 0)).forEach(([key, def]) => {
      const ownedN = P.profile.robots.filter(r => r.key === key).length;
      const c = document.createElement('div'); c.className = 'card' + (ownedN ? ' owned' : '');
      c.innerHTML = `<div class="title">${def.name}<span class="tier">T${def.tier}</span></div>
        <div class="meta">${CLS_NAME[def.cls]} · ${def.slots.map(s => SLOT_NAME[s][0]).join('')}<br>${Math.round(robotHp(def, def.minLevel) / 1000)}k HP · ${robotSpeed(def, def.minLevel)} km/h<br>${def.ability ? ABILITY_SHORT[def.ability.type] : '无技能'}${ownedN ? ` · 已拥有 ${ownedN}` : ''}</div>
        <div class="price ${def.cost.au ? 'au' : 'ag'}">${P.costStr(def.cost)}</div>
        <button class="primary small" ${P.canAfford(def.cost) ? '' : 'disabled'}>购买</button>`;
      c.querySelector('button').addEventListener('click', () => { const r = P.buyRobot(key); if (r) { selected = r.id; renderAll(); } });
      c.addEventListener('mouseenter', () => onPreview(key, def.slots.map(() => null)));
      el.appendChild(c);
    });
  } else if (tab === 'weapons') {
    Object.entries(WEAPONS).sort((a, b) => 'LMH'.indexOf(a[1].slot) - 'LMH'.indexOf(b[1].slot) || a[1].tier - b[1].tier).forEach(([key, wd]) => {
      const ownedN = P.profile.weapons.filter(w => w.key === key).length;
      const c = document.createElement('div'); c.className = 'card' + (ownedN ? ' owned' : '');
      c.innerHTML = `<div class="title">${wd.name}<span class="tier">${SLOT_NAME[wd.slot]} T${wd.tier}</span></div>
        <div class="meta">${KIND_NAME[wd.kind]} · ${TYPE_NAME[wd.type]}<br>${wd.range}m · ${weaponDmg(wd, wd.minLevel)}×${wd.clip}<br>DPS≈${weaponDps(wd, wd.minLevel)}${ownedN ? ` · 已拥有 ${ownedN}` : ''}</div>
        <div class="price ${wd.cost.au ? 'au' : 'ag'}">${P.costStr(wd.cost)}</div>
        <button class="primary small" ${P.canAfford(wd.cost) ? '' : 'disabled'}>购买</button>`;
      c.querySelector('button').addEventListener('click', () => { if (P.buyWeapon(key)) renderAll(); });
      el.appendChild(c);
    });
  } else {
    // inventory
    if (!P.profile.robots.length && !P.profile.weapons.length) el.innerHTML = '<div class="card"><div class="meta">仓库为空</div></div>';
    P.profile.robots.forEach(r => {
      const def = ROBOTS[r.key]; const slot = P.profile.hangar.indexOf(r.id);
      const c = document.createElement('div'); c.className = 'card owned';
      c.innerHTML = `<div class="title">${def.name}<span class="tier">Lv.${r.level}</span></div><div class="meta">${slot >= 0 ? `机库槽位 ${slot + 1}` : '未放入机库'}<br>${robotHp(def, r.level).toLocaleString()} HP</div><button class="ghost small">查看</button>`;
      c.querySelector('button').addEventListener('click', () => { selected = r.id; renderAll(); });
      el.appendChild(c);
    });
    P.profile.weapons.forEach(w => {
      const wd = WEAPONS[w.key]; const on = P.weaponMountedOn(w.id);
      const c = document.createElement('div'); c.className = 'card';
      c.innerHTML = `<div class="title">${wd.name}<span class="tier">Lv.${w.level}</span></div><div class="meta">${SLOT_NAME[wd.slot]} · ${on ? '装在 ' + ROBOTS[on.key].name : '闲置'}<br>${weaponDmg(wd, w.level)}×${wd.clip} · ${wd.range}m</div>
        <div class="row"><button class="ghost small">${w.level < weaponMaxLevel(wd) ? '升级 ' + P.fmt(weaponUpgradeCost(wd, w.level)) : 'MAX'}</button><button class="ghost small">出售</button></div>`;
      const [up, sell] = c.querySelectorAll('button');
      up.addEventListener('click', () => { if (!P.upgradeWeapon(w.id)) alert('银币不足或已满级'); renderAll(); });
      sell.addEventListener('click', () => { if (confirm(`出售 ${wd.name}？`)) { P.sellWeapon(w.id); renderAll(); } });
      el.appendChild(c);
    });
  }
}
