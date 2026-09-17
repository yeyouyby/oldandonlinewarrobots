// Shared robot motion simulation used by both server (authoritative) and client (prediction).
import { resolveCircle, angleDiff, clamp } from './geom.js';
import { MAP } from './map.js';

export const GRAVITY = 32;
export const JUMP_VY = 19;          // m/s
export const JUMP_BOOST = 1.9;      // horizontal speed multiplier during jump
export const DASH_SPEED = 62;       // m/s
export const DASH_TIME = 0.45;      // s
export const TURN_RATE = 4.2;       // rad/s legs
export const KMH = 1 / 3.6;

export function moveSpeedMps(r) {
  let sp = r.baseSpeed * KMH;
  if (r.rushT > 0) sp *= r.rushMult || 1.6;
  if (r.modeSentry || r.modeBastion) sp = 0;
  return sp;
}

// r: robot state, inp: { mx, mz } world-space move vector (len<=1)
export function stepMotion(r, inp, dt, bounds) {
  let mx = inp.mx || 0, mz = inp.mz || 0;
  const len = Math.hypot(mx, mz);
  if (len > 1) { mx /= len; mz /= len; }
  const moving = len > 0.05 && !(r.modeSentry || r.modeBastion);
  r.moving = moving;

  if (r.dashT > 0) {
    r.dashT -= dt;
    r.x += r.dashDx * DASH_SPEED * dt;
    r.z += r.dashDz * DASH_SPEED * dt;
    r.animSpeed = DASH_SPEED;
  } else if (moving) {
    const sp = moveSpeedMps(r);
    const boost = r.y > 0.01 && r.jumpT > 0 ? JUMP_BOOST : 1;
    const want = Math.atan2(mx, mz);
    const d = angleDiff(want, r.yaw);
    const maxTurn = TURN_RATE * dt;
    r.yaw += clamp(d, -maxTurn, maxTurn);
    r.x += mx * sp * boost * dt;
    r.z += mz * sp * boost * dt;
    r.animSpeed = sp * boost;
  } else {
    if (r.jumpT > 0 && r.y > 0.01) {
      const sp = moveSpeedMps(r) * JUMP_BOOST;
      r.x += Math.sin(r.yaw) * sp * dt * 0.6;
      r.z += Math.cos(r.yaw) * sp * dt * 0.6;
    }
    r.animSpeed = 0;
  }

  // vertical
  if (r.y > 0 || r.vy !== 0) {
    r.vy -= GRAVITY * dt;
    r.y += r.vy * dt;
    if (r.y <= 0) { r.y = 0; r.vy = 0; r.jumpT = 0; }
  }
  if (r.jumpT > 0) r.jumpT -= dt;

  // collisions
  const [nx, nz] = resolveCircle(r.x, r.z, r.radius, bounds);
  r.x = clamp(nx, -MAP.halfW + r.radius, MAP.halfW - r.radius);
  r.z = clamp(nz, -MAP.halfD + r.radius, MAP.halfD - r.radius);
}

export function startJump(r, dirX, dirZ) {
  r.vy = JUMP_VY;
  r.y = Math.max(r.y, 0.01);
  r.jumpT = 1.3;
  const l = Math.hypot(dirX, dirZ);
  if (l > 0.05) r.yaw = Math.atan2(dirX / l, dirZ / l);
}

export function startDash(r, dirX, dirZ) {
  const l = Math.hypot(dirX, dirZ);
  if (l < 0.05) { dirX = Math.sin(r.yaw); dirZ = Math.cos(r.yaw); }
  else { dirX /= l; dirZ /= l; }
  r.dashT = DASH_TIME;
  r.dashDx = dirX; r.dashDz = dirZ;
  r.yaw = Math.atan2(dirX, dirZ);
}
