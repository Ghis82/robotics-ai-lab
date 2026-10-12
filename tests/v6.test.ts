import { describe, it, expect, beforeAll } from 'vitest';
import { demoScara, demoCobot, demoArm } from '../src/core/model';
import { forwardKinematics } from '../src/core/kinematics';
import { jointTorques } from '../src/core/mechanics';
import { simulate } from '../src/core/simulation';
import { analyze, cobotChecks } from '../src/core/analysis';
import { scaraFK } from '../src/core/modules/scara';
import { initRapier, RapierArm } from '../src/physics/rapierArm';
import { simulateGrip } from '../src/physics/rapierGripper';
import { runMission, compareN } from '../src/core/modules/swarmMission';
import { ALL_MODULES } from '../src/core/modules/catalog';
import { wordsToDigits } from '../src/core/nlpNumbers';
import { parseRequest } from '../src/core/nlp';
import { assist } from '../src/core/assistant';
import { makeProject, validateProject, PROJECT_VERSION } from '../src/core/project';
import { defaultValues } from '../src/core/modules/types';
import { ROBOT_TYPES } from '../src/core/registry';
const r = (d: number) => (d * Math.PI) / 180;
beforeAll(async () => { await initRapier(); });

describe('Pince dans Rapier vs analytique', () => {
  const req = (1 * (9.81 + 2)) / (2 * 0.5);
  it('tient au-dessus du seuil analytique, glisse en dessous', () => {
    const hi = simulateGrip({ boxMass: 1, box: [0.03, 0.03, 0.05], mu: 0.5, fingerForce: 1.5 * req, liftAccel: 2 }); expect(hi.required).toBeCloseTo(req); expect(hi.held).toBe(true);
    const lo = simulateGrip({ boxMass: 1, box: [0.03, 0.03, 0.05], mu: 0.5, fingerForce: 0.6 * req, liftAccel: 2 }); expect(lo.held).toBe(false);
  });
  it('effort constant : μ plus faible → glissement', () => { expect(simulateGrip({ boxMass: 1, box: [0.03, 0.03, 0.05], mu: 0.8, fingerForce: 10, liftAccel: 1 }).held).toBe(true); expect(simulateGrip({ boxMass: 1, box: [0.03, 0.03, 0.05], mu: 0.3, fingerForce: 10, liftAccel: 1 }).held).toBe(false); });
});
describe('SCARA et cobot dans le pipeline bras', () => {
  it('SCARA : FK du pipeline = FK SCARA analytique, couples gravitaires nuls (axes verticaux)', () => {
    const m = demoScara(); const q = [r(30), r(45), 0]; const fk = forwardKinematics(m, q); const s = scaraFK(0.25, 0.2, q[0], q[1]);
    expect(fk.segments[1][1][0]).toBeCloseTo(s.x); expect(fk.segments[1][1][1]).toBeCloseTo(s.y); expect(fk.tip[2]).toBeCloseTo(0.4 - 0.15);
    jointTorques(m, fk).tau.forEach((t) => expect(t).toBeCloseTo(0, 9));
    const sim = new RapierArm(m, q, { stiffness: 0, damping: 0, dt: 1 / 240, motors: false }); sim.gravityTorquesFromEngine().forEach((t) => expect(t).toBeCloseTo(0, 6)); sim.free();
  });
  it('SCARA Rapier : limite de couple → suivi dégradé', () => {
    const track = (tq: number) => { const m = demoScara(); m.obstacles = []; m.joints[0].motor!.maxTorque = tq; const sm = simulate(m, [0, 0, 0], [{ q: [r(90), 0, 0], duration: 0.5 }], 0.01);
      const ra = new RapierArm(m, [0, 0, 0], { stiffness: 20000, damping: 400, dt: 1 / 480, motors: true }); const s = ra.run(0.5, (t) => sm.frames[Math.min(sm.frames.length - 1, Math.round(t / 0.01))].q); ra.free();
      return Math.max(...s.map((x) => Math.abs(x.q[0] - sm.frames[Math.min(sm.frames.length - 1, Math.round(x.t / 0.01))].q[0]))); };
    const good = track(15), weak = track(0.3); expect(weak).toBeGreaterThan(5 * good); expect(weak).toBeGreaterThan(r(10));
  });
  it('SCARA Rapier : contact avec obstacle rapporté', () => {
    const m = demoScara(); m.obstacles = [{ name: 'Obstacle (sphère)', center: [0.4, 0, 0.4], radius: 0.05 }]; const ra = new RapierArm(m, [0, 0, 0], { stiffness: 0, damping: 0, dt: 1 / 240, motors: false });
    const s = ra.run(0.05); expect(s.some((x) => x.pairs.some((p) => p.includes('Obstacle')))).toBe(true); ra.free();
  });
  it('cobot : les couples statiques analytiques maintiennent la pose dans Rapier', () => {
    const q = [0, r(50), r(40), r(20), 0, r(10)]; const drift = (f: number) => { const m = demoCobot(); m.obstacles = []; const tau = jointTorques(m, forwardKinematics(m, q)).tau.map((t) => t * f);
      const s = new RapierArm(m, q, { stiffness: 0, damping: 0, dt: 1 / 480, motors: false }); const o = s.run(0.3, undefined, () => tau); s.free(); return Math.max(...o[o.length - 1].q.map((v, i) => Math.abs(v - q[i]))); };
    expect(drift(1)).toBeLessThan(drift(0.8) / 5);
  });
  it('cobot : vitesse TCP calculée et seuils déclarés', () => {
    const m = demoCobot(); const sm = simulate(m, [0, r(30), r(30), 0, 0, 0], [{ q: [r(90), r(30), r(30), 0, 0, 0], duration: 1 }], 0.01);
    const c = cobotChecks(m, sm); const R = Math.hypot(...forwardKinematics(m, [0, r(30), r(30), 0, 0, 0]).tip.slice(0, 2) as [number, number]);
    expect(c.vmax).toBeCloseTo(R * (Math.PI / 2) * 1.875, 1); // vitesse max quintique = 1,875·Δθ/T
    expect(c.fmax).toBeGreaterThan(0);
    let an = analyze(m, sm); expect(an.anomalies.some((a) => a.id === 'cobot-v-miss')).toBe(true); expect(an.anomalies.some((a) => a.id === 'cobot-norm')).toBe(true);
    m.cobotLimits = { tcpSpeed: 0.25, contactForce: 10 }; an = analyze(m, sm); expect(an.anomalies.find((a) => a.id === 'cobot-v')!.nature).toBe('calculé'); expect(an.anomalies.find((a) => a.id === 'cobot-f')!.nature).toBe('estimé');
  });
  it('bras démo inchangé (non-régression de la direction des segments)', () => { expect(forwardKinematics(demoArm(), [0, 0, 0, 0, 0]).tip[2]).toBeCloseTo(0.95); });
});
describe('Essaim : missions', () => {
  const base = { size: 20, radius: 0.2, sep: 1, vmax: 1, obstacles: [{ x: 11, y: 6, r: 2 }, { x: 6, y: 13, r: 1.5 }], Tmax: 200 };
  it('rendez-vous accompli sans collision', () => { const m = runMission({ ...base, n: 10, mission: 'rendezvous', goalR: 2.5 }); expect(m.completed).toBe(true); expect(m.agentCollisions).toBe(0); expect(m.minSep).toBeGreaterThan(0.4); });
  it('couverture : progression et achèvement', () => { const m = runMission({ ...base, n: 8, mission: 'couverture', coverTarget: 0.8 }); expect(m.completed).toBe(true); expect(m.coverage).toBeGreaterThanOrEqual(0.8); });
  it('obstacle sur la route : cible dans un obstacle et séparation quasi nulle : contacts obstacle comptés', () => { const m = runMission({ ...base, sep: 0.01, n: 10, mission: 'rendezvous', goalR: 1, obstacles: [{ x: 10, y: 10, r: 3 }], Tmax: 60 }); expect(m.obstacleCollisions).toBeGreaterThan(0); }); // agents ponctuels sans contrainte dure : l'interpénétration est détectée, pas empêchée
  it('comparaison de N : plus d\'agents → couverture plus rapide', () => { const c = compareN({ ...base, mission: 'couverture', coverTarget: 0.8 }, [4, 16]); expect(c[1].time!).toBeLessThan(c[0].time!); });
  it('module exécuté avec valeurs de démo', () => { const res = ALL_MODULES['swarm-mission'].run(Object.fromEntries(Object.entries(defaultValues(ALL_MODULES['swarm-mission'])).map(([k, v]) => [k, v.value]))); expect(res.results.length).toBeGreaterThan(5); });
});
describe('Analyse du français élargie', () => {
  it('nombres en lettres', () => { expect(wordsToDigits('vingt-cinq robots')).toBe('25 robots'); expect(wordsToDigits('deux cents grammes')).toBe('200 grammes'); expect(wordsToDigits('un virgule cinq kg')).toBe('1.5 kg'); expect(wordsToDigits('quatre-vingt-dix')).toBe('90'); expect(wordsToDigits('deux et demi')).toBe('2.5'); expect(wordsToDigits('un bras')).toBe('un bras'); expect(wordsToDigits('mille deux cents')).toBe('1200'); });
  it('unités', () => { const p = parseRequest('Pince de 30 N pour une pièce de 250 g, couple 1,5 Nm, rayon 30 cm, vitesse 3,6 km/h'); expect(p.params.payloadMass).toBeCloseTo(0.25); expect(p.params.force).toBe(30); expect(p.params.torque).toBe(1.5); expect(p.params.length).toBeCloseTo(0.3); expect(p.params.speed).toBeCloseTo(1); expect(parseRequest('segment de 120 mm').params.length).toBeCloseTo(0.12); });
  it('synonymes', () => { expect(parseRequest('Configure un AGV pour la logistique').type!.id).toBe('wheeled'); expect(parseRequest('Simule un quadricoptère').type!.id).toBe('multirotor'); expect(parseRequest('teste un manipulateur').type!.id).toBe('arm'); expect(parseRequest('un engin sous-marin').type!.id).toBe('rov'); });
  it('comparaison remplissant deux configurations', () => {
    const a = assist('Compare un drone de 1,2 kg et un drone de 2 kg', { acceptDemo: true }); expect(a.parsed.params.massA).toBe(1.2); expect(a.parsed.params.massB).toBe(2);
    expect(a.comparison!.configs).toEqual(['A', 'B']); const tw = a.comparison!.results.find((x) => x.label === 'Rapport poussée/poids')!; expect(tw.values[0]).toBe((36 / (1.2 * 9.81)).toFixed(2)); expect(tw.values[1]).toBe((36 / (2 * 9.81)).toFixed(2));
  });
  it('mission essaim (rendez-vous) et trajet planificateur', () => {
    const s = assist('Fais un rendez-vous avec un essaim de vingt robots', { acceptDemo: true }); expect(s.moduleId).toBe('swarm-mission'); expect(s.values!.n).toEqual({ value: 20, src: 'utilisateur' }); expect(s.values!.mission.value).toBe(1); expect(s.executed).toBe(true);
    const c = assist('Robot à roues : couverture d\'un entrepôt'); expect(c.parsed.mission!.kind).toBe('couverture');
    const t = assist('Planifie le trajet du robot à roues de (1 ; 1) à (8 ; 5)', { acceptDemo: true }); expect(t.moduleId).toBe('nav-grid'); expect(t.values!.gx).toEqual({ value: 8, src: 'utilisateur' }); expect(t.executed).toBe(true);
  });
  it('phrases de référence inchangées', () => { expect(assist('Simule un bras qui déplace un objet de deux kilogrammes').values!.mass.value).toBe(2); expect(assist('Configure un robot à roues pour inspecter un entrepôt').moduleId).toBe('nav-grid'); });
});
describe('Projet : sauvegarde / chargement', () => {
  const proj = () => makeProject({ name: 'Test', arm: { model: demoArm(), poses: [{ q: [0, 0, 0, 0, 0], duration: 0 }, { q: [10, 20, 30, 0, 0], duration: 2 }] }, modules: { gripper: defaultValues(ALL_MODULES.gripper) }, planner: { w: 10, h: 10, res: 0.1, occupied: [1, 2, 3], start: [0, 0], goal: [9, 9], params: { robotR: 0.3 } }, history: [] });
  it('aller-retour JSON', () => { const p = proj(); const v = validateProject(JSON.parse(JSON.stringify(p))); expect(v.ok).toBe(true); if (v.ok) { expect(v.project.arm!.model.links[1].length).toBe(0.3); expect(v.project.version).toBe(PROJECT_VERSION); expect(v.project.modules.gripper.mu.src).toBe('manquant'); } });
  it('rejets : schéma, version future, données invalides', () => {
    expect(validateProject({ schema: 'autre', version: 1 }).ok).toBe(false);
    expect(validateProject({ ...proj(), version: 99 }).ok).toBe(false);
    const bad = proj(); bad.arm!.model.joints[0].min = 5; bad.arm!.model.joints[0].max = 1; const r1 = validateProject(JSON.parse(JSON.stringify(bad))); expect(r1.ok).toBe(false);
    const bad2: any = proj(); bad2.modules.gripper.mass = { value: 'abc', src: 'utilisateur' }; expect(validateProject(bad2).ok).toBe(false);
    const bad3: any = proj(); bad3.planner.occupied = [500]; expect(validateProject(bad3).ok).toBe(false);
    expect(validateProject(null).ok).toBe(false);
  });
  it('migration v1 → v2 et corrections signalées', () => {
    const v1: any = { ...proj(), version: 1 }; delete v1.planner; delete v1.name; v1.modules.gripper.mass = { value: null, src: 'démo' }; v1.modules.inconnu = {};
    const v = validateProject(v1); expect(v.ok).toBe(true); if (v.ok) { expect(v.project.version).toBe(2); expect(v.project.planner).toBeNull(); expect(v.project.modules.gripper.mass.src).toBe('manquant'); expect(v.warnings.some((w) => /inconnu/.test(w))).toBe(true); }
  });
});
describe('Registre v0.6', () => { it('SCARA/cobot reliés au pipeline bras, essaim missions', () => { expect(ROBOT_TYPES.find((t) => t.id === 'scara')!.armModel).toBe('scara'); expect(ROBOT_TYPES.find((t) => t.id === 'cobot')!.armModel).toBe('cobot'); expect(ROBOT_TYPES.find((t) => t.id === 'swarm')!.modules).toContain('swarm-mission'); }); });
