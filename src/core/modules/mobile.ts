/** Cinématique d'un robot à entraînement différentiel. */
export function diffDrive(vl: number, vr: number, track: number) {
  const v = (vl + vr) / 2, w = (vr - vl) / track; return { v, w, radius: Math.abs(w) < 1e-12 ? Infinity : v / w };
}
export function wheelSpeedsFor(v: number, radius: number, track: number) { const w = v / radius; return { vl: v - (w * track) / 2, vr: v + (w * track) / 2 }; }
/** Accélération limitée par l'adhérence : a ≤ μ·g·(fraction de masse sur roues motrices). */
export const frictionAccelLimit = (mu: number, drivenFraction = 1, g = 9.81) => mu * g * drivenFraction;
/** Couple roue requis pour une accélération a (masse ponctuelle, sans roulement ni pente). */
export const wheelTorqueRequired = (mass: number, a: number, wheelR: number, nDriven: number) => (mass * a * wheelR) / nDriven;
/** Profil trapézoïdal 1D : durée pour parcourir d avec vmax, amax. */
export function trapezoid(d: number, vmax: number, amax: number) {
  const dAcc = (vmax * vmax) / amax;
  if (d <= dAcc) { const t = 2 * Math.sqrt(d / amax); return { time: t, vPeak: Math.sqrt(d * amax), triangular: true }; }
  return { time: 2 * vmax / amax + (d - dAcc) / vmax, vPeak: vmax, triangular: false };
}
export type P2 = [number, number];
const segPointDist = (a: P2, b: P2, p: P2) => { const dx = b[0] - a[0], dy = b[1] - a[1]; const L = dx * dx + dy * dy; const t = L ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L)) : 0; return Math.hypot(a[0] + t * dx - p[0], a[1] + t * dy - p[1]); };
/** Collision d'un robot (disque de rayon r) suivant un chemin polyligne avec des obstacles circulaires. */
export function pathCollisions(path: P2[], robotR: number, obstacles: { c: P2; r: number }[]) {
  const hits: { segment: number; obstacle: number; clearance: number }[] = [];
  for (let i = 0; i < path.length - 1; i++) obstacles.forEach((o, k) => { const c = segPointDist(path[i], path[i + 1], o.c) - o.r - robotR; if (c < 0) hits.push({ segment: i, obstacle: k, clearance: c }); });
  return hits;
}
export const pathLength = (p: P2[]) => p.slice(1).reduce((s, q, i) => s + Math.hypot(q[0] - p[i][0], q[1] - p[i][1]), 0);
