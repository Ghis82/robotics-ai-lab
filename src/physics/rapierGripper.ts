// EXPÉRIMENTAL — pince parallèle à 2 doigts saisissant une boîte dans Rapier.
// Paume cinématique, doigts dynamiques sur liaisons glissières avec moteur borné à l'effort déclaré, frottement de Coulomb (μ utilisateur).
import RAPIER from '@dimforge/rapier3d-compat';
export { initRapier } from './rapierArm';
export interface GripOpts { boxMass: number; box: [number, number, number] /* demi-dimensions m */; mu: number; fingerForce: number; liftAccel: number; liftTime?: number; dt?: number }
export interface GripResult { slip: number /* m, glissement relatif boîte/paume */; held: boolean; boxDropped: boolean; required: number; log: { t: number[]; rel: number[] } }
export function simulateGrip(o: GripOpts): GripResult {
  const dt = o.dt ?? 1 / 600; const w = new RAPIER.World({ x: 0, y: 0, z: -9.81 }); w.timestep = dt;
  const ground = w.createRigidBody(RAPIER.RigidBodyDesc.fixed()); w.createCollider(RAPIER.ColliderDesc.cuboid(1, 1, 0.05).setTranslation(0, 0, -0.05).setFriction(0.5), ground);
  const [bx, by, bz] = o.box; const box = w.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 0, bz).setCanSleep(false));
  w.createCollider(RAPIER.ColliderDesc.cuboid(bx, by, bz).setMass(o.boxMass).setFriction(o.mu).setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min), box);
  const z0 = bz; const palm = w.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, 0, z0));
  const fingers = [1, -1].map((s) => {
    const f = w.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(0, s * (by + 0.03), z0).setCanSleep(false));
    w.createCollider(RAPIER.ColliderDesc.cuboid(0.02, 0.01, Math.min(bz, 0.03)).setMass(0.05).setFriction(o.mu).setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min), f);
    const jd = RAPIER.JointData.prismatic({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }); // position articulaire = déplacement du doigt
    const j = w.createImpulseJoint(jd, palm, f, true) as RAPIER.PrismaticImpulseJoint; j.setContactsEnabled(false);
    j.configureMotorModel(RAPIER.MotorModel.ForceBased); j.configureMotorPosition(0, 1e5, 50); j.setMotorMaxForce(o.fingerForce); // consigne au centre → serrage borné à l'effort déclaré
    return f;
  });
  for (let k = 0; k < Math.round(0.4 / dt); k++) w.step(); // fermeture et stabilisation, boîte posée
  const T = o.liftTime ?? 0.6; const log = { t: [] as number[], rel: [] as number[] }; const rel0 = box.translation().z - palm.translation().z;
  for (let k = 1; k <= Math.round(T / dt); k++) { const t = k * dt; palm.setNextKinematicTranslation({ x: 0, y: 0, z: z0 + 0.5 * o.liftAccel * t * t }); w.step();
    if (k % 10 === 0) { log.t.push(t); log.rel.push(box.translation().z - palm.translation().z - rel0); } }
  const slip = -(box.translation().z - palm.translation().z - rel0); void fingers; const dropped = box.translation().z < bz + 0.005;
  w.free();
  return { slip, held: slip < 0.005 && !dropped, boxDropped: dropped, required: (o.boxMass * (9.81 + o.liftAccel)) / (2 * o.mu), log };
}
