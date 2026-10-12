// Robot cartésien / portique : 3 axes prismatiques indépendants.
export interface Axis { min: number; max: number; vmax: number; amax: number }
export const inRange = (axes: Axis[], p: number[]) => p.map((v, i) => v >= axes[i].min - 1e-12 && v <= axes[i].max + 1e-12);
export const workspaceVolume = (axes: Axis[]) => axes.reduce((s, a) => s * (a.max - a.min), 1);
/** Durée d'un déplacement trapézoïdal 1D. */
export function axisTime(d: number, vmax: number, amax: number) { d = Math.abs(d); const dAcc = (vmax * vmax) / amax; return d <= dAcc ? 2 * Math.sqrt(d / amax) : 2 * vmax / amax + (d - dAcc) / vmax; }
/** Mouvement synchronisé : tous les axes arrivent ensemble ; la durée est celle de l'axe le plus lent. */
export function syncMove(axes: Axis[], from: number[], to: number[]) {
  const times = axes.map((a, i) => axisTime(to[i] - from[i], a.vmax, a.amax)); const T = Math.max(...times);
  return { T, times, limiting: times.indexOf(T) };
}
/** Échantillonnage d'une trajectoire linéaire synchronisée (profil trapézoïdal commun) */
export function sampleSync(axes: Axis[], from: number[], to: number[], dt: number) {
  const { T } = syncMove(axes, from, to); const n = Math.max(1, Math.ceil(T / dt)); const out: { t: number; p: number[] }[] = [];
  for (let k = 0; k <= n; k++) { const tau = k / n; const s = tau < 0.5 ? 2 * tau * tau : 1 - 2 * (1 - tau) * (1 - tau); out.push({ t: tau * T, p: from.map((f, i) => f + (to[i] - f) * s) }); }
  return out;
}
