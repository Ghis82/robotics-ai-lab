import { describe, it, expect, beforeAll } from 'vitest';
import { demoArm } from '../src/core/model';
import { forwardKinematics } from '../src/core/kinematics';
import { jointTorques } from '../src/core/mechanics';
import { solveIK6, orientationError } from '../src/core/ik6';
import { axisAngle } from '../src/core/math';
import { legFK, legIK, crawlGait, lipmZMP, bipedSwayZMP } from '../src/core/modules/legged';
import { mix, forcesMoments, stepQuad, simulateQuad, G } from '../src/core/modules/quadrotor';
import { ALL_MODULES } from '../src/core/modules/catalog';
import { defaultValues } from '../src/core/modules/types';
import { compareConfigs, toCSV } from '../src/core/compare';
import { ROBOT_TYPES } from '../src/core/registry';
import { initRapier, RapierArm } from '../src/physics/rapierArm';
const r = (d: number) => (d * Math.PI) / 180;

describe('Rapier v0.4', () => {
  beforeAll(async () => { await initRapier(); });
  it('relecture des couples gravitaires depuis les masses/CdM du moteur = analytique', () => {
    const m = demoArm(); const q = [r(20), r(60), r(30), r(20), 0]; const sim = new RapierArm(m, q, { stiffness: 0, damping: 0, dt: 1 / 240, motors: false });
    const a = jointTorques(m, forwardKinematics(m, q)).tau; const b = sim.gravityTorquesFromEngine();
    a.forEach((t, i) => expect(Math.abs(b[i])).toBeCloseTo(Math.abs(t), 3)); sim.free();
  });
  it('couple moteur déclaré trop faible → le bras ne tient pas ; suffisant → tient', () => {
    const q = [0, r(60), r(30), r(20), 0];
    const run = (shoulder: number) => { const m = demoArm(); m.obstacles = []; m.joints[1].motor!.maxTorque = shoulder; const need = Math.abs(jointTorques(m, forwardKinematics(m, q)).tau[1]);
      const sim = new RapierArm(m, q, { stiffness: 20000, damping: 400, dt: 1 / 480, motors: true }); const s = sim.run(1.5); const e = Math.abs(s[s.length - 1].q[1] - q[1]); sim.free(); return { e, need }; };
    const ok = run(25), weak = run(2); expect(weak.need).toBeGreaterThan(2); expect(ok.e).toBeLessThan(r(5)); expect(weak.e).toBeGreaterThan(r(15)); expect(weak.e).toBeGreaterThan(5 * ok.e);
  });
  it('moteur non déclaré → articulation non motorisée (signalée)', () => { const m = demoArm(); const sim = new RapierArm(m, [0, 0, 0, 0, 0]); expect(sim.unpowered).toEqual([4]); sim.free(); });
  it('obstacle sphérique inclus et contact rapporté', () => {
    const m = demoArm(); m.obstacles = [{ name: 'Obstacle (sphère)', center: [0.45, 0, 0.22], radius: 0.06 }];
    const sim = new RapierArm(m, [0, r(90), 0, 0, 0], { stiffness: 0, damping: 0, dt: 1 / 240, motors: false }); const s = sim.run(0.1);
    expect(s.some((x) => x.pairs.some((p) => p.includes('Obstacle')))).toBe(true); sim.free();
  });
});
describe('IK 6D', () => {
  const m = demoArm();
  it('atteint position ET orientation issues d\'une FK', () => {
    const qt = [r(20), r(30), r(40), r(30), r(45)]; const fk = forwardKinematics(m, qt); const Rd = fk.frames[4].R;
    const s = solveIK6(m, fk.tip, Rd, [0, 0.1, 0.1, 0.1, 0]); expect(s.reached).toBe(true); expect(s.posError).toBeLessThan(1e-3); expect(s.oriError).toBeLessThan(1e-2);
  });
  it('erreur d\'orientation nulle pour R = Rd, et ≈ angle pour une petite rotation', () => {
    const R = axisAngle([0, 0, 1], 0.3); expect(orientationError(R, R).every((x) => Math.abs(x) < 1e-12)).toBe(true);
    const e = orientationError(axisAngle([1, 0, 0], 0), axisAngle([1, 0, 0], 0.01)); expect(e[0]).toBeCloseTo(0.01, 5);
  });
  it('orientation inatteignable (5 axes) : compromis signalé', () => {
    const fk = forwardKinematics(m, [0, r(30), r(30), 0, 0]); const s = solveIK6(m, fk.tip, axisAngle([1, 0, 0], r(90)), [0, 0.1, 0.1, 0.1, 0]);
    expect(s.reached).toBe(false); expect(s.note).toMatch(/5 axes/);
  });
});
describe('Jambes', () => {
  it('IK puis FK (3 DDL)', () => { for (const p of [[0.05, 0.08, -0.3], [-0.06, 0.02, -0.33], [0, 0.05, -0.25]] as [number, number, number][]) { const s = legIK(0.2, 0.2, 0.05, p)!; const f = legFK(0.2, 0.2, 0.05, ...s); f.forEach((v, i) => expect(v).toBeCloseTo(p[i], 9)); } });
  it('jambe plane 2 DDL : cas à la main (tendue, genou 90°)', () => { expect(legFK(0.2, 0.2, 0, 0, 0, 0)[2]).toBeCloseTo(-0.4); const p = legFK(0.2, 0.2, 0, 0, 0, Math.PI / 2); expect(p[0]).toBeCloseTo(-0.2); expect(p[2]).toBeCloseTo(-0.2); expect(legIK(0.2, 0.2, 0, [0, 0, -0.5])).toBeNull(); });
  it('allure rampante : sans déplacement du CdM la marge est nulle/négative ; avec déplacement positive', () => {
    expect(Math.min(...crawlGait(0.5, 0.3, 0.1, 0).map((p) => p.margin))).toBeLessThanOrEqual(1e-9);
    expect(Math.min(...crawlGait(0.5, 0.3, 0.1, 0.9).map((p) => p.margin))).toBeGreaterThan(0);
    expect(crawlGait(0.5, 0.3, 0.1, 0.9).length).toBe(4);
  });
  it('ZMP LIPM : p = c − (z/g)c̈ ; amplitude analytique', () => {
    expect(lipmZMP(0.05, -2, 0.8)).toBeCloseTo(0.05 + 0.8 * 2 / 9.81);
    const z = bipedSwayZMP({ A: 0.05, Ts: 0.6, zc: 0.8, stance: 0.2, footW: 0.1, footL: 0.2, steps: 2, dt: 0.001 });
    expect(Math.max(...z.zmp)).toBeCloseTo(0.05 * (1 + (0.8 / 9.81) * (Math.PI / 0.6) ** 2), 3);
  });
});
describe('Quadrirotor', () => {
  const q = { mass: 1.2, L: 0.2, c: 0.016, Ixx: 0.012, Iyy: 0.012, Izz: 0.022, Tmax: 6 };
  it('mélangeur inverse exact', () => { const T = mix(q, 12, 0.1, -0.05, 0.01); const fm = forcesMoments(q, T); expect(fm.T).toBeCloseTo(12); expect(fm.tau[0]).toBeCloseTo(0.1); expect(fm.tau[1]).toBeCloseTo(-0.05); expect(fm.tau[2]).toBeCloseTo(0.01); });
  it('chute libre et stationnaire en boucle ouverte', () => {
    let s = { p: [0, 0, 10] as [number, number, number], v: [0, 0, 0] as [number, number, number], R: [1, 0, 0, 0, 1, 0, 0, 0, 1], w: [0, 0, 0] as [number, number, number] };
    let h = { ...s }; for (let k = 0; k < 1000; k++) { s = stepQuad(q, s, [0, 0, 0, 0], 0.001); h = stepQuad(q, h, [q.mass * G / 4, q.mass * G / 4, q.mass * G / 4, q.mass * G / 4], 0.001); }
    expect(s.p[2]).toBeCloseTo(10 - G / 2, 1); expect(h.p[2]).toBeCloseTo(10, 9);
  });
  it('moment de roulis → ω̇x = τx / Ixx', () => { const T = mix(q, q.mass * G, 0.012, 0, 0); const s = stepQuad(q, { p: [0, 0, 5], v: [0, 0, 0], R: [1, 0, 0, 0, 1, 0, 0, 0, 1], w: [0, 0, 0] }, T, 0.001); expect(s.w[0]).toBeCloseTo(1 * 0.001, 9); });
  it('PID : atteint le point de passage', () => { const sim = simulateQuad(q, [{ p: [0, 0, 3], t: 0 }, { p: [2, 0, 3], t: 5 }], 12); expect(Math.hypot(sim.final.p[0] - 2, sim.final.p[2] - 3)).toBeLessThan(0.1); });
  it('saturation détectée si Tmax trop faible', () => { const sim = simulateQuad({ ...q, Tmax: 3.2 }, [{ p: [0, 0, 3], t: 0 }], 4); expect(sim.saturationRatio).toBeGreaterThan(0.05); });
  it('module : inerties et k_m/k_f obligatoires', () => { const m = ALL_MODULES.quadrotor; const res = m.params.filter((p) => p.required && p.demo == null).map((p) => p.key); expect(res).toEqual(['c', 'Ixx', 'Iyy', 'Izz']); });
});
describe('Comparateur', () => {
  it('N configurations, tableau et CSV', () => {
    const m = ALL_MODULES['gripper']; const mk = (mu: number, mass: number) => { const v = defaultValues(m); v.mu = { value: mu, src: 'utilisateur' }; v.mass = { value: mass, src: 'utilisateur' }; return v; };
    const t = compareConfigs(m, [{ name: 'A', values: mk(0.5, 2) }, { name: 'B', values: mk(0.8, 2) }, { name: 'C', values: defaultValues(m) }]);
    expect(t.configs).toEqual(['A', 'B', 'C']); const row = t.results.find((x) => x.label === 'Effort de serrage minimal')!;
    expect(row.values[0]).toBe((2 * (9.81 + 2) / (2 * 0.5)).toFixed(1)); expect(row.values[2]).toBeNull(); expect(t.ok).toEqual([true, true, false]);
    const csv = toCSV(t); expect(csv.split('\n')[0]).toBe('"Élément";"Nature";"A";"B";"C"'); expect(csv).toContain('NON RENSEIGNÉ');
  });
});
describe('Registre v0.4', () => {
  it('modules jambes et quadrirotor activés', () => {
    expect(ROBOT_TYPES.find((t) => t.id === 'quadruped')!.modules).toContain('quad-gait'); expect(ROBOT_TYPES.find((t) => t.id === 'biped')!.modules).toContain('biped-zmp'); expect(ROBOT_TYPES.find((t) => t.id === 'multirotor')!.modules).toContain('quadrotor');
    ROBOT_TYPES.forEach((t) => t.modules.forEach((m) => expect(ALL_MODULES[m]).toBeTruthy()));
  });
});
