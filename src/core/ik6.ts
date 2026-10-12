// IK 6D (position + orientation) par moindres carrés amortis pondérés, jacobien géométrique. Pur TS.
import { forwardKinematics } from './kinematics';
import type { RobotModel } from './model';
import { sub, cross, norm, add, scale, type Vec3, type Mat3 } from './math';
const col = (R: Mat3, i: number): Vec3 => [R[i], R[3 + i], R[6 + i]];
/** Erreur d'orientation e_o = ½ Σ R_i × Rd_i (colonnes) — petite rotation amenant R vers Rd. */
export function orientationError(R: Mat3, Rd: Mat3): Vec3 { let e: Vec3 = [0, 0, 0]; for (let i = 0; i < 3; i++) e = add(e, cross(col(R, i), col(Rd, i))); return scale(e, 0.5); }
export function solveN(A: number[][], b: number[]): number[] {
  const n = b.length; const M = A.map((r, i) => [...r, b[i]]);
  for (let i = 0; i < n; i++) { let p = i; for (let k = i + 1; k < n; k++) if (Math.abs(M[k][i]) > Math.abs(M[p][i])) p = k; [M[i], M[p]] = [M[p], M[i]];
    for (let k = i + 1; k < n; k++) { const f = M[k][i] / M[i][i]; for (let c = i; c <= n; c++) M[k][c] -= f * M[i][c]; } }
  const x = new Array(n).fill(0); for (let i = n - 1; i >= 0; i--) { let s = M[i][n]; for (let c = i + 1; c < n; c++) s -= M[i][c] * x[c]; x[i] = s / M[i][i]; } return x;
}
export interface IK6Result { q: number[]; posError: number; oriError: number /* rad */; reached: boolean; iterations: number; atLimit: number[]; note: string }
export function solveIK6(m: RobotModel, pos: Vec3, Rd: Mat3, q0: number[], o: { wPos?: number; wOri?: number; lambda?: number; maxIter?: number; tolPos?: number; tolOri?: number } = {}): IK6Result {
  const wp = o.wPos ?? 1, wo = o.wOri ?? 0.3, lam = o.lambda ?? 0.05, maxIter = o.maxIter ?? 500, tp = o.tolPos ?? 1e-4, to = o.tolOri ?? 1e-3;
  const clamp = (q: number[]) => q.map((v, i) => Math.min(Math.max(v, m.joints[i].min), m.joints[i].max));
  let q = clamp([...q0]); let ep = Infinity, eo = Infinity, it = 0;
  for (; it < maxIter; it++) {
    const fk = forwardKinematics(m, q); const R = fk.frames[fk.frames.length - 1].R;
    const e1 = sub(pos, fk.tip), e2 = orientationError(R, Rd); ep = norm(e1); eo = Math.asin(Math.min(1, norm(e2)));
    if (ep < tp && eo < to) break;
    const J = fk.jointAxes.map((z, j) => [...scale(cross(z, sub(fk.tip, fk.jointOrigins[j])), wp), ...scale(z, wo)]); // colonnes 6D pondérées
    const e = [...scale(e1, wp), ...scale(e2, wo)];
    const A = [0, 1, 2, 3, 4, 5].map((r) => [0, 1, 2, 3, 4, 5].map((c) => J.reduce((s, Jc) => s + Jc[r] * Jc[c], 0) + (r === c ? lam * lam : 0)));
    const y = solveN(A, e); const dq = J.map((Jc) => Jc.reduce((s, v, r) => s + v * y[r], 0));
    const mx = Math.max(...dq.map(Math.abs)); const sc = mx > 0.2 ? 0.2 / mx : 1; q = clamp(q.map((v, k) => v + sc * dq[k]));
  }
  const atLimit = q.map((v, i) => (Math.abs(v - m.joints[i].min) < 1e-6 || Math.abs(v - m.joints[i].max) < 1e-6 ? i : -1)).filter((i) => i >= 0);
  const reached = ep < tp * 10 && eo < to * 10;
  return { q, posError: ep, oriError: eo, reached, iterations: it, atLimit, note: m.joints.length < 6 ? `Bras à ${m.joints.length} axes : toutes les orientations ne sont pas atteignables ; le résultat est un compromis pondéré (w_pos = ${wp}, w_ori = ${wo}).` : '' };
}
