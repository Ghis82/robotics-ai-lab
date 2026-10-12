import { sub, cross, dot, add, scale, type Vec3 } from './math';
import type { RobotModel } from './model';
import type { FKResult } from './kinematics';
export const G = 9.81;
export interface PointMass { p: Vec3; m: number; label: string }
/** Hypothèse : segment = tige homogène → masse ponctuelle au milieu ; charge ponctuelle à l'extrémité. */
export function pointMasses(m: RobotModel, fk: FKResult): { masses: PointMass[]; owner: number[]; complete: boolean } {
  const masses: PointMass[] = [], owner: number[] = []; let complete = true;
  fk.segments.forEach((s, i) => {
    const mass = m.links[i].mass; if (mass == null) { complete = false; return; }
    masses.push({ p: scale(add(s[0], s[1]), 0.5), m: mass, label: m.links[i].name }); owner.push(i);
  });
  if (m.payload.mass > 0) { masses.push({ p: fk.tip, m: m.payload.mass, label: 'charge' }); owner.push(m.links.length - 1); }
  return { masses, owner, complete };
}
/**
 * Couple articulaire à fournir par le moteur j pour tenir/accélérer les masses ponctuelles en aval :
 * τ_j = Σ_k [(p_k − o_j) × m_k (a_k − g)] · z_j,  g = (0,0,−9.81).
 * Avec accels = undefined → couple statique gravitaire seul.
 */
export function jointTorques(m: RobotModel, fk: FKResult, accels?: Vec3[]): { tau: number[]; complete: boolean } {
  const { masses, owner, complete } = pointMasses(m, fk);
  const tau = m.joints.map((_, j) => {
    let t = 0;
    masses.forEach((pm, k) => {
      if (owner[k] < j) return; // masse en amont de l'articulation j
      const a = accels ? accels[k] : [0, 0, 0] as Vec3;
      const f = scale([a[0], a[1], a[2] + G], pm.m);
      t += dot(cross(sub(pm.p, fk.jointOrigins[j]), f), fk.jointAxes[j]);
    });
    return t;
  });
  return { tau, complete };
}
export function centerOfMass(m: RobotModel, fk: FKResult): { com: Vec3; total: number } | null {
  const { masses, complete } = pointMasses(m, fk); if (!complete || m.baseMass == null) return null;
  let M = m.baseMass; let c: Vec3 = scale([0, 0, m.baseHeight / 2], m.baseMass);
  masses.forEach((pm) => { M += pm.m; c = add(c, scale(pm.p, pm.m)); });
  return { com: scale(c, 1 / M), total: M };
}
/** Basculement statique : la projection du CdM doit rester dans l'empreinte (disque) du socle posé (non fixé). */
export function tippingMargin(m: RobotModel, com: Vec3): number | null {
  if (m.baseFootprintRadius == null) return null;
  return m.baseFootprintRadius - Math.hypot(com[0], com[1]);
}
