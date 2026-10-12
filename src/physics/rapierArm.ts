// MODULE EXPÉRIMENTAL — simulation dynamique de corps rigides via Rapier (moteur open source, WASM).
// Strictement séparé du module analytique (src/core). Résultats à interpréter comme une simulation numérique approchée.
import RAPIER from '@dimforge/rapier3d-compat';
import type { RobotModel } from '../core/model';
import { forwardKinematics } from '../core/kinematics';
let ready: Promise<void> | null = null;
export const initRapier = () => (ready ??= RAPIER.init());
const quatFromMat = (m: number[]) => { const [a, b, c, d, e, f, g, h, i] = m; const tr = a + e + i; let w, x, y, z;
  if (tr > 0) { const s = Math.sqrt(tr + 1) * 2; w = s / 4; x = (h - f) / s; y = (c - g) / s; z = (d - b) / s; }
  else if (a > e && a > i) { const s = Math.sqrt(1 + a - e - i) * 2; w = (h - f) / s; x = s / 4; y = (b + d) / s; z = (c + g) / s; }
  else if (e > i) { const s = Math.sqrt(1 + e - a - i) * 2; w = (c - g) / s; x = (b + d) / s; y = s / 4; z = (f + h) / s; }
  else { const s = Math.sqrt(1 + i - a - e) * 2; w = (d - b) / s; x = (c + g) / s; y = (f + h) / s; z = s / 4; } return { w, x, y, z }; };
