// ---------------------------------------------------------------------------
// Game data: robots, weapons, economy.
// Numbers are taken from the current (2026) War Robots wiki tables
// (MK1 levels), while the roster / mechanics are the 2018 classic era.
// ---------------------------------------------------------------------------

export const SLOT = { L: 'light', M: 'medium', H: 'heavy' };

// Per-level upgrade cost (index 0 = upgrade to level 2). Silver.
const ROBOT_UPG_T2 = [20000, 40000, 80000, 400000, 800000, 1600000, 2000000, 3000000, 4000000, 5000000, 7000000];
const WEAPON_UPG_T1 = [10000, 20000, 40000, 200000, 400000, 800000, 1000000, 1500000, 2000000, 2500000, 3000000];

export function robotUpgradeCost(def, level) {
  // cost to go from `level` to `level+1`
  const mult = def.tier === 1 ? 0.5 : def.tier === 3 ? 1.5 : 1;
  return Math.round(ROBOT_UPG_T2[level - 1] * mult);
}
export function weaponUpgradeCost(def, level) {
  const mult = def.tier === 1 ? 1 : def.tier === 2 ? 1.5 : 2;
  return Math.round(WEAPON_UPG_T1[level - 1] * mult);
}

// ---------------------------------------------------------------------------
// Abilities
//   jump     : leap in movement direction
//   dash     : short burst (charges)
//   rush     : speed boost
//   phalanx  : rotate physical shield to front (Gareth/Galahad)
//   assault  : Rhino - drop shield, speed boost
//   stealth  : cannot be targeted
//   descend  : jump + stealth (Spectre / Inquisitor)
//   sentry   : Fujin - immobile, strong Ancile
//   bastion  : Raijin - immobile, front shields, damage bonus
// ---------------------------------------------------------------------------

const speeds = (a, b) => {
  const out = [];
  const n = 12;
  for (let i = 0; i < n; i++) out.push(Math.round(a + (b - a) * i / (n - 1)));
  return out;
};

