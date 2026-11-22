// Secondary motion: damped springs (body follow-through) and verlet ropes
// (drawstrings). Simulated in the rider's local frame; the caller supplies
// the external forces (gravity rotated into the frame, head-wind, inertia).

export function spring(value = 0) {
  return { v: value, vel: 0 };
}

// Critically-ish damped spring step. k = stiffness, d = damping.
export function stepSpring(s, target, dt, k = 160, d = 16) {
  const a = (target - s.v) * k - s.vel * d;
  s.vel += a * dt;
  s.v += s.vel * dt;
  return s.v;
}

export function spring2(x = 0, y = 0) {
  return { x, y, vx: 0, vy: 0 };
}

export function stepSpring2(s, tx, ty, fx, fy, dt, k = 120, d = 9) {
  s.vx += ((tx - s.x) * k - s.vx * d + fx) * dt;
  s.vy += ((ty - s.y) * k - s.vy * d + fy) * dt;
  s.x += s.vx * dt;
  s.y += s.vy * dt;
}

export function rope(n, segLen, x, y) {
  const pts = [];
  for (let i = 0; i < n; i++) pts.push({ x, y: y + i * segLen, px: x, py: y + i * segLen });
  return { pts, segLen };
}

// Verlet integrate with anchor pinned at (ax, ay).
export function stepRope(r, ax, ay, fx, fy, dt, damping = 0.94, iterations = 4) {
  const { pts, segLen } = r;
  pts[0].x = pts[0].px = ax;
  pts[0].y = pts[0].py = ay;
  const dt2 = dt * dt;
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i];
    const vx = (p.x - p.px) * damping, vy = (p.y - p.py) * damping;
    p.px = p.x; p.py = p.y;
    p.x += vx + fx * dt2;
    p.y += vy + fy * dt2;
  }
  for (let k = 0; k < iterations; k++) {
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      const dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.hypot(dx, dy) || 1e-6;
      const diff = (d - segLen) / d;
      if (i === 1) { b.x -= dx * diff; b.y -= dy * diff; }
      else {
        a.x += dx * diff * 0.5; a.y += dy * diff * 0.5;
        b.x -= dx * diff * 0.5; b.y -= dy * diff * 0.5;
      }
    }
    pts[0].x = ax; pts[0].y = ay;
  }
}
