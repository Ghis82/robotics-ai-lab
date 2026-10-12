// Quadrirotor 3D, corps rigide (6 DDL). Configuration « + » : rotor 1 (+x), 2 (+y), 3 (−x), 4 (−y) ; 1 et 3 tournent dans le même sens.
// Poussée T_i ∈ [0, Tmax] ; moments : τx = L(T2 − T4), τy = L(T3 − T1), τz = c(T1 − T2 + T3 − T4), c = k_m/k_f (fourni).
// Aucune aérodynamique hormis traînée quadratique optionnelle si Cd·A fourni. Intégration semi-implicite.
import { axisAngle, matMul, matVec, cross, sub, add, scale, norm, type Mat3, type Vec3 } from '../math';
export interface QuadParams { mass: number; L: number; c: number; Ixx: number; Iyy: number; Izz: number; Tmax: number; cdA?: number | null; rho?: number }
export interface QuadState { p: Vec3; v: Vec3; R: Mat3; w: Vec3 }
export const G = 9.81;
export function mix(q: QuadParams, T: number, tx: number, ty: number, tz: number): number[] {
  // inversion exacte du modèle des moments
  const a = T / 4, b = tx / (2 * q.L), c = ty / (2 * q.L), d = tz / (4 * q.c);
  return [a - c + d, a + b - d, a + c + d, a - b - d];
}
export function forcesMoments(q: QuadParams, Ti: number[]) { return { T: Ti.reduce((s, x) => s + x, 0), tau: [q.L * (Ti[1] - Ti[3]), q.L * (Ti[2] - Ti[0]), q.c * (Ti[0] - Ti[1] + Ti[2] - Ti[3])] as Vec3 }; }
export function stepQuad(q: QuadParams, s: QuadState, Ti: number[], dt: number): QuadState {
  const { T, tau } = forcesMoments(q, Ti); const zb: Vec3 = [s.R[2], s.R[5], s.R[8]];
  let F = add(scale(zb, T), [0, 0, -q.mass * G]);
  if (q.cdA) F = add(F, scale(s.v, -0.5 * (q.rho ?? 1.225) * q.cdA * norm(s.v)));
  const v = add(s.v, scale(F, dt / q.mass)); const p = add(s.p, scale(v, dt));
  const I: Vec3 = [q.Ixx, q.Iyy, q.Izz]; const Iw: Vec3 = [I[0] * s.w[0], I[1] * s.w[1], I[2] * s.w[2]]; const gyro = cross(s.w, Iw);
  const w: Vec3 = [0, 1, 2].map((k) => s.w[k] + ((tau[k] - gyro[k]) / I[k]) * dt) as Vec3;
  const ang = norm(w) * dt; const R = ang > 0 ? matMul(s.R, axisAngle(w, ang)) : s.R;
  return { p, v, R: orthonormalize(R), w };
}
function orthonormalize(R: Mat3): Mat3 { // Gram-Schmidt sur les colonnes
  const c0: Vec3 = [R[0], R[3], R[6]], c1: Vec3 = [R[1], R[4], R[7]]; const x = scale(c0, 1 / norm(c0)); const y0 = sub(c1, scale(x, x[0] * c1[0] + x[1] * c1[1] + x[2] * c1[2])); const y = scale(y0, 1 / norm(y0)); const z = cross(x, y);
  return [x[0], y[0], z[0], x[1], y[1], z[1], x[2], y[2], z[2]];
}
export interface Gains { kpPos: number; kdPos: number; kiPos: number; kpAtt: number; kdAtt: number; kpYaw: number; kdYaw: number }
export const DEFAULT_GAINS: Gains = { kpPos: 4, kdPos: 3.5, kiPos: 0.5, kpAtt: 60, kdAtt: 12, kpYaw: 4, kdYaw: 2 };
/** PID en cascade (position → poussée + inclinaison désirée → PD d'attitude → moments → mélangeur → saturation). */
export function simulateQuad(q: QuadParams, waypoints: { p: Vec3; t: number }[], T: number, dt = 0.002, gains: Gains = DEFAULT_GAINS) {
  let s: QuadState = { p: [0, 0, 0], v: [0, 0, 0], R: [1, 0, 0, 0, 1, 0, 0, 0, 1], w: [0, 0, 0] }; let integ: Vec3 = [0, 0, 0];
  const log = { t: [] as number[], x: [] as number[], y: [] as number[], z: [] as number[], tilt: [] as number[], Tmin: [] as number[], Tmax: [] as number[] }; let satSteps = 0, steps = 0;
  for (let k = 0; k * dt <= T + 1e-9; k++) {
    const t = k * dt; const wp = [...waypoints].reverse().find((w) => t >= w.t) ?? waypoints[0];
    const e = sub(wp.p, s.p); integ = add(integ, scale(e.map((x) => (Math.abs(x) < 0.5 ? x : 0)) as Vec3, dt)); // anti-emballement : intégration près de la cible seulement integ = integ.map((v) => Math.max(-2, Math.min(2, v))) as Vec3;
    const aDes = add(add(scale(e, gains.kpPos), scale(s.v, -gains.kdPos)), scale(integ, gains.kiPos));
    const fDes: Vec3 = [q.mass * aDes[0], q.mass * aDes[1], q.mass * (aDes[2] + G)];
    const zb: Vec3 = [s.R[2], s.R[5], s.R[8]]; const Tcmd = Math.max(0, fDes[0] * zb[0] + fDes[1] * zb[1] + fDes[2] * zb[2]);
    // orientation désirée : z_d ∥ fDes, lacet nul ; erreur d'attitude dans le repère corps (petites rotations)
    const zd = scale(fDes, 1 / Math.max(norm(fDes), 1e-9)); const errW = cross(zb, zd); const errB = matVec([s.R[0], s.R[3], s.R[6], s.R[1], s.R[4], s.R[7], s.R[2], s.R[5], s.R[8]], errW);
    const yawErr = -Math.atan2(s.R[3], s.R[0]);
    const tau: Vec3 = [q.Ixx * (gains.kpAtt * errB[0] - gains.kdAtt * s.w[0]), q.Iyy * (gains.kpAtt * errB[1] - gains.kdAtt * s.w[1]), q.Izz * (gains.kpYaw * yawErr - gains.kdYaw * s.w[2])];
    const raw = mix(q, Tcmd, tau[0], tau[1], tau[2]); const Ti = raw.map((x) => Math.min(q.Tmax, Math.max(0, x)));
    if (raw.some((x, i) => Math.abs(x - Ti[i]) > 1e-9)) satSteps++; steps++;
    if (k % 10 === 0) { log.t.push(t); log.x.push(s.p[0]); log.y.push(s.p[1]); log.z.push(s.p[2]); log.tilt.push(Math.acos(Math.min(1, s.R[8])) * 180 / Math.PI); log.Tmin.push(Math.min(...Ti)); log.Tmax.push(Math.max(...Ti)); }
    s = stepQuad(q, s, Ti, dt); if (s.p[2] < 0) { s.p[2] = 0; if (s.v[2] < 0) s.v = [s.v[0], s.v[1], 0]; } // sol simplifié
  }
  return { log, final: s, saturationRatio: satSteps / steps, satSteps };
}
