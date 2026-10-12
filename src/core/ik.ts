// IK numérique (moindres carrés amortis, Levenberg-Marquardt) sur la position de l'effecteur. Pur TS.
import { forwardKinematics } from './kinematics';
import type { RobotModel } from './model';
import { sub, norm, type Vec3 } from './math';
export interface IKResult { q: number[]; reached: boolean; error: number; iterations: number; atLimit: number[]; reachable: 'oui' | 'hors portée géométrique' | 'non atteint (butées ou minimum local)' }
function solve3(A: number[][], b: number[]): number[] { // Gauss avec pivot
  const M = A.map((r, i) => [...r, b[i]]); const n = 3;
  for (let i = 0; i < n; i++) { let p = i; for (let k = i + 1; k < n; k++) if (Math.abs(M[k][i]) > Math.abs(M[p][i])) p = k; [M[i], M[p]] = [M[p], M[i]];
    for (let k = i + 1; k < n; k++) { const f = M[k][i] / M[i][i]; for (let c = i; c <= n; c++) M[k][c] -= f * M[i][c]; } }
  const x = [0, 0, 0]; for (let i = n - 1; i >= 0; i--) { let s = M[i][n]; for (let c = i + 1; c < n; c++) s -= M[i][c] * x[c]; x[i] = s / M[i][i]; } return x;
}
export function solveIK(m: RobotModel, target: Vec3, q0: number[], opts: { tol?: number; maxIter?: number; lambda?: number } = {}): IKResult {
  const tol = opts.tol ?? 1e-4, maxIter = opts.maxIter ?? 300, lam = opts.lambda ?? 0.05;
  const clamp = (q: number[]) => q.map((v, i) => Math.min(Math.max(v, m.joints[i].min), m.joints[i].max));
  let q = clamp([...q0]); let err = Infinity; let it = 0;
  for (; it < maxIter; it++) {
    const tip = forwardKinematics(m, q).tip; const e = sub(target, tip); err = norm(e); if (err < tol) break;
    const h = 1e-6; const J = [0, 1, 2].map(() => new Array(q.length).fill(0));
    q.forEach((_, j) => { const qq = [...q]; qq[j] += h; const t2 = forwardKinematics(m, qq).tip; for (let r = 0; r < 3; r++) J[r][j] = (t2[r] - tip[r]) / h; });
    const JJt = [0, 1, 2].map((r) => [0, 1, 2].map((c) => J[r].reduce((s, v, k) => s + v * J[c][k], 0) + (r === c ? lam * lam : 0)));
    const y = solve3(JJt, e as number[]); const dq = q.map((_, k) => J[0][k] * y[0] + J[1][k] * y[1] + J[2][k] * y[2]);
    const mx = Math.max(...dq.map(Math.abs)); const sc = mx > 0.2 ? 0.2 / mx : 1; // pas borné (robustesse)
    q = clamp(q.map((v, k) => v + sc * dq[k]));
  }
  const atLimit = q.map((v, i) => (Math.abs(v - m.joints[i].min) < 1e-6 || Math.abs(v - m.joints[i].max) < 1e-6 ? i : -1)).filter((i) => i >= 0);
  const L = m.links.reduce((s, l) => s + l.length, 0); const sh: Vec3 = [0, 0, m.baseHeight]; // borne de portée grossière (somme des longueurs)
  const reached = err < tol * 10;
  return { q, reached, error: err, iterations: it, atLimit, reachable: reached ? 'oui' : norm(sub(target, sh)) > L ? 'hors portée géométrique' : 'non atteint (butées ou minimum local)' };
}