export const ROBOTS = {
  destrier: {
    name: 'Destrier', cls: 'light', tier: 1, cost: { ag: 75000 }, minLevel: 1,
    hp: [44000, 47000, 50000, 53000, 56000, 60000, 64000, 68000, 72000, 77000, 82000, 87000],
    speed: [42, 43, 45, 47, 48, 50, 52, 53, 55, 56, 57, 58],
    slots: ['L', 'L'], ability: null, radius: 3.6, height: 8,
    desc: '起步机甲。速度快、火力弱，适合抢占信标。'
  },
  cossack: {
    name: 'Cossack', cls: 'light', tier: 1, cost: { ag: 75000 }, minLevel: 1,
    hp: [39000, 42000, 45000, 48000, 51000, 54000, 57000, 61000, 65000, 69000, 73000, 78000],
    speed: [44, 46, 48, 49, 51, 53, 55, 56, 58, 59, 60, 61],
    slots: ['M'], ability: { type: 'jump', cd: 5 }, radius: 3.4, height: 8,
    desc: '带跳跃引擎的侦察机甲，信标之王。'
  },
  gepard: {
    name: 'Gepard', cls: 'light', tier: 1, cost: { au: 750 }, minLevel: 1,
    hp: [48400, 52800, 57200, 61600, 66000, 71500, 77000, 83600, 90200, 97900, 105600, 114400],
    speed: speeds(58, 58),
    slots: ['L', 'L', 'L'], ability: null, radius: 3.6, height: 8,
    desc: '快速三轻槽机甲。'
  },
  patton: {
    name: 'Gl. Patton', cls: 'medium', tier: 1, cost: { ag: 190000 }, minLevel: 1,
    hp: [71000, 77000, 83000, 90000, 97000, 105000, 113000, 122000, 132000, 143000, 154000, 166000],
    speed: [30, 32, 33, 34, 35, 36, 38, 39, 40, 41, 42, 43],
    slots: ['L', 'L', 'L', 'L'], ability: null, radius: 4.2, height: 9.5,
    desc: '四轻槽火力平台。'
  },
  vityaz: {
    name: 'Vityaz', cls: 'medium', tier: 1, cost: { ag: 340000 }, minLevel: 1,
    hp: [93500, 99000, 105600, 112200, 119900, 127600, 135300, 144100, 152900, 162800, 172700, 183700],
    speed: [32, 33, 34, 36, 37, 38, 39, 41, 42, 43, 44, 45],
    slots: ['H', 'L', 'L'], ability: null, radius: 4.4, height: 10,
    desc: '皮厚的中型机甲，一重两轻。'
  },
  golem: {
    name: 'Golem', cls: 'medium', tier: 1, cost: { ag: 340000 }, minLevel: 1,
    hp: [73000, 79000, 85000, 92000, 99000, 107000, 116000, 125000, 135000, 146000, 158000, 171000],
    speed: [32, 33, 34, 36, 37, 38, 39, 41, 42, 43, 44, 45],
    slots: ['H', 'M', 'L'], ability: null, radius: 4.4, height: 10,
    desc: '一重一中一轻，全能中型机甲。'
  },
  boa: {
    name: 'Boa', cls: 'medium', tier: 1, cost: { ag: 480000 }, minLevel: 1,
    hp: [103000, 110000, 117000, 124000, 132000, 140000, 149000, 159000, 169000, 180000, 192000, 204000],
    speed: [32, 33, 34, 36, 37, 38, 39, 41, 42, 43, 44, 45],
    slots: ['H', 'L'], ability: null, radius: 4.4, height: 10,
    desc: '高血量中型机甲。'
  },
  rogatka: {
    name: 'Rogatka', cls: 'medium', tier: 1, cost: { au: 2500 }, minLevel: 1,
    hp: [76000, 81000, 86000, 92000, 98000, 104000, 111000, 118000, 125000, 133000, 141000, 150000],
    speed: [46, 47, 49, 51, 53, 55, 56, 58, 60, 61, 62, 63],
    slots: ['M', 'M'], ability: { type: 'jump', cd: 7 }, radius: 4, height: 9,
    desc: '会跳的中型机甲，两中槽。'
  },
  stalker: {
    name: 'Stalker', cls: 'light', tier: 1, cost: { au: 2500 }, minLevel: 1,
    hp: [46000, 49000, 52000, 55000, 59000, 63000, 67000, 71000, 75000, 80000, 85000, 90000],
    speed: speeds(66, 66),
    slots: ['L', 'L'], ability: { type: 'stealth', cd: 15, dur: 5 }, radius: 3.4, height: 7,
    desc: '隐身突袭轻型机甲。'
  },
  gareth: {
    name: 'Gareth', cls: 'light', tier: 1, cost: { ag: 200000 }, minLevel: 1,
    hp: [40000, 43000, 46000, 49000, 52000, 55000, 59000, 63000, 67000, 71000, 75000, 80000],
    speed: [49, 51, 52, 54, 56, 58, 60, 62, 64, 65, 66, 67],
    slots: ['M', 'L'], ability: { type: 'phalanx' }, pshield: { hp: 1.6, arc: 60, side: -90 },
    radius: 3.6, height: 8,
    desc: '带物理盾的骑士。方阵模式将盾转向正面。'
  },
  galahad: {
    name: 'Galahad', cls: 'medium', tier: 2, cost: { ag: 1100000 }, minLevel: 1,
    hp: [70800, 75400, 80200, 85300, 90800, 96600, 102700, 109300, 116300, 123700, 131600, 140000],
    speed: [38, 40, 41, 43, 44, 46, 47, 49, 50, 51, 52, 53],
    slots: ['H', 'L', 'L'], ability: { type: 'phalanx' }, pshield: { hp: 1.3, arc: 60, side: -90 },
    radius: 4.2, height: 9.5,
    desc: '中型骑士，一重两轻 + 物理盾。'
  },
  griffin: {
    name: 'Griffin', cls: 'heavy', tier: 2, cost: { ag: 1700000 }, minLevel: 6,
    hp: [116400, 123400, 130800, 138600, 146900, 155700, 165000],
    speed: [35, 36, 37, 38, 39, 40, 41],
    slots: ['M', 'M', 'L', 'L'], ability: { type: 'jump', cd: 22 }, radius: 4.8, height: 12,
    desc: '最受欢迎的重型机甲：两中两轻 + 跳跃。'
  },
  leo: {
    name: 'Leo', cls: 'heavy', tier: 2, cost: { ag: 2000000 }, minLevel: 6,
    hp: [168300, 179100, 190500, 202700, 215600, 229400, 244000],
    speed: [32, 33, 34, 35, 36, 37, 38],
    slots: ['H', 'L', 'L', 'L'], ability: null, radius: 5, height: 12,
    desc: '血牛重型机甲，一重三轻。'
  },
  natasha: {
    name: 'Natasha', cls: 'heavy', tier: 2, cost: { ag: 2000000 }, minLevel: 6,
    hp: [126000, 136500, 147000, 158600, 171200, 184800, 199500],
    speed: [35, 36, 37, 38, 39, 40, 41],
    slots: ['H', 'H', 'L', 'L'], ability: null, radius: 5, height: 12,
    desc: '两重两轻远程火力平台。'
  },
  fury: {
    name: 'Fury', cls: 'heavy', tier: 3, cost: { au: 5000 }, minLevel: 6,
    hp: [120000, 130000, 140000, 151000, 163000, 176000, 190000],
    speed: [35, 36, 37, 38, 39, 40, 41],
    slots: ['H', 'H', 'H'], ability: null, radius: 5, height: 13,
    desc: '三重槽狙击平台。'
  },
  lancelot: {
    name: 'Lancelot', cls: 'heavy', tier: 2, cost: { au: 5000 }, minLevel: 1,
    hp: [92000, 98000, 104000, 111000, 118000, 125000, 133000, 142000, 151000, 161000, 171000, 182000],
    speed: [27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38],
    slots: ['H', 'M', 'M'], ability: { type: 'rush', cd: 20, dur: 8, mult: 1.8 },
    pshield: { hp: 1.0, arc: 55, side: 0 }, radius: 5, height: 12,
    desc: '正面双物理盾 + 冲锋，坦克之王。'
  },
  carnage: {
    name: 'Carnage', cls: 'medium', tier: 2, cost: { au: 5000 }, minLevel: 1,
    hp: [62000, 66000, 70000, 74000, 79000, 84000, 89000, 95000, 101000, 107000, 114000, 121000],
    speed: [30, 32, 33, 34, 35, 36, 38, 39, 40, 41, 42, 43],
    slots: ['H', 'H'], ability: { type: 'rush', cd: 20, dur: 8, mult: 1.9 }, ancile: { hp: 0.45, regen: 0.02 },
    radius: 4.4, height: 10,
    desc: '两重槽 + 能量盾 + 冲锋。'
  },
  rhino: {
    name: 'Rhino', cls: 'heavy', tier: 2, cost: { au: 5000 }, minLevel: 1,
    hp: [95000, 101000, 107000, 114000, 121000, 129000, 137000, 146000, 155000, 165000, 176000, 187000],
    speed: [28, 29, 30, 31, 31, 32, 33, 34, 35, 36, 37, 38],
    slots: ['M', 'M', 'L', 'L'], ability: { type: 'assault', cd: 15, dur: 10, mult: 1.5 },
    pshield: { hp: 1.3, arc: 55, side: 0 }, radius: 5, height: 11,
    desc: '正面大盾；突击模式放下盾牌高速冲锋。'
  },
  fujin: {
    name: 'Fujin', cls: 'medium', tier: 2, cost: { au: 5000 }, minLevel: 1,
    hp: [68000, 72000, 77000, 82000, 87000, 93000, 99000, 105000, 112000, 119000, 127000, 135000],
    speed: [39, 40, 41, 41, 42, 42, 43, 43, 44, 45, 46, 47],
    slots: ['M', 'M', 'M'], ability: { type: 'sentry' }, ancile: { hp: 0.9, regen: 0.05, sentryOnly: true },
    radius: 4.2, height: 9,
    desc: '哨戒模式：固定不动，展开强力能量盾。'
  },
  raijin: {
    name: 'Raijin', cls: 'heavy', tier: 2, cost: { au: 5000 }, minLevel: 1,
    hp: [127000, 135000, 144000, 153000, 163000, 173000, 184000, 196000, 208000, 221000, 235000, 250000],
    speed: [31, 32, 33, 33, 34, 34, 35, 35, 36, 37, 38, 39],
    slots: ['H', 'H'], ability: { type: 'bastion', mult: 1.25 }, pshield: { hp: 1.0, arc: 70, side: 0, bastionOnly: true },
    radius: 5, height: 12,
    desc: '堡垒模式：站立不动，展开正面盾牌并提升伤害。'
  },
  kumiho: {
    name: 'Kumiho', cls: 'medium', tier: 2, cost: { au: 7500 }, minLevel: 1,
    hp: [83600, 89100, 94600, 101200, 107800, 114400, 122100, 129800, 137500, 146300, 155100, 165000],
    speed: [46, 47, 49, 51, 53, 55, 56, 58, 60, 61, 62, 63],
    slots: ['M', 'M'], ability: { type: 'dash', charges: 2, cd: 10 }, radius: 4, height: 9,
    desc: '两段冲刺的快速中型机甲。'
  },
  haechi: {
    name: 'Haechi', cls: 'medium', tier: 3, cost: { au: 7500 }, minLevel: 1,
    hp: [76800, 81800, 87100, 92800, 98800, 105200, 112100, 119400, 127100, 135400, 144200, 153600],
    speed: [35, 36, 37, 39, 40, 41, 42, 44, 45, 46, 47, 48],
    slots: ['M', 'M', 'M'], ability: { type: 'dash', charges: 2, cd: 10 }, ancile: { hp: 0.4, regen: 0.02 },
    radius: 4.4, height: 9.5,
    desc: '三中槽 + 能量盾 + 冲刺。'
  },
  bulgasari: {
    name: 'Bulgasari', cls: 'medium', tier: 3, cost: { au: 7500 }, minLevel: 1,
    hp: [108400, 115500, 123000, 131000, 139500, 148500, 158200, 168500, 179400, 191100, 203500, 216700],
    speed: [35, 37, 38, 39, 40, 42, 43, 45, 45, 46, 47, 48],
    slots: ['H', 'M', 'M'], ability: { type: 'dash', charges: 2, cd: 10 }, pshield: { hp: 0.7, arc: 60, side: -90 },
    radius: 4.8, height: 10.5,
    desc: '侧面物理盾 + 冲刺的重装中型机甲。'
  },
  strider: {
    name: 'Strider', cls: 'medium', tier: 3, cost: { au: 10000 }, minLevel: 1,
    hp: [68000, 72000, 77000, 82000, 87000, 93000, 99000, 105000, 112000, 119000, 127000, 135000],
    speed: [46, 47, 49, 51, 53, 55, 56, 58, 60, 61, 62, 63],
    slots: ['L', 'L', 'L', 'L'], ability: { type: 'dash', charges: 3, cd: 7 }, radius: 4, height: 9,
    desc: '三段冲刺，四轻槽。'
  },
  spectre: {
    name: 'Spectre', cls: 'medium', tier: 3, cost: { au: 10000 }, minLevel: 1,
    hp: [55000, 59000, 63000, 67000, 71000, 76000, 81000, 86000, 91000, 97000, 103000, 110000],
    speed: [39, 40, 42, 44, 45, 47, 49, 50, 52, 53, 54, 55],
    slots: ['M', 'M', 'M', 'M'], ability: { type: 'descend', cd: 20, dur: 6 }, radius: 4.2, height: 9,
    desc: '四中槽玻璃大炮：跳跃 + 隐身。'
  },
  inquisitor: {
    name: 'Inquisitor', cls: 'heavy', tier: 3, cost: { au: 10000 }, minLevel: 1,
    hp: [84000, 89000, 95000, 101000, 107000, 114000, 121000, 129000, 137000, 146000, 155000, 165000],
    speed: [33, 35, 36, 37, 38, 39, 41, 42, 43, 44, 45, 46],
    slots: ['H', 'M', 'M'], ability: { type: 'descend', cd: 20, dur: 6 }, radius: 4.8, height: 11,
    desc: '一重两中，跳跃 + 隐身。'
  },
};

