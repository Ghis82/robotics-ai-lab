import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseURDF, urdfFK, analyzeURDF, movable } from '../src/core/urdf';
import { solveIK } from '../src/core/ik';
import { demoArm } from '../src/core/model';
import { forwardKinematics } from '../src/core/kinematics';
import { jointTorques } from '../src/core/mechanics';
import { deltaFK, deltaIK, deltaWorkspace } from '../src/core/modules/delta';
import { syncMove, axisTime, inRange, workspaceVolume, sampleSync } from '../src/core/modules/gantry';
import { skidSteer, integratePose } from '../src/core/modules/tracked';
import { ALL_MODULES } from '../src/core/modules/catalog';
import { ROBOT_TYPES } from '../src/core/registry';
import { initRapier, RapierArm } from '../src/physics/rapierArm';
const xml = readFileSync(new URL('./fixtures/sample_arm.urdf', import.meta.url), 'utf8');
const G = 9.81, r = (d: number) => (d * Math.PI) / 180;

describe('URDF → moteur', () => {
  const m = parseURDF(xml);
  it('analyse structure, inertiels et avertissements', () => {
    expect(m.name).toBe('exemple_bras_3ddl'); expect(m.root).toBe('base_link'); expect(movable(m).map((j) => j.name)).toEqual(['j1_lacet', 'j2_epaule', 'j3_coude']);
    expect(m.links.find((l) => l.name === 'upper_arm')!.inertial!.mass).toBe(2);
    expect(m.warnings.some((w) => /tool.*masse absente/.test(w))).toBe(true); expect(m.warnings.some((w) => /j3_coude.*effort/.test(w))).toBe(true);
  });
  it('FK : outil à z = 0.75 en pose zéro, x = 0.55 épaule à 90°', () => {
    expect(urdfFK(m, {}).link.tool.p[2]).toBeCloseTo(0.75);
    const f = urdfFK(m, { j2_epaule: Math.PI / 2 }).link.tool.p; expect(f[0]).toBeCloseTo(0.55); expect(f[2]).toBeCloseTo(0.2);
  });
  it('couples gravitaires calculés à la main', () => {
    const a = analyzeURDF(m, { j2_epaule: Math.PI / 2 });
    const t2 = a.torques.find((t) => t.joint === 'j2_epaule')!; expect(Math.abs(t2.value)).toBeCloseTo(G * (2 * 0.15 + 1 * (0.3 + 0.125)), 6);
    expect(t2.ok).toBe(true); // 7.11 N·m ≤ 10
    expect(a.torques.find((t) => t.joint === 'j3_coude')!.ok).toBeNull(); // effort non déclaré
    expect(Math.abs(analyzeURDF(m, {}).torques[1].value)).toBeCloseTo(0, 9);
    expect(a.massMissing).toEqual(['tool']);
  });
  it('limites et collisions estimées', () => {
    expect(analyzeURDF(m, { j2_epaule: 2 }).limits.length).toBe(1);
    expect(analyzeURDF(m, {}).collisions).toEqual([]);
    expect(analyzeURDF(m, { j2_epaule: 1.5, j3_coude: 1.5 }).collisions.some((c) => c.b === 'sol')).toBe(true);
  });
  it('prismatique : force = m·g selon l\'axe', () => {
    const p = parseURDF(`<robot name="p"><link name="a"/><link name="b"><inertial><mass value="2"/></inertial></link><joint name="z" type="prismatic"><parent link="a"/><child link="b"/><axis xyz="0 0 1"/><limit lower="0" upper="1" effort="50"/></joint></robot>`);
    expect(analyzeURDF(p, { z: 0.5 }).torques[0].value).toBeCloseTo(2 * G); expect(urdfFK(p, { z: 0.5 }).link.b.p[2]).toBeCloseTo(0.5);
  });
});
describe('IK numérique (DLS)', () => {
  const m = demoArm();
  it('atteint une cible issue d\'une FK connue', () => {
    const qt = [r(30), r(40), r(50), r(20), 0]; const tgt = forwardKinematics(m, qt).tip;
    const s = solveIK(m, tgt, [0, 0.1, 0.1, 0.1, 0]); expect(s.reached).toBe(true); expect(s.error).toBeLessThan(1e-3);
    const tip = forwardKinematics(m, s.q).tip; tip.forEach((v, i) => expect(v).toBeCloseTo(tgt[i], 3));
    s.q.forEach((v, i) => { expect(v).toBeGreaterThanOrEqual(m.joints[i].min); expect(v).toBeLessThanOrEqual(m.joints[i].max); });
  });
  it('cible hors portée signalée', () => { const s = solveIK(m, [2, 0, 0.5], [0, 0.1, 0.1, 0.1, 0]); expect(s.reached).toBe(false); expect(s.reachable).toBe('hors portée géométrique'); });
  it('butées respectées et signalées', () => { const m2 = demoArm(); m2.joints[1].max = r(10); m2.joints[1].min = r(-10); const s = solveIK(m2, [0.6, 0, 0.25], [0, 0, 0.1, 0.1, 0]); expect(s.reached).toBe(false); expect(s.atLimit).toContain(1); });
});
describe('Delta', () => {
  const g = { f: 0.346, e: 0.115, rf: 0.2, re: 0.46 };
  it('IK puis FK redonne la cible', () => { const ik = deltaIK(g, 0.05, 0.02, -0.35)!; const fk = deltaFK(g, ...ik)!; expect(fk[0]).toBeCloseTo(0.05, 6); expect(fk[1]).toBeCloseTo(0.02, 6); expect(fk[2]).toBeCloseTo(-0.35, 6); });
  it('symétrie : angles égaux → effecteur sur l\'axe', () => { const p = deltaFK(g, 0.3, 0.3, 0.3)!; expect(p[0]).toBeCloseTo(0, 9); expect(p[1]).toBeCloseTo(0, 9); expect(p[2]).toBeLessThan(0); });
  it('hors portée', () => expect(deltaIK(g, 0, 0, -1.5)).toBeNull());
  it('espace de travail échantillonné', () => { const w = deltaWorkspace(g, r(-40), r(90), 6); expect(w.valid).toBeGreaterThan(0); expect(w.zmax).toBeLessThan(0); });
});
describe('Portique cartésien', () => {
  const ax = [{ min: 0, max: 1, vmax: 1, amax: 2 }, { min: 0, max: 0.8, vmax: 1, amax: 2 }, { min: 0, max: 0.4, vmax: 0.5, amax: 1 }];
  it('courses et volume', () => { expect(workspaceVolume(ax)).toBeCloseTo(0.32); expect(inRange(ax, [0.5, 0.9, 0.1])).toEqual([true, false, true]); });
  it('temps par axe (trapèze/triangle) et synchronisation', () => {
    expect(axisTime(0.9, 1, 2)).toBeCloseTo(1.4); expect(axisTime(0.25, 0.5, 1)).toBeCloseTo(1);
    const s = syncMove(ax, [0, 0, 0], [0.9, 0.3, 0.35]); expect(s.limiting).toBe(0); expect(s.T).toBeCloseTo(1.4);
    const smp = sampleSync(ax, [0, 0, 0], [0.9, 0.3, 0.35], 0.01); expect(smp[smp.length - 1].p).toEqual([0.9, 0.3, 0.35]);
  });
});
describe('Chenilles (skid-steer)', () => {
  it('sans glissement = différentiel ; χ réduit le lacet', () => { const a = skidSteer(0.5, 0.8, 0.5, 1), b = skidSteer(0.5, 0.8, 0.5, 2); expect(a.w).toBeCloseTo(0.6); expect(b.w).toBeCloseTo(0.3); expect(a.v).toBeCloseTo(0.65); expect(() => skidSteer(1, 1, 0.5, 0.5)).toThrow(); });
  it('intégration : cercle complet revient au départ', () => { const p = integratePose(1, 1, 2 * Math.PI, 0.0005); expect(Math.hypot(p.x, p.y)).toBeLessThan(0.01); });
});
describe('Modules et badges', () => {
  it('Delta, portique, chenilles activés avec modules testés', () => {
    for (const id of ['delta', 'gantry', 'tracked']) { const t = ROBOT_TYPES.find((x) => x.id === id)!; expect(t.modules.length).toBe(1); expect(ALL_MODULES[t.modules[0]]).toBeTruthy(); expect(t.capabilities.cinematique).not.toBe('À développer'); }
  });
});
describe('Rapier (expérimental) vs analytique', () => {
  beforeAll(async () => { await initRapier(); });
  it('les couples statiques analytiques maintiennent le bras immobile dans Rapier (et 80 % ne suffisent pas)', () => {
    const q = [0, r(60), r(30), r(20), 0];
    const drift = (f: number) => { const m = demoArm(); m.obstacles = []; const tau = jointTorques(m, forwardKinematics(m, q)).tau.map((t) => t * f);
      const sim = new RapierArm(m, q, { stiffness: 0, damping: 0, dt: 1 / 480, motors: false }); const s = sim.run(0.3, undefined, () => tau); const d = Math.max(...s[s.length - 1].q.map((v, i) => Math.abs(v - q[i]))); sim.free(); return d; };
    const d1 = drift(1), d08 = drift(0.8), d12 = drift(1.2); expect(d1).toBeLessThan(d08 / 5); expect(d1).toBeLessThan(d12 / 5); expect(d1).toBeLessThan(r(1.5));
  });
  it('sans moteurs, le bras tombe (gravité active)', () => {
    const m = demoArm(); m.obstacles = []; const sim = new RapierArm(m, [0, r(60), 0, 0, 0], { stiffness: 0, damping: 0, dt: 1 / 240, motors: false });
    const s = sim.run(0.3); expect(s[s.length - 1].q[1]).toBeGreaterThan(r(62)); sim.free();
  });
});
