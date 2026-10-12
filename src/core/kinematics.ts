import { axisAngle, matMul, matVec, add, I3, type Frame, type Vec3 } from './math';
import type { RobotModel } from './model';
export interface FKResult {
  frames: Frame[];          // repère de chaque articulation (après rotation)
  jointOrigins: Vec3[];     // origine de chaque articulation (monde)
  jointAxes: Vec3[];        // axe de chaque articulation (monde)
  segments: [Vec3, Vec3][]; // début/fin de chaque segment
  tip: Vec3;                // extrémité de l'effecteur
}
/** Cinématique directe d'une chaîne série d'articulations rotoïdes. */
export function forwardKinematics(m: RobotModel, q: number[]): FKResult {
  let R = I3; let p: Vec3 = [0, 0, m.baseHeight];
  const frames: Frame[] = [], jointOrigins: Vec3[] = [], jointAxes: Vec3[] = [], segments: [Vec3, Vec3][] = [];
  m.joints.forEach((j, i) => {
    jointOrigins.push(p); jointAxes.push(matVec(R, j.axis));
    R = matMul(R, axisAngle(j.axis, q[i] ?? 0));
    frames.push({ R, p });
    const d = m.links[i].dir ?? [0, 0, 1]; const L = m.links[i].length;
    const end = add(p, matVec(R, [d[0] * L, d[1] * L, d[2] * L]));
    segments.push([p, end]); p = end;
  });
  return { frames, jointOrigins, jointAxes, segments, tip: p };
}
export interface LimitViolation { joint: number; value: number; min: number; max: number }
export function checkJointLimits(m: RobotModel, q: number[], tol = 1e-9): LimitViolation[] {
  const v: LimitViolation[] = [];
  m.joints.forEach((j, i) => { if (q[i] < j.min - tol || q[i] > j.max + tol) v.push({ joint: i, value: q[i], min: j.min, max: j.max }); });
  return v;
}
