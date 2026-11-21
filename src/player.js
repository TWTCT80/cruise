// Rider + board simulation for milestone 1: rolling, pushing, foot-braking.
// State is plain numbers; the renderer reads it, never writes it.

import { config } from './config.js';
import { angle } from './terrain.js';

export function createPlayer() {
  return {
    x: 0,
    speed: 0,          // along the ground, never negative in M1
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
  };
}

// Input hooks -------------------------------------------------------------
export function pressLeft(p) {
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

// Simulation --------------------------------------------------------------
export function update(p, dt) {
  const c = config;
  const theta = angle(p.x);
  const prevSpeed = p.speed;

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
  if (p.speed < 0) p.speed = 0;               // M1: no rolling backwards
  if (p.speed > c.maxSpeed) p.speed = c.maxSpeed;

  const dx = p.speed * Math.cos(theta) * dt;
  p.x += dx;
  p.distance += p.speed * dt;
  p.wheelSpin += (p.speed * dt) / 7;          // wheel radius ≈ 7 units

  const rawAccel = (p.speed - prevSpeed) / Math.max(dt, 1e-4);
  p.accel += (rawAccel - p.accel) * Math.min(1, dt * 6);

  // Board eases to the ground angle (no snapping → softer feel).
  p.boardAngle += (theta - p.boardAngle) * Math.min(1, dt * c.boardTiltSmooth);
}
