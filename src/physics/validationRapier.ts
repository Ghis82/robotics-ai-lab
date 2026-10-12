// Cas de validation croisée moteur Rapier ↔ dynamique analytique (asynchrone : WebAssembly).
import { demoArm } from '../core/model';
import { chainFromModel, simulateFD } from '../core/dynamics';
import { initRapier, RapierArm } from './rapierArm';
import { simulateGrip } from './rapierGripper';
import type { VCase } from '../core/validation';
export async function rapierCases(): Promise<VCase[]> {
  await initRapier(); const out: VCase[] = [];
  const m = demoArm(); m.obstacles = []; const q0 = [0.3, 0.6, 0.8, 0.4, 0.2]; const T = 0.15;
  const fd = simulateFD(chainFromModel(m), q0, q0.map(() => 0), T, 0.001); const ra = new RapierArm(m, q0, { stiffness: 0, damping: 0, dt: 1 / 1000, motors: false }); const rs = ra.run(T); ra.free();
  const a = fd[fd.length - 1].q, b = rs[rs.length - 1].q; const d = Math.max(...a.map((x, i) => Math.abs(x - b[i]))); const disp = Math.max(...a.map((x, i) => Math.abs(x - q0[i])));
  out.push({ id: 'rapier-fd', title: 'Chute libre du bras (0,15 s) : RNEA/CRBA+RK4 vs Rapier — écart max / déplacement max', reference: 'Accord entre deux moteurs indépendants', computed: d / disp, expected: 0, unit: '(rel.)', tol: 0.05, err: d / disp, pass: d / disp <= 0.05, kind: 'cohérence' });
  const req = (1 * (9.81 + 2)) / (2 * 0.5); let lo = 0.5, hi = 1.5; for (let k = 0; k < 6; k++) { const mid = (lo + hi) / 2; if (simulateGrip({ boxMass: 1, box: [0.03, 0.03, 0.05], mu: 0.5, fingerForce: mid * req, liftAccel: 2 }).held) hi = mid; else lo = mid; }
  const thr = ((lo + hi) / 2) * req; out.push({ id: 'grip', title: 'Pince : effort seuil tenue/glissement dans Rapier (dichotomie)', reference: 'F = m(g+a)/(nμ) — frottement de Coulomb', computed: thr, expected: req, unit: 'N', tol: 0.1, err: Math.abs(thr - req) / req, pass: Math.abs(thr - req) / req <= 0.1, kind: 'indépendant' });
  return out;
}
