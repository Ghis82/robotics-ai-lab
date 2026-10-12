import { forwardKinematics, checkJointLimits, type FKResult, type LimitViolation } from './kinematics';
import { buildTrajectory, type Waypoint } from './trajectory';
import { detectCollisions, type Contact } from './collision';
import { jointTorques, pointMasses, centerOfMass, tippingMargin } from './mechanics';
import type { RobotModel } from './model';
import type { Vec3 } from './math';
export interface SimFrame {
  t: number; q: number[]; dq: number[]; fk: FKResult;
  tauStatic: number[]; tauDynamic: number[];
  contacts: Contact[]; limits: LimitViolation[];
  com: Vec3 | null; tipMargin: number | null;
}
export interface SimResult { frames: SimFrame[]; dt: number; massesComplete: boolean; waypoints: Waypoint[]; start: number[] }
/** Simulation cinématique + quasi-dynamique (masses ponctuelles). Ce n'est PAS une intégration de dynamique complète. */
export function simulate(m: RobotModel, start: number[], waypoints: Waypoint[], dt = 0.02): SimResult {
  const traj = buildTrajectory(start, waypoints, dt);
  const fks = traj.map((s) => forwardKinematics(m, s.q));
  const pos = fks.map((fk) => pointMasses(m, fk).masses.map((p) => p.p));
  const n = traj.length; let massesComplete = true;
  const frames = traj.map((s, i) => {
    const fk = fks[i];
    // accélération cartésienne des masses ponctuelles par différences finies centrées
    const im = Math.max(0, i - 1), ip = Math.min(n - 1, i + 1);
    const h = (traj[ip].t - traj[im].t) / 2 || dt;
    const acc: Vec3[] = pos[i].map((p, k) => (ip === i || im === i) ? [0, 0, 0] : [0, 1, 2].map((c) => (pos[ip][k][c] - 2 * p[c] + pos[im][k][c]) / (h * h)) as Vec3);
    const st = jointTorques(m, fk); const dy = jointTorques(m, fk, acc);
    if (!st.complete) massesComplete = false;
    const cm = centerOfMass(m, fk);
    return { t: s.t, q: s.q, dq: s.dq, fk, tauStatic: st.tau, tauDynamic: dy.tau,
      contacts: detectCollisions(m, fk), limits: checkJointLimits(m, s.q),
      com: cm ? cm.com : null, tipMargin: cm ? tippingMargin(m, cm.com) : null };
  });
  return { frames, dt, massesComplete, waypoints, start };
}
