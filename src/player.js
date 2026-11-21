// Rider + board simulation: rolling, pushing, foot-braking (M1) and the
// ollie (M2): crouch → pop → air (with a soft hang at the apex) → landing.
// State is plain numbers; the renderer reads it, never writes it.

import { config } from './config.js';
import { angle, height } from './terrain.js';

export function createPlayer() {
  return {
    x: 0,
    speed: 0,          // along the ground, never negative
    accel: 0,          // smoothed longitudinal acceleration (for body lean)
    boardAngle: 0,     // visual, eased towards ground angle
    wheelSpin: 0,      // radians, for wheel rendering
    distance: 0,

    pushing: false,
    pushT: 0,          // 0..1 progress of current kick
    pushApplied: false,
    queuedPush: false,

    holdingLeft: false,
    holdTime: 0,
    braking: false,
    brakeAmount: 0,    // 0..1 eased, for animation + sound

    // --- ollie ---
    crouching: false,  // right thumb is down, winding up
    crouchAmt: 0,      // 0..1 eased
    airborne: false,
    airY: 0,           // world height of the board while airborne (y up)
    vy: 0,
    vx: 0,
    airT: 0,           // seconds since pop
    airDur: 0.9,       // estimated total airtime (for animation phases)
    popQuality: null,  // 'Perfect' | 'Clean' | 'Sloppy'
    slowmo: 1,         // time scale suggested by the sim (air slow-motion option)
  };
}

// Input hooks -------------------------------------------------------------
export function pressLeft(p) {
  if (p.airborne || p.crouching) return;       // no pushing mid-air or while winding up
  p.holdingLeft = true;
  p.holdTime = 0;
  if (p.pushing) p.queuedPush = true;
  else startPush(p);
}

export function releaseLeft(p) {
  p.holdingLeft = false;
  p.braking = false;
}

function startPush(p) {
  p.pushing = true;
  p.pushT = 0;
  p.pushApplied = false;
  p.footBack = false;
  p.queuedPush = false;
  p.onPush?.();
}

// Right thumb down: crouch (only on the ground).
export function pressRight(p) {
  if (p.airborne) return false;
  p.crouching = true;
  p.pushing = false; p.queuedPush = false;    // both feet on the board now
  p.holdingLeft = false; p.braking = false;
  return true;
}

// Right thumb lifted without snapping upward: just stand up again.
export function releaseRight(p) {
  p.crouching = false;
}

// Grade the upward snap: fast and straight = Perfect.
export function gradeSnap(speed, angleDeg) {
  const c = config;
  if (speed >= c.perfectSnap && angleDeg <= c.perfectAngle) return 'Perfect';
  if (speed >= c.cleanSnap && angleDeg <= c.cleanAngle) return 'Clean';
  return 'Sloppy';
}

// Snap upward = pop. speed in CSS px/s, angleDeg = deviation from straight up.
export function pop(p, speed, angleDeg) {
  if (p.airborne) return;
  const c = config;
  const q = gradeSnap(speed, angleDeg);
  const k = Math.max(0, Math.min(1, (speed - c.minSnap) / (c.perfectSnap * 1.3 - c.minSnap)));
  const power = 0.75 + 0.35 * k;
  const theta = angle(p.x);
  p.airborne = true;
  p.crouching = false;
  p.pushing = false; p.braking = false; p.brakeAmount = 0;
  p.airY = height(p.x);
  p.vx = p.speed * Math.cos(theta);
  p.vy = c.popVel * power + p.speed * Math.sin(theta);
  p.airT = 0;
  // rough airtime estimate (ignores the hang) — only used for pose phases
  p.airDur = Math.max(0.35, (2 * Math.max(60, p.vy)) / c.airGravity) * 1.08;
  p.popQuality = q;
  p.onPop?.(q, speed, angleDeg);
}