// ---------------------------------------------------------------------------
// Weapons
//  kind:
//   mg       - hitscan machine gun, accuracy falloff, accelerates after 3s
//   cannon   - hitscan single heavy shot
//   shotgun  - hitscan pellets with damage falloff
//   plasma   - fast energy projectile (passes shields)
//   beam     - instant energy beam (passes shields)
//   lightning- instant lock-on energy (Zeus/Ion/Shocktrain)
//   rocket   - unguided explosive projectile with splash
//   homing   - lock-on missiles that arc over cover
//   artillery- Zenit: arcing rockets, no LOS needed
//   flame    - Ember: short cone, energy
//  dmg: per shot (per bullet / per rocket / per particle) at each level starting at minLevel
// ---------------------------------------------------------------------------
export const WEAPONS = {
  // ---------------- LIGHT ----------------
  punisher: { name: 'Punisher', slot: 'L', tier: 1, cost: { ag: 20000 }, type: 'kinetic', kind: 'mg', range: 500,
    clip: 220, interval: 0.09, reload: 10, minLevel: 1,
    dmg: [160, 180, 200, 220, 240, 260, 290, 320, 350, 390, 430, 470], falloff: 'punisher' },
  molot: { name: 'Molot', slot: 'L', tier: 1, cost: { ag: 20000 }, type: 'kinetic', kind: 'mg', range: 800,
    clip: 70, interval: 0.215, reload: 10, minLevel: 1,
    dmg: [279, 303, 327, 363, 400, 436, 484, 533, 581, 642, 702, 775], falloff: 'molot' },
  aphid: { name: 'Aphid', slot: 'L', tier: 1, cost: { au: 500 }, type: 'explosive', kind: 'homing', range: 350,
    clip: 8, interval: 0.08, reload: 10, minLevel: 5, aoe: 8, salvo: true,
    dmg: [1169, 1284, 1408, 1550, 1701, 1873, 2063, 2263] },
  spiral: { name: 'Spiral', slot: 'L', tier: 1, cost: { ag: 20000 }, type: 'explosive', kind: 'homing', range: 600,
    clip: 3, interval: 0.2, reload: 12, minLevel: 1, aoe: 6, salvo: true,
    dmg: [920, 1010, 1110, 1220, 1340, 1470, 1610, 1770, 1940, 2130, 2340, 2570] },
  gekko: { name: 'Gekko', slot: 'L', tier: 1, cost: { au: 500 }, type: 'energy', kind: 'beam', range: 1100,
    clip: 30, interval: 0.1, reload: 11, minLevel: 5, rwf: true,
    dmg: [157, 172, 189, 208, 229, 252, 277, 304] },
  pinata: { name: 'Pinata', slot: 'L', tier: 2, cost: { ag: 290000 }, type: 'explosive', kind: 'rocket', range: 300,
    clip: 17, interval: 0.088, reload: 15, minLevel: 5, aoe: 10, rwf: true,
    dmg: [759, 836, 913, 1001, 1111, 1221, 1342, 1468] },
  pin: { name: 'Pin', slot: 'L', tier: 1, cost: { ag: 290000 }, type: 'explosive', kind: 'rocket', range: 500,
    clip: 4, interval: 0.5, reload: 12, minLevel: 5, aoe: 19, rwf: true,
    dmg: [1420, 1560, 1710, 1880, 2070, 2280, 2510, 2760] },
  magnum: { name: 'Magnum', slot: 'L', tier: 2, cost: { au: 1500 }, type: 'energy', kind: 'plasma', range: 350,
    clip: 1, interval: 0.55, reload: 0, minLevel: 1,
    dmg: [957, 1045, 1155, 1276, 1408, 1540, 1683, 1859, 2046, 2244, 2464, 2706] },
  gust: { name: 'Gust', slot: 'L', tier: 2, cost: { au: 1000 }, type: 'kinetic', kind: 'shotgun', range: 500,
    clip: 5, interval: 0.3, reload: 9, minLevel: 1, pellets: 4, rwf: true,
    dmg: [2132, 2352, 2572, 2836, 3124, 3432, 3784, 4136, 4576, 5036, 5520, 6072] },
  arbalest: { name: 'Arbalest', slot: 'L', tier: 2, cost: { au: 1500 }, type: 'energy', kind: 'beam', range: 1100,
    clip: 1, interval: 1, reload: 6, minLevel: 1,
    dmg: [3650, 4010, 4420, 4860, 5340, 5880, 6470, 7110, 7820, 8610, 9470, 10410] },
  sting: { name: 'Sting', slot: 'L', tier: 2, cost: { au: 2000 }, type: 'kinetic', kind: 'shotgun', range: 600,
    clip: 1, interval: 1, reload: 3, minLevel: 1, pellets: 6, noFalloff: true,
    dmg: [3510, 3852, 4230, 4650, 5106, 5616, 6180, 6786, 7458, 8190, 9006, 9912] },

  // ---------------- MEDIUM ----------------
  punisher_t: { name: 'Punisher T', slot: 'M', tier: 1, cost: { ag: 30000 }, type: 'kinetic', kind: 'mg', range: 500,
    clip: 220, interval: 0.09, reload: 10, minLevel: 1,
    dmg: [260, 290, 320, 350, 390, 430, 470, 520, 570, 630, 690, 760], falloff: 'punisher' },
  molot_t: { name: 'Molot T', slot: 'M', tier: 1, cost: { ag: 30000 }, type: 'kinetic', kind: 'mg', range: 800,
    clip: 70, interval: 0.215, reload: 10, minLevel: 1,
    dmg: [420, 460, 510, 550, 600, 660, 720, 800, 880, 970, 1070, 1175], falloff: 'molot' },
  orkan: { name: 'Orkan', slot: 'M', tier: 2, cost: { au: 2500 }, type: 'explosive', kind: 'rocket', range: 300,
    clip: 25, interval: 0.12, reload: 20, minLevel: 5, aoe: 10, rwf: true,
    dmg: [946, 1045, 1144, 1265, 1386, 1529, 1672, 1837] },
  tulumbas: { name: 'Tulumbas', slot: 'M', tier: 2, cost: { ag: 400000 }, type: 'explosive', kind: 'rocket', range: 500,
    clip: 8, interval: 0.23, reload: 18, minLevel: 5, aoe: 19, rwf: true,
    dmg: [1485, 1628, 1793, 1969, 2167, 2387, 2618, 2871] },
  taran: { name: 'Taran', slot: 'M', tier: 2, cost: { au: 3000 }, type: 'energy', kind: 'plasma', range: 350,
    clip: 32, interval: 0.28, reload: 5.7, minLevel: 1,
    dmg: [924, 1017, 1111, 1210, 1353, 1474, 1628, 1782, 1958, 2145, 2365, 2596] },
  hydra: { name: 'Hydra', slot: 'M', tier: 2, cost: { au: 1500 }, type: 'explosive', kind: 'homing', range: 600,
    clip: 6, interval: 1.1, reload: 12, minLevel: 1, aoe: 5,
    dmg: [1081, 1190, 1308, 1439, 1583, 1742, 1916, 2107, 2318, 2550, 2805, 3085] },
  storm: { name: 'Storm', slot: 'M', tier: 2, cost: { au: 2500 }, type: 'kinetic', kind: 'shotgun', range: 500,
    clip: 5, interval: 0.5, reload: 10, minLevel: 1, pellets: 6, rwf: true,
    dmg: [3264, 3594, 3960, 4356, 4782, 5244, 5772, 6366, 6996, 7686, 8478, 9306] },
  ion: { name: 'Ion', slot: 'M', tier: 2, cost: { au: 2500 }, type: 'energy', kind: 'lightning', range: 600,
    clip: 1, interval: 1, reload: 5, minLevel: 1,
    dmg: [7590, 8340, 9180, 10100, 11110, 12220, 13440, 14780, 16260, 17890, 19680, 21640] },
  ballista: { name: 'Ballista', slot: 'M', tier: 2, cost: { au: 2000 }, type: 'energy', kind: 'beam', range: 1100,
    clip: 1, interval: 1, reload: 6, minLevel: 1,
    dmg: [4310, 4790, 5420, 5910, 6540, 7020, 7820, 8610, 9420, 10380, 11330, 12460] },
  scourge: { name: 'Scourge', slot: 'M', tier: 3, cost: { au: 5000 }, type: 'energy', kind: 'beam', range: 600,
    clip: 85, interval: 0.09, reload: 5, minLevel: 1, closeBonus: true,
    dmg: [179, 197, 216, 237, 261, 286, 313, 344, 378, 416, 457, 502] },
  shocktrain: { name: 'Shocktrain', slot: 'M', tier: 3, cost: { au: 5000 }, type: 'energy', kind: 'lightning', range: 500,
    clip: 1, interval: 1, reload: 7, minLevel: 1, chain: 0.6,
    dmg: [7965, 8760, 9635, 10600, 11660, 12825, 14105, 15515, 17070, 18775, 20655, 22720] },
  vortex: { name: 'Vortex', slot: 'M', tier: 3, cost: { au: 5000 }, type: 'explosive', kind: 'homing', range: 350,
    clip: 6, interval: 0.1, reload: 9, minLevel: 1, aoe: 14, salvo: true,
    dmg: [2658, 2933, 3208, 3530, 3873, 4263, 4675, 5143, 5657, 6222, 6845, 7529] },

  // ---------------- HEAVY ----------------
  nashorn: { name: 'Nashorn', slot: 'H', tier: 1, cost: { ag: 100000 }, type: 'kinetic', kind: 'cannon', range: 1100,
    clip: 1, interval: 1, reload: 9, minLevel: 3,
    dmg: [4950, 5430, 5970, 6560, 7200, 7910, 8690, 9560, 10500, 11560] },
  thunder: { name: 'Thunder', slot: 'H', tier: 1, cost: { ag: 580000 }, type: 'kinetic', kind: 'shotgun', range: 500,
    clip: 5, interval: 1.0, reload: 10, minLevel: 5, pellets: 16, rwf: true,
    dmg: [8640, 9520, 10480, 11520, 12640, 13920, 15360, 16880] },
  kang_dae: { name: 'Kang Dae', slot: 'H', tier: 1, cost: { ag: 580000 }, type: 'kinetic', kind: 'cannon', range: 800,
    clip: 1, interval: 1, reload: 6, minLevel: 5,
    dmg: [5070, 5570, 6120, 6720, 7390, 8120, 8920, 9800] },
  zenit: { name: 'Zenit', slot: 'H', tier: 1, cost: { ag: 580000 }, type: 'explosive', kind: 'artillery', range: 1100,
    clip: 18, interval: 0.85, reload: 15, minLevel: 5, aoe: 20,
    dmg: [1344, 1476, 1622, 1783, 1959, 2153, 2366, 2600] },
  trident: { name: 'Trident', slot: 'H', tier: 1, cost: { au: 1000 }, type: 'explosive', kind: 'rocket', range: 600,
    clip: 3, interval: 1.0, reload: 9, minLevel: 1, aoe: 12, rwf: true,
    dmg: [2933, 3220, 3542, 3887, 4267, 4692, 5152, 5658, 6222, 6842, 7521, 8280] },
  zeus: { name: 'Zeus', slot: 'H', tier: 2, cost: { au: 3000 }, type: 'energy', kind: 'lightning', range: 600,
    clip: 1, interval: 1, reload: 5, minLevel: 5,
    dmg: [12320, 13540, 14870, 16350, 17970, 19740, 21700, 23840] },
  trebuchet: { name: 'Trebuchet', slot: 'H', tier: 2, cost: { au: 3000 }, type: 'energy', kind: 'beam', range: 1100,
    clip: 1, interval: 1, reload: 21, minLevel: 1,
    dmg: [8766, 9522, 10530, 11520, 12528, 13770, 15012, 16524, 18288, 20034, 22050, 24300] },
  exodus: { name: 'Exodus', slot: 'H', tier: 2, cost: { au: 4000 }, type: 'explosive', kind: 'rocket', range: 300,
    clip: 23, interval: 0.2, reload: 23, minLevel: 1, aoe: 10, rwf: true,
    dmg: [1837, 2013, 2211, 2431, 2662, 2937, 3223, 3531, 3883, 4268, 4697, 5159] },
  avenger: { name: 'Avenger', slot: 'H', tier: 2, cost: { au: 5000 }, type: 'kinetic', kind: 'mg', range: 500,
    clip: 220, interval: 0.09, reload: 10, minLevel: 1,
    dmg: [484, 528, 572, 638, 682, 770, 824, 924, 1000, 1110, 1232, 1320], falloff: 'punisher' },
  tempest: { name: 'Tempest', slot: 'H', tier: 3, cost: { au: 3000 }, type: 'kinetic', kind: 'mg', range: 800,
    clip: 70, interval: 0.215, reload: 10, minLevel: 1,
    dmg: [850, 937, 1025, 1125, 1237, 1362, 1500, 1662, 1825, 2012, 2212, 2425], falloff: 'molot' },
  ember: { name: 'Ember', slot: 'H', tier: 3, cost: { au: 5000 }, type: 'energy', kind: 'flame', range: 350,
    clip: 230, interval: 0.07, reload: 5, minLevel: 1,
    dmg: [326, 358, 394, 434, 477, 525, 577, 635, 699, 768, 845, 930] },
  redeemer: { name: 'Redeemer', slot: 'H', tier: 3, cost: { au: 5000 }, type: 'energy', kind: 'plasma', range: 350,
    clip: 35, interval: 0.22, reload: 5.7, minLevel: 1,
    dmg: [1425, 1568, 1725, 1897, 2087, 2296, 2525, 2778, 3055, 3361, 3697, 4067] },
  dragoon: { name: 'Dragoon', slot: 'H', tier: 3, cost: { au: 5000 }, type: 'energy', kind: 'plasma', range: 600,
    clip: 4, interval: 1.0, reload: 10, minLevel: 1, rwf: true, slow: true,
    dmg: [3826, 4208, 4629, 5092, 5601, 6161, 6777, 7455, 8200, 9021, 9923, 10915] },
};

