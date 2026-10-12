// Jambes : cinématique 2-3 DDL, allure statique (quadrupède), ZMP par modèle de pendule inverse linéaire (bipède). Pur TS.
import { stabilityMargin, type P2 } from './balance';
/** Jambe 3 DDL : abduction (autour de x), hanche et genou (autour de y). Repère hanche : x avant, y gauche, z haut. Cuisse l1, tibia l2, déport latéral d. */
export function legFK(l1: number, l2: number, d: number, a: number, h: number, k: number): [number, number, number] {
  const xp = -l1 * Math.sin(h) - l2 * Math.sin(h + k); const zp = -l1 * Math.cos(h) - l2 * Math.cos(h + k); // plan sagittal
  return [xp, d * Math.cos(a) - zp * Math.sin(a), d * Math.sin(a) + zp * Math.cos(a)];
}
/** IK analytique ; genou « vers l'arrière » (k ≥ 0). null si hors portée. Avec d = 0 et a = 0 : jambe plane 2 DDL. */
export function legIK(l1: number, l2: number, d: number, p: [number, number, number]): [number, number, number] | null {
  const [x, y, z] = p; const r2 = y * y + z * z - d * d; if (r2 < 0) return null; const zp = -Math.sqrt(r2);
  const a = Math.atan2(z, y) - Math.atan2(zp, d) ; // [y;z] = Rx(a)[d;zp]
  const c = (x * x + zp * zp - l1 * l1 - l2 * l2) / (2 * l1 * l2); if (c > 1 + 1e-12 || c < -1 - 1e-12) return null;
  const k = Math.acos(Math.max(-1, Math.min(1, c)));
  const h = Math.atan2(-x, -zp) - Math.atan2(l2 * Math.sin(k), l1 + l2 * Math.cos(k));
  return [Math.atan2(Math.sin(a), Math.cos(a)), h, k];
}
export interface GaitPhase { phase: number; swing: number | null; com: P2; contacts: P2[]; margin: number }
/** Allure rampante statique (une patte levée à la fois, ordre AG-AD... ) ; le CdM est déplacé vers le centroïde du trépied d'appui
 *  avec un facteur « shift » (0 = pas de déplacement, 1 = centroïde). Pieds : AG, AD, ArG, ArD aux coins d'un rectangle L × W. */
export function crawlGait(L: number, W: number, stride: number, shift: number, order = [0, 3, 1, 2]): GaitPhase[] {
  const feet: P2[] = [[L / 2, W / 2], [L / 2, -W / 2], [-L / 2, W / 2], [-L / 2, -W / 2]]; const out: GaitPhase[] = []; let body: P2 = [0, 0];
  order.forEach((leg, i) => {
    const sup = feet.filter((_, k) => k !== leg); const cx = sup.reduce((s, p) => s + p[0], 0) / 3, cy = sup.reduce((s, p) => s + p[1], 0) / 3;
    const com: P2 = [body[0] + shift * (cx - body[0]), body[1] + shift * (cy - body[1])];
    out.push({ phase: i + 1, swing: leg, com, contacts: sup, margin: stabilityMargin(com, sup) });
    feet[leg] = [feet[leg][0] + stride, feet[leg][1]]; body = [body[0] + stride / 4, body[1]];
  });
  return out;
}
/** ZMP du modèle LIPM : p = c − (z_c/g)·c̈ (masse ponctuelle à hauteur constante — ESTIMATION). */
export const lipmZMP = (c: number, cdd: number, zc: number, g = 9.81) => c - (zc / g) * cdd;
/** Balancement latéral sinusoïdal c_y = A sin(πt/Ts) (un pas = Ts) : ZMP latéral et marge vis-à-vis du pied d'appui. */
export function bipedSwayZMP(o: { A: number; Ts: number; zc: number; stance: number; footW: number; footL: number; steps: number; dt?: number }) {
  const dt = o.dt ?? 0.005; const t: number[] = [], com: number[] = [], zmp: number[] = [], margin: number[] = [];
  const w = Math.PI / o.Ts;
  for (let k = 0; k * dt <= o.steps * o.Ts + 1e-9; k++) {
    const tt = k * dt; const c = o.A * Math.sin(w * tt); const cdd = -o.A * w * w * Math.sin(w * tt); const p = lipmZMP(c, cdd, o.zc);
    // pied d'appui : gauche (+stance/2) quand c > 0, droit sinon ; phase de double appui ignorée (hypothèse conservative)
    const foot = (Math.sin(w * tt) >= 0 ? 1 : -1) * o.stance / 2;
    const m = Math.min(o.footW / 2 - Math.abs(p - foot), o.footL / 2);
    t.push(tt); com.push(c); zmp.push(p); margin.push(Math.abs(Math.sin(w * tt)) < 0.05 ? NaN : m);
  }
  return { t, com, zmp, margin, minMargin: Math.min(...margin.filter(Number.isFinite)) };
}
