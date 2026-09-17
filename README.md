# War Robots Classic · 2018 网页版

一个**轻量、在线、纯网页**的 3D 复刻，目标是重现 2018 年前后 War Robots 的经典体验：
机库 → 进入战斗 → 6v6 信标争夺（Beacon Rush / Domination）→ 结算奖励 → 升级机甲与武器。

- **玩法与画风停留在 2018**：没有泰坦、无人机、驾驶员、母舰；机甲阵容是 Destrier / Cossack / Griffin / Leo / Rogatka / Fury / Lancelot / Carnage / Fujin / Raijin / Kumiho / Haechi / Bulgasari / Strider / Spectre / Inquisitor 等，技能是跳跃、冲刺、隐身、方阵、哨戒、堡垒。
- **数值参考 2026 版 wiki**（MK1 各等级耐久 / 伤害 / 速度 / 射程），全部集中在 `shared/data.js`，可自行修改。
- 保留经典机制：物理盾（Galahad/Lancelot/Rhino/Raijin/Bulgasari）、Ancile 能量盾（Carnage/Fujin/Haechi）、机枪加速、Punisher 精度衰减、火箭溅射、等离子穿物理盾、Zeus 无视掩体、Trebuchet 蓄能、Shocktrain 链式闪电、Aphid/Spiral 制导等。
- **真联机**：Node.js 权威服务器（WebSocket，20 Hz）负责所有判定；不足 12 人时由 AI 机器人补齐，机器人会占信标、找掩体、放技能。
- **无需构建工具、无 CDN 依赖**：Three.js 直接从 `node_modules` 提供，客户端是原生 ES Module。

## 运行

```bash
npm install
npm start          # 默认 http://localhost:8080 ，可用 PORT=3000 npm start 改端口
```

浏览器打开地址即可。局域网/公网多人联机只需让其他人访问同一个地址（服务器自动分房，每房最多 12 名真人）。

### 部署到公网

任何能跑 Node 18+ 的主机都行（Railway / Render / Fly.io / VPS）。HTTP 与 WebSocket 共用一个端口，页面会自动根据 `https` 使用 `wss`。

## 操作

| 按键 | 作用 |
|---|---|
| 鼠标 | 转动视角 / 炮塔（点击画面锁定鼠标） |
| WASD | 移动 |
| 左键 / F | 全部武器开火 |
| 1 / 2 / 3 | 只开火 轻 / 中 / 重 型武器 |
| 空格 | 机甲技能 |
| Tab / 右键 | 切换锁定目标 |
| M | 静音 |

自动锁定准星附近的敌人；隐身的敌人无法被锁定。

## 规则（信标争夺）

- 地图 5 个信标（A–E），站在信标 22 m 内 7 秒即可占领，有敌人同在则僵持。
- 双方各 1000 点控制条，**敌方每持有一个信标，你方每秒掉 1.3 点**。控制条归零、全员机甲耗尽或 10 分钟后信标数少的一方失败。
- 每局最多出动机库里的 5 台机甲；机甲被毁后 3 秒可选下一台。
- 奖励：基础 10k Ag + 伤害×0.15 + 每击杀 15k + 每信标 10k + 胜利 50k；金币胜 10 / 负 3，另加击杀数。

## 机库

- 起始：200 万 Ag、2500 Au、Destrier Lv3（双 Punisher）+ Cossack Lv3（Molot T），3 个槽位；第 4/5 槽分别需 100 万 Ag / 1500 Au。
- 商店购买机甲、武器；点击机甲的武器槽可装配 / 卸下 / 直接购买；升级消耗 Ag。
- 右键机库槽位可更换 / 清空槽位。存档在浏览器 localStorage，`重置存档` 可恢复初始状态。

## 目录结构

```
server/   index.js  HTTP 静态服务 + WebSocket 分房
          room.js   一局对战：状态机、机甲/武器/护盾/信标/伤害判定
          bots.js   AI 机器人（目标选择、A* 寻路、技能）
          nav.js    导航网格
shared/   data.js   机甲 / 武器数据（唯一数据源）
          map.js    地图（Dead City 风格，点对称）
          sim.js    移动模拟（服务器与客户端预测共用）
          geom.js   几何 / 碰撞 / 视线
client/   index.html, css/style.css
          js/main.js    入口：联网、预测、相机、锁定、渲染循环
          js/models.js  程序化低多边形机甲 / 武器模型
          js/world.js   地图渲染
          js/effects.js 弹道 / 爆炸 / 程序化音效
          js/hud.js     战斗 HUD / 小地图 / 结算
          js/hangar.js  机库 UI / 商店
          js/profile.js 本地存档
```

## 调整数值

所有平衡数据在 `shared/data.js`：`ROBOTS[key].hp / speed` 为从 `minLevel` 起的逐级数组，`WEAPONS[key].dmg` 同理；`MATCH` 里是对局规则。改完重启服务器即可，客户端会自动获得新数据。