export const SLOT_NAME = { L: '轻型', M: '中型', H: '重型' };
export const SLOT_NAME_EN = { L: 'LIGHT', M: 'MEDIUM', H: 'HEAVY' };

export function robotHp(def, level) { return def.hp[level - def.minLevel]; }
export function robotSpeed(def, level) { return def.speed[level - def.minLevel]; }
export function weaponDmg(def, level) { return def.dmg[Math.min(def.dmg.length - 1, Math.max(0, level - def.minLevel))]; }
export function maxLevel(def) { return def.minLevel + def.hp?.length - 1 || def.minLevel + def.dmg.length - 1; }
export function robotMaxLevel(def) { return def.minLevel + def.hp.length - 1; }
export function weaponMaxLevel(def) { return def.minLevel + def.dmg.length - 1; }

// approximate per-cycle DPS for UI
export function weaponDps(def, level) {
  const d = weaponDmg(def, level);
  const pellets = def.pellets || 1;
  const perShot = d * (def.kind === 'shotgun' ? 1 : pellets);
  const unload = def.clip * def.interval;
  const cycle = unload + def.reload;
  return Math.round(perShot * def.clip / Math.max(cycle, 0.55));
}

// ---------------------------------------------------------------------------
// Economy
// ---------------------------------------------------------------------------
export const START_PROFILE = () => ({
  name: 'Pilot' + Math.floor(Math.random() * 9000 + 1000),
  ag: 2000000, au: 2500,
  slotsUnlocked: 3,
  // inventory of robots / weapons (each item has an id)
  robots: [
    { id: 'r1', key: 'destrier', level: 3, weapons: ['w1', 'w2'] },
    { id: 'r2', key: 'cossack', level: 3, weapons: ['w3'] },
  ],
  weapons: [
    { id: 'w1', key: 'punisher', level: 3 },
    { id: 'w2', key: 'punisher', level: 3 },
    { id: 'w3', key: 'molot_t', level: 3 },
  ],
  hangar: ['r1', 'r2', null, null, null],
  stats: { battles: 0, wins: 0, kills: 0, damage: 0 },
  nextId: 10,
});

export const SLOT_UNLOCK_COST = [null, null, null, { ag: 1000000 }, { au: 1500 }];

export const MATCH = {
  duration: 600,      // seconds
  beaconRadius: 22,
  captureTime: 7,     // seconds for one robot to fully capture
  teamBar: 1000,
  drainPerBeacon: 1.3, // points per second per enemy beacon
  maxPlayers: 6,
  respawnDelay: 3,
};

export function rewardFor(stats, win) {
  const ag = Math.round(10000 + stats.damage * 0.15 + stats.kills * 15000 + stats.beacons * 10000 + (win ? 50000 : 0));
  const au = (win ? 10 : 3) + Math.min(10, stats.kills);
  return { ag, au };
}