/** Quaternion de la rotation minimale amenant a sur b (vecteurs unitaires). */
function quatFromTo(a: number[], b: number[]) { const c = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; const d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  if (d < -0.999999) { const ax = Math.abs(a[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]; const p = [a[1] * ax[2] - a[2] * ax[1], a[2] * ax[0] - a[0] * ax[2], a[0] * ax[1] - a[1] * ax[0]]; const n = Math.hypot(p[0], p[1], p[2]); return { w: 0, x: p[0] / n, y: p[1] / n, z: p[2] / n }; }
  const w = 1 + d; const n = Math.hypot(w, c[0], c[1], c[2]); return { w: w / n, x: c[0] / n, y: c[1] / n, z: c[2] / n }; }
export interface RapierOpts { stiffness: number; damping: number; dt: number; motors: boolean; enforceTorqueLimits?: boolean; enforceJointLimits?: boolean; obstacles?: boolean }
export interface RapierSample { t: number; q: number[]; contacts: number; pairs: string[] }
export class RapierArm {
  world: RAPIER.World; bodies: RAPIER.RigidBody[] = []; joints: RAPIER.RevoluteImpulseJoint[] = []; colliders: RAPIER.Collider[] = [];
  constructor(private m: RobotModel, q0: number[], private o: RapierOpts = { stiffness: 2000, damping: 60, dt: 1 / 240, motors: true }) {
    const w = (this.world = new RAPIER.World({ x: 0, y: 0, z: -9.81 })); w.timestep = o.dt;
    const ground = w.createRigidBody(RAPIER.RigidBodyDesc.fixed()); w.createCollider(RAPIER.ColliderDesc.cuboid(5, 5, 0.05).setTranslation(0, 0, -0.05), ground);
    const base = w.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    const fk = forwardKinematics(m, q0); const n = m.links.length;
    m.links.forEach((l, i) => {
      const F = fk.frames[i]; const mass = l.mass ?? 0; const L = l.length;
      const extra = i === n - 1 ? m.payload.mass : 0; const M = mass + extra; const comZ = M > 0 ? (mass * L / 2 + extra * L) / M : L / 2;
      const Ixx = mass * L * L / 12 + mass * (L / 2 - comZ) ** 2 + extra * (L - comZ) ** 2 + 1e-5;
      const d = l.dir ?? [0, 0, 1]; const qz = quatFromTo([0, 0, 1], d), qy = quatFromTo([0, 1, 0], d);
      const b = w.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(...F.p).setRotation(quatFromMat(F.R)).setAdditionalMassProperties(Math.max(M, 1e-3), { x: d[0] * comZ, y: d[1] * comZ, z: d[2] * comZ }, { x: Ixx, y: Ixx, z: Math.max(mass * l.radius * l.radius / 2, 1e-5) }, qz));
      const c = w.createCollider(RAPIER.ColliderDesc.capsule(L / 2, l.radius).setDensity(0).setTranslation(d[0] * L / 2, d[1] * L / 2, d[2] * L / 2).setRotation(qy).setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS), b);
      const pd = i === 0 ? [0, 0, 0] : (m.links[i - 1].dir ?? [0, 0, 1]); const pL = i === 0 ? 0 : m.links[i - 1].length;
      const parent = i === 0 ? base : this.bodies[i - 1]; const anchor = i === 0 ? { x: 0, y: 0, z: m.baseHeight } : { x: pd[0] * pL, y: pd[1] * pL, z: pd[2] * pL };
      const ax = m.joints[i].axis; const jd = RAPIER.JointData.revolute(anchor, { x: 0, y: 0, z: 0 }, { x: ax[0], y: ax[1], z: ax[2] });
      const j = w.createImpulseJoint(jd, parent, b, true) as RAPIER.RevoluteImpulseJoint; j.setContactsEnabled(false);
      if (o.motors) { j.configureMotorModel(RAPIER.MotorModel.ForceBased); j.configureMotorPosition(q0[i], o.stiffness, o.damping);
        // Couple max déclaré → borne du moteur (Rapier borne l'impulsion à maxForce·dt). Moteur non déclaré → aucun moteur (articulation libre) : jamais de couple inventé.
        if (o.enforceTorqueLimits !== false) { const mt = m.joints[i].motor; if (mt) j.setMotorMaxForce(mt.maxTorque); else { j.configureMotorPosition(q0[i], 0, 0); this.unpowered.push(i); } } }
      if (o.enforceJointLimits) j.setLimits(m.joints[i].min, m.joints[i].max);
      this.bodies.push(b); this.joints.push(j); this.colliders.push(c);
    });
    this.targets = [...q0];
    if (o.obstacles !== false) m.obstacles.forEach((ob) => { const c = w.createCollider(RAPIER.ColliderDesc.ball(ob.radius).setTranslation(...ob.center).setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS), ground); this.obstacleColliders.push({ c, name: ob.name }); });
    this.groundCollider = w.getCollider(0);
    const dt0 = w.timestep; w.timestep = 1e-9; w.step(); w.timestep = dt0; // calcule les propriétés de masse sans modifier l'état
  }
  unpowered: number[] = []; obstacleColliders: { c: RAPIER.Collider; name: string }[] = []; groundCollider: RAPIER.Collider;
  /** Paires en contact effectif (distance ≤ 0) : segment/segment, segment/sol, segment/obstacle. */
  contactPairs(): string[] {
    const names = new Map<number, string>(); this.colliders.forEach((c, i) => names.set(c.handle, this.m.links[i].name)); this.obstacleColliders.forEach((o) => names.set(o.c.handle, o.name)); names.set(this.groundCollider.handle, 'sol');
    const out = new Set<string>();
    this.colliders.forEach((c) => this.world.contactPairsWith(c, (o) => { this.world.contactPair(c, o, (man) => { for (let k = 0; k < man.numContacts(); k++) if (man.contactDist(k) <= 0) { out.add([names.get(c.handle), names.get(o.handle) ?? '?'].sort().join(' / ')); break; } }); }));
    return [...out];
  }
  /** Relecture : couple gravitaire calculé à partir des masses et centres de masse TELS QUE STOCKÉS dans Rapier. */
  gravityTorquesFromEngine(): number[] {
    const g = 9.81; return this.joints.map((_, j) => { const o = this.bodies[j].translation(); const z = this.worldAxis(j); let t = 0;
      for (let k = j; k < this.bodies.length; k++) { const c = this.bodies[k].worldCom(); const f = this.bodies[k].mass() * g; t += (c.y - o.y) * f * z[0] - (c.x - o.x) * f * z[1]; } // (r × f·ẑ)·axe
      return t; });
  }
  targets: number[];
  /** Angle articulaire mesuré (rad) à partir des orientations relatives. */
  jointAngles(): number[] {
    return this.joints.map((_, i) => {
      const qc = this.bodies[i].rotation(); const qp = i === 0 ? { w: 1, x: 0, y: 0, z: 0 } : this.bodies[i - 1].rotation();
      // q_rel = conj(qp) * qc
      const r = { w: qp.w * qc.w + qp.x * qc.x + qp.y * qc.y + qp.z * qc.z, x: qp.w * qc.x - qp.x * qc.w - qp.y * qc.z + qp.z * qc.y, y: qp.w * qc.y + qp.x * qc.z - qp.y * qc.w - qp.z * qc.x, z: qp.w * qc.z - qp.x * qc.y + qp.y * qc.x - qp.z * qc.w };
      const ax = this.m.joints[i].axis; return 2 * Math.atan2(r.x * ax[0] + r.y * ax[1] + r.z * ax[2], r.w);
    });
  }
  setTargets(q: number[]) { this.targets = q; if (this.o.motors) this.joints.forEach((j, i) => j.configureMotorPosition(q[i], this.o.stiffness, this.o.damping)); }
  /** Applique des couples articulaires (paire action/réaction parent/enfant) pendant le prochain pas. */
  applyJointTorques(tau: number[]) {
    this.bodies.forEach((b) => b.resetTorques(true));
    tau.forEach((t, i) => { const a = this.worldAxis(i); const v = { x: a[0] * t, y: a[1] * t, z: a[2] * t }; this.bodies[i].addTorque(v, true); if (i > 0) this.bodies[i - 1].addTorque({ x: -v.x, y: -v.y, z: -v.z }, true); });
  }
  worldAxis(i: number): [number, number, number] { const q = this.bodies[i].rotation(); const a = this.m.joints[i].axis; // rotation du vecteur a par q
    const [x, y, z] = a; const { w, x: qx, y: qy, z: qz } = q; const ix = w * x + qy * z - qz * y, iy = w * y + qz * x - qx * z, iz = w * z + qx * y - qy * x, iw = -qx * x - qy * y - qz * z;
    return [ix * w + iw * -qx + iy * -qz - iz * -qy, iy * w + iw * -qy + iz * -qx - ix * -qz, iz * w + iw * -qz + ix * -qy - iy * -qx]; }
  contactCount(): number { let n = 0; this.colliders.forEach((c) => this.world.contactPairsWith(c, (o) => { this.world.contactPair(c, o, (man) => { for (let k = 0; k < man.numContacts(); k++) if (man.contactDist(k) <= 0) { n++; break; } }); })); return Math.ceil(n / 2); } // paires entre segments vues deux fois ; sol une fois
  step(n = 1) { for (let k = 0; k < n; k++) this.world.step(); }
  run(T: number, onTarget?: (t: number) => number[] | null, torques?: (q: number[]) => number[]): RapierSample[] {
    const out: RapierSample[] = []; const steps = Math.round(T / this.o.dt);
    for (let k = 0; k <= steps; k++) { const t = k * this.o.dt; const tg = onTarget?.(t); if (tg) this.setTargets(tg); if (torques) this.applyJointTorques(torques(this.jointAngles())); if (k % 4 === 0) { const q = this.jointAngles(); { const pairs = this.contactPairs(); out.push({ t, q, contacts: pairs.length, pairs }); }; } this.world.step(); }
    return out;
  }
  free() { this.world.free(); }
}
