import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { demoArm, demoCobot, demoScara } from '../src/core/model';
import { chainFromModel, chainFromURDF, rnea, massMatrix, forwardDynamics, simulateFD, energy, trajectoryDynamics, availableTorque, segmentInertia } from '../src/core/dynamics';
import { jointTorques } from '../src/core/mechanics';
import { forwardKinematics } from '../src/core/kinematics';
import { simulate } from '../src/core/simulation';
import { parseURDF, analyzeURDF } from '../src/core/urdf';
import { linkStrength, sectionProps, MATERIALS } from '../src/core/strength';
import { meshVolume, meshBBox, isClosed } from '../src/core/meshGeom';
import { runValidation, bars } from '../src/core/validation';
import { rapierCases } from '../src/physics/validationRapier';
import { initRapier } from '../src/physics/rapierArm';
beforeAll(async () => { await initRapier(); });
describe('Dynamique multicorps (RNEA / CRBA)', () => {
  it('RNEA statique = couples gravitaires analytiques (bras, cobot, SCARA)', () => { for (const m of [demoArm(), demoCobot(), demoScara()]) { const q = m.joints.map((_, i) => 0.2 + 0.3 * i); const a = rnea(chainFromModel(m), q, q.map(() => 0), q.map(() => 0)).tau; const b = jointTorques(m, forwardKinematics(m, q)).tau; a.forEach((x, i) => expect(x).toBeCloseTo(b[i], 9)); } });
  it('matrice de masse symétrique définie positive ; q̈ = FD(RNEA(q̈)) (aller-retour)', () => {
    const ch = chainFromModel(demoCobot()); const q = [0.1, 0.5, -0.4, 0.3, 0.2, -0.1], qd = [0.2, -0.3, 0.5, 0.1, -0.2, 0.4], qdd = [1, -2, 0.5, 3, -1, 2];
    const M = massMatrix(ch, q); M.forEach((r, i) => r.forEach((v, j) => expect(v).toBeCloseTo(M[j][i], 10))); M.forEach((r, i) => expect(r[i]).toBeGreaterThan(0));
    const tau = rnea(ch, q, qd, qdd).tau; forwardDynamics(ch, q, qd, tau).forEach((a, i) => expect(a).toBeCloseTo(qdd[i], 8));
  });
  it('cas à la main : barre en rotation pure, τ = (mL²/3 + mr²/4…) θ̈ (I_O = I_c + m(L/2)²)', () => {
    const L = 0.6, m = 2, r = 0.01; const ch = chainFromModel(bars([L], [m], 0, r)); const Ic = m * (3 * r * r + L * L) / 12; const tau = rnea(ch, [0], [0], [1], 0).tau[0];
    expect(Math.abs(tau)).toBeCloseTo(Ic + m * (L / 2) ** 2, 10);
  });
  it('conservation de l\'énergie (cobot 6 axes, 1 s)', () => { const ch = chainFromModel(demoCobot()); const q = [0, 0.5, 0.8, 0.3, 0.2, 0.1]; const s = simulateFD(ch, q, q.map(() => 0), 1, 0.001); expect(Math.abs(energy(ch, s[s.length - 1].q, s[s.length - 1].qd) - energy(ch, q, q.map(() => 0)))).toBeLessThan(1e-4); });
  it('URDF → chaîne : couples statiques = analyse URDF existante', () => {
    const u = parseURDF(readFileSync('tests/fixtures/sample_arm.urdf', 'utf8')); const ch = chainFromURDF(u); const names = ch.bodies.map((b) => b.name); const q = names.map((_, i) => 0.3 * (i + 1));
    const tau = rnea(ch, q, q.map(() => 0), q.map(() => 0)).tau; const ref = analyzeURDF(u, Object.fromEntries(names.map((n, i) => [n, q[i]]))).torques;
    names.forEach((n, i) => { const r = ref.find((x) => x.joint === n); if (r) expect(Math.abs(tau[i])).toBeCloseTo(Math.abs(r.value), 6); });
  });
  it('trajectoire : couples dynamiques et courbe couple-vitesse', () => {
    expect(availableTorque(10, 2, 1)).toBe(5); expect(availableTorque(10, 2, 3)).toBe(0);
    const m = demoArm(); const sim = simulate(m, [0, 0, 0, 0, 0], [{ q: [1, 1, 1, 0, 0], duration: 0.4 }], 0.01); const d = trajectoryDynamics(m, sim.frames); expect(d.peak[1]).toBeGreaterThan(0); expect(d.issues.length).toBeGreaterThan(0);
  });
  it('inertie de tube (formule) ', () => { const I = segmentInertia(1, 0.5, { radius: 0, section: { kind: 'tube', d: 0.04, di: 0.03 } }); expect(I[8]).toBeCloseTo((0.02 ** 2 + 0.015 ** 2) / 2, 12); });
});
describe('Résistance simplifiée', () => {
  it('propriétés de section (cas à la main)', () => { const p = sectionProps({ kind: 'plein', d: 0.02 }); expect(p.I).toBeCloseTo(Math.PI * 0.02 ** 4 / 64, 15); const t = sectionProps({ kind: 'rect', b: 0.04, h: 0.02 }); expect(t.I).toBeCloseTo(0.04 * 0.02 ** 3 / 12, 15); expect(() => sectionProps({ kind: 'tube', d: 0.02, di: 0.03 })).toThrow(); });
  it('console : flèche PL³/3EI + qL⁴/8EI ; coefficient de sécurité', () => {
    const L = 0.4, m = 0.5, P = 1, E = 70e9; const s = { kind: 'plein' as const, d: 0.02 }; const I = Math.PI * 0.02 ** 4 / 64; const r = linkStrength(bars([L], [m], P), [0], [s], [{ E, yield: 200e6 }]);
    expect(r.toolDeflection).toBeCloseTo(P * 9.81 * L ** 3 / (3 * E * I) + (m * 9.81 / L) * L ** 4 / (8 * E * I), 10); const M = 9.81 * (m * L / 2 + P * L); expect(r.links[0]!.sigma).toBeCloseTo(M * 0.01 / I, 3); expect(r.links[0]!.sf).toBeCloseTo(200e6 / r.links[0]!.vm, 6);
  });
  it('torsion détectée : segment horizontal portant un bras latéral', () => { const m = bars([0.3, 0.3], [1, 1], 1); m.joints[1].axis = [0, 0, 1] as any; const r = linkStrength(m, [0, Math.PI / 2], [{ kind: 'plein', d: 0.02 }, { kind: 'plein', d: 0.02 }], [{ E: 70e9, yield: 2e8 }, { E: 70e9, yield: 2e8 }]); expect(r.links[0]!.T).toBeGreaterThan(1); });
  it('matériau / section manquants → pas de calcul ; bibliothèque sourcée', () => { const r = linkStrength(demoArm(), [0, 0, 0, 0, 0], [null, null, null, null, null], [null, null, null, null, null]); expect(r.links.every((x) => x === null)).toBe(true); MATERIALS.forEach((x) => expect(x.source.length).toBeGreaterThan(10)); });
});
describe('Import STEP (OpenCascade WebAssembly)', () => {
  it('cube de test : maillage fermé, volume et boîte englobante', async () => {
    const init = (await import('occt-import-js')).default; const o = await init(); const r = o.ReadStepFile(new Uint8Array(readFileSync('tests/fixtures/cube.step')), { linearUnit: 'millimeter' });
    expect(r.success).toBe(true); const md = r.meshes.map((m: any) => ({ positions: m.attributes.position.array, indices: m.index.array })); const bb = meshBBox(md);
    expect(isClosed(md)).toBe(true); expect(meshVolume(md)).toBeCloseTo(bb.size[0] * bb.size[1] * bb.size[2], 3);
  }, 60000);
  it('volume d\'un tétraèdre et maillage ouvert', () => { const t = { positions: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1], indices: [0, 2, 1, 0, 1, 3, 0, 3, 2, 1, 2, 3] }; expect(meshVolume([t])).toBeCloseTo(1 / 6); expect(isClosed([t])).toBe(true); expect(isClosed([{ positions: t.positions, indices: [0, 2, 1] }])).toBe(false); });
});
describe('Suite de validation', () => {
  it('cas analytiques', () => { const v = runValidation(); v.forEach((c) => expect(c.pass, `${c.id} err=${c.err}`).toBe(true)); expect(v.length).toBeGreaterThanOrEqual(6); });
  it('cas Rapier', async () => { const v = await rapierCases(); v.forEach((c) => expect(c.pass, `${c.id} err=${c.err}`).toBe(true)); }, 60000);
});
