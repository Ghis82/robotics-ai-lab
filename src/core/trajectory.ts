/** Profil quintique repos-à-repos : s(τ)=10τ³−15τ⁴+6τ⁵ (vitesse et accélération nulles aux extrémités). */
export function quintic(t: number, T: number) {
  const tau = Math.min(Math.max(t / T, 0), 1);
  const s = 10 * tau ** 3 - 15 * tau ** 4 + 6 * tau ** 5;
  const ds = (30 * tau ** 2 - 60 * tau ** 3 + 30 * tau ** 4) / T;
  const dds = (60 * tau - 180 * tau ** 2 + 120 * tau ** 3) / (T * T);
  return { s, ds, dds };
}
export interface TrajSample { t: number; q: number[]; dq: number[]; ddq: number[] }
export interface Waypoint { q: number[]; duration: number /* s pour atteindre ce point */ }
/** Interpolation articulaire quintique entre poses successives. */
export function buildTrajectory(start: number[], waypoints: Waypoint[], dt: number): TrajSample[] {
  const out: TrajSample[] = []; let q0 = start; let t0 = 0;
  waypoints.forEach((w, wi) => {
    const n = Math.max(1, Math.round(w.duration / dt));
    for (let k = wi === 0 ? 0 : 1; k <= n; k++) {
      const t = (k / n) * w.duration; const { s, ds, dds } = quintic(t, w.duration);
      out.push({ t: t0 + t, q: q0.map((a, i) => a + (w.q[i] - a) * s), dq: q0.map((a, i) => (w.q[i] - a) * ds), ddq: q0.map((a, i) => (w.q[i] - a) * dds) });
    }
    q0 = w.q; t0 += w.duration;
  });
  return out;
}
