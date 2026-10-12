import { describe, it, expect } from 'vitest';
import { scaraFK, scaraIK, scaraWorkspace } from '../src/core/modules/scara';
import { diffDrive, wheelSpeedsFor, trapezoid, frictionAccelLimit, pathCollisions, pathLength, wheelTorqueRequired } from '../src/core/modules/mobile';
import { convexHull, stabilityMargin } from '../src/core/modules/balance';
import { thrustToWeight, hoverThrottle, verticalClimb } from '../src/core/modules/aerial';
import { buoyancy, netBuoyancy, terminalSpeed, RHO_FRESH } from '../src/core/modules/aquatic';
import { requiredGripForce } from '../src/core/modules/gripper';
import { initSwarm, step, minSeparation, collisions } from '../src/core/modules/swarm';
import { ALL_MODULES } from '../src/core/modules/catalog';
import { defaultValues, runModule } from '../src/core/modules/types';
import { FAMILIES, ROBOT_TYPES, searchTypes } from '../src/core/registry';
import { parseRequest } from '../src/core/nlp';
const d = (r: number) => (r * 180) / Math.PI;

describe('SCARA', () => {
  it('IK puis FK retrouve la cible (2 solutions)', () => {
    const s = scaraIK(1, 1, 1, 1); expect(s.length).toBe(2);
    expect(s.map((x) => [Math.round(d(x.t1)), Math.round(d(x.t2))]).sort()).toEqual([[0, 90], [90, -90]].sort());
    s.forEach((x) => { const f = scaraFK(1, 1, x.t1, x.t2); expect(f.x).toBeCloseTo(1); expect(f.y).toBeCloseTo(1); });
  });
  it('hors espace de travail', () => { expect(scaraIK(1, 1, 3, 0)).toEqual([]); expect(scaraWorkspace(0.25, 0.2)).toEqual({ rMin: 0.04999999999999999, rMax: 0.45 }); });
  it('bras tendu : solution unique', () => expect(scaraIK(1, 1, 2, 0).length).toBe(1));
});
describe('Mobile différentiel', () => {
  it('cinématique et rayon', () => { const k = diffDrive(0.8, 1.0, 0.4); expect(k.v).toBeCloseTo(0.9); expect(k.w).toBeCloseTo(0.5); expect(k.radius).toBeCloseTo(1.8); expect(diffDrive(1, 1, 0.4).radius).toBe(Infinity); });
  it('inverse', () => { const w = wheelSpeedsFor(0.9, 1.8, 0.4); expect(w.vl).toBeCloseTo(0.8); expect(w.vr).toBeCloseTo(1.0); });
  it('trapèze et triangle', () => { expect(trapezoid(10, 1, 1).time).toBeCloseTo(11); const t = trapezoid(0.5, 1, 1); expect(t.triangular).toBe(true); expect(t.time).toBeCloseTo(2 * Math.sqrt(0.5)); });
  it('adhérence et couple roue', () => { expect(frictionAccelLimit(0.5)).toBeCloseTo(4.905); expect(wheelTorqueRequired(20, 1, 0.1, 2)).toBeCloseTo(1); });
  it('collisions sur trajet 2D', () => {
    expect(pathLength([[0, 0], [3, 4]])).toBeCloseTo(5);
    expect(pathCollisions([[0, 0], [10, 0]], 0.3, [{ c: [5, 0.3], r: 0.1 }]).length).toBe(1);
    expect(pathCollisions([[0, 0], [10, 0]], 0.3, [{ c: [5, 1], r: 0.1 }]).length).toBe(0);
  });
});
describe('Équilibre statique', () => {
  const sq: [number, number][] = [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, 0]];
  it('enveloppe convexe', () => expect(convexHull(sq).length).toBe(4));
  it('marge', () => { expect(stabilityMargin([0, 0], sq)).toBeCloseTo(1); expect(stabilityMargin([2, 0], sq)).toBeCloseTo(-1); expect(stabilityMargin([0.5, 0.2], sq)).toBeCloseTo(0.5); });
  it('trépied (patte levée) : CdM au centre du rectangle reste stable sur la diagonale', () => expect(stabilityMargin([0, 0], [[1, 1], [1, -1], [-1, -1]])).toBeCloseTo(0));
});
describe('Aérien', () => {
  it('poussée/poids et stationnaire', () => { expect(thrustToWeight(36, 1.6)).toBeCloseTo(36 / (1.6 * 9.81)); expect(hoverThrottle(36, 1.6)).toBeCloseTo(15.696 / 36); });
  it('dynamique verticale : T = mg → reste au sol ; T = 2mg → z ≈ g t²/2', () => {
    expect(Math.max(...verticalClimb(1, 9.81, 2).z)).toBeCloseTo(0, 9);
    const s = verticalClimb(1, 2 * 9.81, 1, 0.001); expect(s.z[s.z.length - 1]).toBeCloseTo(4.905, 1);
  });
});
describe('Aquatique', () => {
  it('flottabilité', () => { expect(buoyancy(0.01, RHO_FRESH)).toBeCloseTo(98.1); expect(netBuoyancy(1, 0.001, RHO_FRESH)).toBeCloseTo(0); });
  it('vitesse limite', () => expect(terminalSpeed(50, 1, 0.1, 1000)).toBeCloseTo(1));
});
describe('Préhension', () => { it('F = m(g+a)/(nμ)', () => { expect(requiredGripForce(2, 0.5, 2)).toBeCloseTo(19.62); expect(requiredGripForce(2, 0.5, 2, 2)).toBeCloseTo(23.62); }); });
describe('Essaim', () => {
  it('déterministe et séparation', () => {
    expect(initSwarm(5, 10, 3)).toEqual(initSwarm(5, 10, 3));
    let a = [{ x: 0, y: 0, vx: 0, vy: 0 }, { x: 0.1, y: 0, vx: 0, vy: 0 }]; expect(collisions(a, 0.1)).toBe(1);
    for (let k = 0; k < 100; k++) a = step(a, { sep: 1, view: 3, vmax: 1, dt: 0.1, wAli: 0, wCoh: 0 });
    expect(minSeparation(a)).toBeGreaterThan(0.5); expect(collisions(a, 0.1)).toBe(0);
  });
});
describe('Interface commune des modules', () => {
  it('tous les modules s\'exécutent ou signalent les données manquantes', () => {
    for (const m of Object.values(ALL_MODULES)) {
      const r = runModule(m, defaultValues(m));
      const req = m.params.filter((p) => p.required && p.demo == null);
      if (req.length) { expect(r.ok).toBe(false); expect(r.results).toEqual([]); expect(r.missing.length).toBeGreaterThan(0); }
      else expect(r.results.length).toBeGreaterThan(0);
    }
  });
  it('Cd fourni → calcul exécuté', () => {
    const m = ALL_MODULES.aquatic; const v = defaultValues(m); v.cd = { value: 0.9, src: 'utilisateur' };
    const r = runModule(m, v); expect(r.results.find((x) => x.label === 'Vitesse limite')).toBeTruthy();
  });
});
describe('Registre', () => {
  it('6 familles et types requis présents', () => {
    expect(FAMILIES.map((f) => f.id)).toEqual(['industrial', 'humanoid', 'mobile', 'aerial', 'aquatic', 'special']);
    const counts = Object.fromEntries(FAMILIES.map((f) => [f.id, ROBOT_TYPES.filter((r) => r.family === f.id).length]));
    expect(counts).toEqual({ industrial: 6, humanoid: 5, mobile: 6, aerial: 4, aquatic: 4, special: 8 });
  });
  it('chaque module référencé existe ; pas de faux module pour le robot souple', () => {
    ROBOT_TYPES.forEach((r) => r.modules.forEach((m) => expect(ALL_MODULES[m]).toBeTruthy()));
    expect(ROBOT_TYPES.find((r) => r.id === 'soft')!.modules).toEqual([]);
    ROBOT_TYPES.filter((r) => !r.modules.length && !r.armWorkspace).forEach((r) => expect(r.capabilities.physique).toBe('À développer'));
  });
  it('recherche', () => expect(searchTypes('drone').map((r) => r.id)).toContain('multirotor'));
});
describe('Analyseur de requêtes', () => {
  it('robot à roues entrepôt', () => { const p = parseRequest('Configure un robot à roues pour inspecter un entrepôt'); expect(p.intent).toBe('configurer'); expect(p.type!.id).toBe('wheeled'); expect(p.context).toContain('entrepôt'); expect(p.modules).toContain('mobile-diff'); });
  it('bras 2 kg', () => { const p = parseRequest('Simule un bras qui déplace un objet de deux kilogrammes'); expect(p.intent).toBe('simuler'); expect(p.type!.id).toBe('arm'); expect(p.params.payloadMass).toBe(2); expect(p.missing.some((m) => /frottement/i.test(m))).toBe(true); });
  it('comparer drones', () => { const p = parseRequest('Compare deux configurations de drone'); expect(p.intent).toBe('comparer'); expect(p.type!.id).toBe('multirotor'); });
  it('inconnu', () => expect(parseRequest('bonjour').type).toBeNull());
  it('500 g', () => expect(parseRequest('pince pour un objet de 500 g').params.payloadMass).toBe(0.5));
});
