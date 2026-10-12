import { describe, it, expect } from 'vitest';
import { demoArm } from '../src/core/model';
import { forwardKinematics, checkJointLimits } from '../src/core/kinematics';
import { segmentSegmentDistance, pointSegmentDistance, detectCollisions } from '../src/core/collision';
import { jointTorques, centerOfMass, tippingMargin, G } from '../src/core/mechanics';
import { quintic, buildTrajectory } from '../src/core/trajectory';
import { simulate } from '../src/core/simulation';
import { analyze } from '../src/core/analysis';
import { reportJSON, reportMarkdown, DISCLAIMER } from '../src/core/report';
const r = (d: number) => (d * Math.PI) / 180;
const Z = [0, 0, 0, 0, 0];

describe('Cinématique directe', () => {
  it('pose zéro : bras vertical', () => {
    const m = demoArm(); const fk = forwardKinematics(m, Z);
    expect(fk.tip[0]).toBeCloseTo(0); expect(fk.tip[2]).toBeCloseTo(0.12 + 0.1 + 0.3 + 0.25 + 0.08 + 0.1);
  });
  it('épaule à +90° : bras horizontal le long de +X', () => {
    const m = demoArm(); const fk = forwardKinematics(m, [0, r(90), 0, 0, 0]);
    expect(fk.tip[0]).toBeCloseTo(0.73); expect(fk.tip[1]).toBeCloseTo(0); expect(fk.tip[2]).toBeCloseTo(0.22);
  });
  it('base à 90° puis épaule 90° : bras le long de +Y', () => {
    const m = demoArm(); const fk = forwardKinematics(m, [r(90), r(90), 0, 0, 0]);
    expect(fk.tip[0]).toBeCloseTo(0); expect(fk.tip[1]).toBeCloseTo(0.73);
  });
  it('coude à -90° après épaule +90° : avant-bras vertical', () => {
    const m = demoArm(); const fk = forwardKinematics(m, [0, r(90), r(-90), 0, 0]);
    expect(fk.segments[2][1][0]).toBeCloseTo(0.3); expect(fk.segments[2][1][2]).toBeCloseTo(0.22 + 0.25);
  });
});
describe('Limites articulaires', () => {
  it('détecte un dépassement', () => {
    const m = demoArm(); expect(checkJointLimits(m, [0, r(95), 0, 0, 0]).map((v) => v.joint)).toEqual([1]);
    expect(checkJointLimits(m, [0, r(90), 0, 0, 0])).toEqual([]);
  });
});
describe('Distances de collision', () => {
  it('segments parallèles', () => expect(segmentSegmentDistance([0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0])).toBeCloseTo(1));
  it('segments croisés non coplanaires', () => expect(segmentSegmentDistance([-1, 0, 0], [1, 0, 0], [0, -1, 2], [0, 1, 2])).toBeCloseTo(2));
  it('extrémités les plus proches', () => expect(segmentSegmentDistance([0, 0, 0], [1, 0, 0], [3, 0, 0], [4, 0, 0])).toBeCloseTo(2));
  it('segments sécants', () => expect(segmentSegmentDistance([-1, 0, 0], [1, 0, 0], [0, -1, 0], [0, 1, 0])).toBeCloseTo(0));
  it('point-segment', () => expect(pointSegmentDistance([0.5, 3, 0], [0, 0, 0], [1, 0, 0])).toBeCloseTo(3));
  it('collision avec le sol détectée quand le bras plonge', () => {
    const m = demoArm(); m.obstacles = [];
    const c = detectCollisions(m, forwardKinematics(m, [0, r(90), r(90), 0, 0]));
    expect(c.some((x) => x.kind === 'sol')).toBe(true);
  });
  it('pose verticale : aucune collision', () => { const m = demoArm(); expect(detectCollisions(m, forwardKinematics(m, Z))).toEqual([]); });
  it('auto-collision bras replié', () => {
    const m = demoArm(); m.obstacles = [];
    const c = detectCollisions(m, forwardKinematics(m, [0, r(-30), r(135), r(110), 0]));
    expect(c.some((x) => x.kind === 'auto')).toBe(true);
  });
});
describe('Couples gravitaires (cas calculés à la main)', () => {
  it('tige seule horizontale : m·g·L/2', () => {
    const m = demoArm(); m.links.forEach((l, i) => (l.mass = i === 1 ? 1.5 : 0)); m.payload.mass = 0;
    const { tau } = jointTorques(m, forwardKinematics(m, [0, r(90), 0, 0, 0]));
    expect(Math.abs(tau[1])).toBeCloseTo(1.5 * G * 0.15, 6); expect(tau[0]).toBeCloseTo(0, 9);
  });
  it('bras complet horizontal avec charge', () => {
    const m = demoArm(); const { tau } = jointTorques(m, forwardKinematics(m, [0, r(90), 0, 0, 0]));
    const exp = G * (1.5 * 0.15 + 0.9 * (0.3 + 0.125) + 0.3 * (0.55 + 0.04) + 0.4 * (0.63 + 0.05) + 0.5 * 0.73);
    expect(Math.abs(tau[1])).toBeCloseTo(exp, 6);
    expect(Math.abs(tau[2])).toBeCloseTo(G * (0.9 * 0.125 + 0.3 * 0.29 + 0.4 * 0.38 + 0.5 * 0.43), 6);
  });
  it('bras vertical : couple nul', () => { const m = demoArm(); jointTorques(m, forwardKinematics(m, Z)).tau.forEach((t) => expect(t).toBeCloseTo(0, 9)); });
  it('masse manquante signalée comme incomplète', () => { const m = demoArm(); m.links[2].mass = null; expect(jointTorques(m, forwardKinematics(m, Z)).complete).toBe(false); });
  it('centre de masse et basculement', () => {
    const m = demoArm(); const cm = centerOfMass(m, forwardKinematics(m, Z))!;
    expect(cm.com[0]).toBeCloseTo(0); expect(tippingMargin(m, cm.com)).toBeCloseTo(0.12);
    const h = centerOfMass(m, forwardKinematics(m, [0, r(90), 0, 0, 0]))!;
    const x = (1.5 * 0.15 + 0.9 * 0.425 + 0.3 * 0.59 + 0.4 * 0.68 + 0.5 * 0.73) / (4 + 1.2 + 1.5 + 0.9 + 0.3 + 0.4 + 0.5);
    expect(h.com[0]).toBeCloseTo(x, 6);
  });
});
describe('Trajectoire quintique', () => {
  it('conditions aux limites', () => {
    expect(quintic(0, 2).s).toBe(0); expect(quintic(2, 2).s).toBe(1); expect(quintic(1, 2).s).toBeCloseTo(0.5);
    expect(quintic(0, 2).ds).toBe(0); expect(quintic(2, 2).ds).toBeCloseTo(0); expect(quintic(2, 2).dds).toBeCloseTo(0);
    expect(quintic(1, 2).ds).toBeCloseTo(1.875 / 2);
  });
  it('enchaînement de poses', () => {
    const tr = buildTrajectory([0], [{ q: [1], duration: 1 }, { q: [-1], duration: 1 }], 0.1);
    expect(tr.length).toBe(21); expect(tr[10].q[0]).toBeCloseTo(1); expect(tr[20].q[0]).toBeCloseTo(-1); expect(tr[20].t).toBeCloseTo(2);
  });
  it('couple dynamique estimé : masse ponctuelle en rotation, τ = m·r²·θ̈', () => {
    const m = demoArm(); m.links.forEach((l) => (l.mass = 0)); m.payload.mass = 1;
    const q1 = [r(90), r(90), 0, 0, 0];
    const s = simulate(m, [0, r(90), 0, 0, 0], [{ q: q1, duration: 2 }], 0.001);
    const f = s.frames[500]; const dds = quintic(0.5, 2).dds * r(90);
    expect(f.tauDynamic[0]).toBeCloseTo(1 * 0.73 ** 2 * dds, 3);
    expect(f.tauStatic[0]).toBeCloseTo(0, 9);
  });
});
describe('Analyse et rapport', () => {
  it('signale couple insuffisant, données manquantes, sans inventer', () => {
    const m = demoArm(); m.joints[1].motor!.maxTorque = 1;
    const an = analyze(m, simulate(m, Z, [{ q: [0, r(80), 0, 0, 0], duration: 2 }]));
    expect(an.anomalies.some((a) => a.id === 'tq-s-1' && a.nature === 'calculé')).toBe(true);
    expect(an.anomalies.some((a) => a.id === 'miss-joints.4.motor')).toBe(true);
    expect(an.anomalies.some((a) => a.id === 'miss-links.0.material')).toBe(true);
  });
  it('rapport contient l\'avertissement', () => {
    const m = demoArm(); const s = simulate(m, Z, [{ q: [0, r(30), 0, 0, 0], duration: 1 }]); const an = analyze(m, s);
    expect(reportMarkdown(m, s, an)).toContain(DISCLAIMER); expect(reportJSON(m, s, an).avertissement).toBe(DISCLAIMER);
  });
});
