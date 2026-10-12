import { sub, add, scale, dot, norm, type Vec3 } from './math';
import type { RobotModel } from './model';
import type { FKResult } from './kinematics';
const clamp = (x: number, a: number, b: number) => Math.min(Math.max(x, a), b);
/** Distance minimale entre deux segments 3D (Ericson, Real-Time Collision Detection §5.1.9). */
export function segmentSegmentDistance(p1: Vec3, q1: Vec3, p2: Vec3, q2: Vec3): number {
  const d1 = sub(q1, p1), d2 = sub(q2, p2), r = sub(p1, p2);
  const a = dot(d1, d1), e = dot(d2, d2), f = dot(d2, r); const EPS = 1e-12;
  let s: number, t: number;
  if (a <= EPS && e <= EPS) return norm(r);
  if (a <= EPS) { s = 0; t = clamp(f / e, 0, 1); }
  else {
    const c = dot(d1, r);
    if (e <= EPS) { t = 0; s = clamp(-c / a, 0, 1); }
    else {
      const b = dot(d1, d2), den = a * e - b * b;
      s = den !== 0 ? clamp((b * f - c * e) / den, 0, 1) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = clamp(-c / a, 0, 1); } else if (t > 1) { t = 1; s = clamp((b - c) / a, 0, 1); }
    }
  }
  return norm(sub(add(p1, scale(d1, s)), add(p2, scale(d2, t))));
}
export function pointSegmentDistance(p: Vec3, a: Vec3, b: Vec3): number {
  const ab = sub(b, a); const L = dot(ab, ab); const t = L > 0 ? clamp(dot(sub(p, a), ab) / L, 0, 1) : 0;
  return norm(sub(p, add(a, scale(ab, t))));
}
export interface Contact { kind: 'auto' | 'sol' | 'obstacle'; a: number; b: number | string; clearance: number /* m, <0 = interpénétration */ }
/** Collisions par approximation capsules : auto-collision (segments non adjacents), sol (z=0), obstacles sphériques. */
export function detectCollisions(m: RobotModel, fk: FKResult, margin = 0): Contact[] {
  const out: Contact[] = []; const S = fk.segments;
  for (let i = 0; i < S.length; i++) for (let j = i + 2; j < S.length; j++) {
    if (m.links[i].length <= 0 || m.links[j].length <= 0) continue;
    const c = segmentSegmentDistance(S[i][0], S[i][1], S[j][0], S[j][1]) - m.links[i].radius - m.links[j].radius;
    if (c < margin) out.push({ kind: 'auto', a: i, b: j, clearance: c });
  }
  for (let i = 1; i < S.length; i++) { // le segment 0 est fixé au socle
    const c = Math.min(S[i][0][2], S[i][1][2]) - m.links[i].radius;
    if (c < margin) out.push({ kind: 'sol', a: i, b: 'sol', clearance: c });
  }
  m.obstacles.forEach((o) => S.forEach((s, i) => {
    const c = pointSegmentDistance(o.center, s[0], s[1]) - o.radius - m.links[i].radius;
    if (c < margin) out.push({ kind: 'obstacle', a: i, b: o.name, clearance: c });
  }));
  return out;
}
