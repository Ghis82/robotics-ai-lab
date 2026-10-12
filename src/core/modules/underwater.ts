// Engin sous-marin (ROV/AUV) — dynamique PLANE dans le plan vertical (cavalement x, pilonnement z, tangage θ), corps rigide.
// Hypothèses : masses ajoutées et couplages hydrodynamiques ignorés ; traînée quadratique par axe du repère corps (Cd·A fournis) ;
// flottabilité au centre de carène B situé à BG au-dessus du CdM (repère corps) ; fluide au repos.
export interface Thruster { x: number; z: number; angle: number /* rad, direction de poussée dans le repère corps (0 = +x) */; tmax: number }
export interface UWParams { mass: number; volume: number; rho: number; BG: number; Iyy: number; cdAx: number; cdAz: number; kq: number /* N·m·s² traînée en tangage */; thrusters: Thruster[] }
export interface UWState { x: number; z: number; th: number; u: number; w: number; q: number /* vitesses dans le repère corps */ }
const G = 9.81;
/** Matrice d'allocation B (3 × n) : [Fx, Fz, M] = B · t. Moment autour de y : M = z·Fx − x·Fz. */
export function allocationMatrix(th: Thruster[]): number[][] {
  return [th.map((t) => Math.cos(t.angle)), th.map((t) => Math.sin(t.angle)), th.map((t) => t.z * Math.cos(t.angle) - t.x * Math.sin(t.angle))];
}
/** Allocation par pseudo-inverse (moindres normes) puis saturation ±tmax. */
export function allocate(th: Thruster[], tau: [number, number, number]) {
  const B = allocationMatrix(th); const n = th.length;
  const BBt = [0, 1, 2].map((i) => [0, 1, 2].map((j) => B[i].reduce((s, v, k) => s + v * B[j][k], 0) + (i === j ? 1e-9 : 0)));
  const inv = inv3(BBt); const y = [0, 1, 2].map((i) => inv[i][0] * tau[0] + inv[i][1] * tau[1] + inv[i][2] * tau[2]);
  const raw = Array.from({ length: n }, (_, k) => B[0][k] * y[0] + B[1][k] * y[1] + B[2][k] * y[2]);
  const t = raw.map((v, k) => Math.max(-th[k].tmax, Math.min(th[k].tmax, v))); const saturated = raw.some((v, k) => Math.abs(v - t[k]) > 1e-9);
  const achieved = [0, 1, 2].map((i) => B[i].reduce((s, v, k) => s + v * t[k], 0)) as [number, number, number];
  return { t, raw, saturated, achieved };
}
function inv3(m: number[][]) { const [a, b, c] = m[0], [d, e, f] = m[1], [g, h, i] = m[2]; const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g; const det = a * A + b * B + c * C;
  return [[A / det, -(b * i - c * h) / det, (b * f - c * e) / det], [B / det, (a * i - c * g) / det, -(a * f - c * d) / det], [C / det, -(a * h - b * g) / det, (a * e - b * d) / det]]; }
export const netBuoyancyN = (p: UWParams) => p.rho * G * p.volume - p.mass * G;
/** Moment de redressement statique (B au-dessus de G) : M = −ρ g V · BG · sin θ. */
export const rightingMoment = (p: UWParams, th: number) => -p.rho * G * p.volume * p.BG * Math.sin(th);
/** Un pas (Euler semi-implicite). z positif vers le haut (profondeur = −z). */
export function stepUW(p: UWParams, s: UWState, t: number[], dt: number): UWState {
  const B = allocationMatrix(p.thrusters); const Fx_t = B[0].reduce((a, v, k) => a + v * t[k], 0), Fz_t = B[1].reduce((a, v, k) => a + v * t[k], 0), M_t = B[2].reduce((a, v, k) => a + v * t[k], 0);
  const c = Math.cos(s.th), sn = Math.sin(s.th); const net = netBuoyancyN(p);
  // poids + flottabilité nets (verticale monde) exprimés dans le repère corps : monde→corps
  // axes corps dans le monde (x, z) : x_b = (cos θ, −sin θ), z_b = (sin θ, cos θ) ; force verticale nette projetée
  const Fxb_g = -net * sn, Fzb_g = net * c;
  const Fx = Fx_t + Fxb_g - 0.5 * p.rho * p.cdAx * Math.abs(s.u) * s.u;
  const Fz = Fz_t + Fzb_g - 0.5 * p.rho * p.cdAz * Math.abs(s.w) * s.w;
  const M = M_t + rightingMoment(p, s.th) - p.kq * Math.abs(s.q) * s.q;
  const u = s.u + (Fx / p.mass) * dt, w = s.w + (Fz / p.mass) * dt, q = s.q + (M / p.Iyy) * dt;
  const th = s.th + q * dt; const cc = Math.cos(th), ss = Math.sin(th);
  return { x: s.x + (cc * u + ss * w) * dt, z: s.z + (-ss * u + cc * w) * dt, th, u, w, q };
}
/** Maintien de profondeur (PID sur z) + consigne de cavalement + maintien d'assiette (PD sur θ). */
export function depthHold(p: UWParams, o: { zTarget: number; surge: number; T: number; dt?: number; kp?: number; ki?: number; kd?: number; kth?: number; kq?: number }) {
  const dt = o.dt ?? 0.01, kp = o.kp ?? 60, ki = o.ki ?? 8, kd = o.kd ?? 60, kth = o.kth ?? 20, kqq = o.kq ?? 10; let s: UWState = { x: 0, z: 0, th: 0, u: 0, w: 0, q: 0 }; let I = 0, sat = 0, n = 0;
  const log = { t: [] as number[], z: [] as number[], x: [] as number[], th: [] as number[] };
  for (let k = 0; k * dt <= o.T + 1e-9; k++) {
    const e = o.zTarget - s.z; if (Math.abs(e) < 1) I += e * dt; const vz = -Math.sin(s.th) * s.u + Math.cos(s.th) * s.w;
    const FzW = kp * e + ki * I - kd * vz - netBuoyancyN(p); // compensation de la flottabilité nette (connue)
    const c = Math.cos(s.th), sn = Math.sin(s.th); const tau: [number, number, number] = [o.surge - FzW * sn, FzW * c, -kth * s.th - kqq * s.q];
    const a = allocate(p.thrusters, tau); if (a.saturated) sat++; n++;
    if (k % 10 === 0) { log.t.push(k * dt); log.z.push(s.z); log.x.push(s.x); log.th.push(s.th); }
    s = stepUW(p, s, a.t, dt);
  }
  return { final: s, log, saturationRatio: sat / n };
}