// Simulation --------------------------------------------------------------
export function update(p, dt) {
  const c = config;
  if (p.airborne) return updateAir(p, dt);

  const theta = angle(p.x);
  const prevSpeed = p.speed;

  p.crouchAmt += ((p.crouching ? 1 : 0) - p.crouchAmt) * Math.min(1, dt * 12);

  // Kick: speed is added at the moment the foot hits the ground (~35% in).
  if (p.pushing) {
    p.pushT += dt / c.pushDuration;
    if (!p.pushApplied && p.pushT >= 0.35) {
      p.pushApplied = true;
      const falloff = Math.max(0, 1 - p.speed / c.pushFalloff);
      p.speed += c.pushPower * (0.25 + 0.75 * falloff);
      p.onKickContact?.();
    }
    if (!p.footBack && p.pushT >= 0.93) { p.footBack = true; p.onFootBack?.(); }
    if (p.pushT >= 1) {
      p.pushing = false;
      // A queued tap becomes another kick; a queued press that is still
      // being held is a brake request, so don't kick first.
      const heldLong = p.holdingLeft && p.holdTime > c.brakeDelay;
      if (p.queuedPush && !heldLong) startPush(p);
      p.queuedPush = false;
    }
  }

  // Holding after the kick has finished → drag the foot to brake.
  if (p.holdingLeft) {
    p.holdTime += dt;
    if (!p.pushing && p.holdTime > c.brakeDelay) p.braking = true;
  }
  p.brakeAmount += ((p.braking ? 1 : 0) - p.brakeAmount) * Math.min(1, dt * 10);

  // Forces along the ground.
  let a = -c.gravity * Math.sin(theta);
  if (p.speed > 0) {
    a -= c.rollResist + c.airDrag * p.speed * p.speed;
    a -= c.brakeDecel * p.brakeAmount;
  }
  p.speed += a * dt;
  if (p.speed < 0) p.speed = 0;
  if (p.speed > c.maxSpeed) p.speed = c.maxSpeed;

  p.x += p.speed * Math.cos(theta) * dt;
  p.distance += p.speed * dt;
  p.wheelSpin += (p.speed * dt) / 7;          // wheel radius ≈ 7 units

  const rawAccel = (p.speed - prevSpeed) / Math.max(dt, 1e-4);
  p.accel += (rawAccel - p.accel) * Math.min(1, dt * 6);

  // Board eases to the ground angle (no snapping → softer feel).
  p.boardAngle += (theta - p.boardAngle) * Math.min(1, dt * c.boardTiltSmooth);
}

function updateAir(p, dt) {
  const c = config;
  p.airT += dt;
  // Soft hang: gravity eases off while the rider turns over at the apex.
  const hang = Math.abs(p.vy) < c.hangWindow ? c.hangGravity : 1;
  p.vy -= c.airGravity * hang * dt;
  p.airY += p.vy * dt;
  p.x += p.vx * dt;
  p.distance += p.vx * dt;
  p.wheelSpin += (p.vx * dt) / 7 * 0.4;       // wheels keep spinning, slowing
  p.accel *= 1 - Math.min(1, dt * 4);
  p.crouchAmt += (0 - p.crouchAmt) * Math.min(1, dt * 12);

  // board drifts towards the slope it will land on
  const groundTheta = angle(p.x);
  p.boardAngle += (groundTheta - p.boardAngle) * Math.min(1, dt * 4);

  // optional slow motion in the air (bell curve over the jump)
  const u = Math.min(1, p.airT / p.airDur);
  p.slowmo = 1 - c.airSlowmo * Math.sin(Math.PI * u);

  const ground = height(p.x);
  if (p.airY <= ground && p.vy < 0) {
    const impact = -p.vy;
    p.airborne = false;
    p.airY = ground;
    p.slowmo = 1;
    // keep the horizontal speed along the new slope; sloppy landings scrub a bit
    const theta = angle(p.x);
    p.speed = Math.max(0, p.vx / Math.max(0.5, Math.cos(theta)));
    if (p.popQuality === 'Sloppy') p.speed *= 0.93;
    p.boardAngle = groundTheta;
    p.onLand?.(p.popQuality, impact);
  }
}
