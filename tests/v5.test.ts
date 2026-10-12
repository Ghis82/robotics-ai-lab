import { describe, it, expect } from 'vitest';
import { allocate, allocationMatrix, stepUW, depthHold, netBuoyancyN, rightingMoment, type UWParams } from '../src/core/modules/underwater';
import { makeGrid, fillRect, inflate, astar, pathLengthCells, purePursuit, toWorld, occupied } from '../src/core/modules/planning';
import { demoWarehouse, planAndFollow, ALL_MODULES } from '../src/core/modules/catalog';
import { assist } from '../src/core/assistant';
import { buildGlobal, globalMarkdown, globalHTML, DISCLAIMER_G } from '../src/core/globalReport';
import { ROBOT_TYPES } from '../src/core/registry';
const th = (tm = 40) => [{ x: -0.3, z: 0.05, angle: 0, tmax: tm }, { x: -0.3, z: -0.05, angle: 0, tmax: tm }, { x: 0.25, z: 0, angle: Math.PI / 2, tmax: tm }, { x: -0.25, z: 0, angle: Math.PI / 2, tmax: tm }];
const P = (o: Partial<UWParams> = {}): UWParams => ({ mass: 30, volume: 30 / 1025, rho: 1025, BG: 0.05, Iyy: 1.5, cdAx: 0.08, cdAz: 0.2, kq: 0.5, thrusters: th(), ...o });

describe('ROV/AUV plan vertical', () => {
  it('flottabilité neutre et moment de redressement', () => { const p = P(); expect(netBuoyancyN(p)).toBeCloseTo(0, 9); expect(rightingMoment(p, Math.PI / 2)).toBeCloseTo(-30 * 9.81 * 0.05, 6); });
  it('allocation exacte sans saturation, saturation détectée sinon', () => {
    const a = allocate(th(), [20, -10, 1]); expect(a.saturated).toBe(false); a.achieved.forEach((v, i) => expect(v).toBeCloseTo([20, -10, 1][i], 6));
    const B = allocationMatrix(th()); expect(B[2][0]).toBeCloseTo(0.05); expect(B[2][2]).toBeCloseTo(-0.25);
    expect(allocate(th(), [200, 0, 0]).saturated).toBe(true);
  });
  it('oscillation de tangage : période = 2π√(I/(ρgV·BG)) sans traînée', () => {
    const p = P({ kq: 0, cdAx: 0, cdAz: 0 }); let s = { x: 0, z: 0, th: 0.05, u: 0, w: 0, q: 0 }; const dt = 0.0005; let t = 0, prev = s.th, cross = -1;
    for (let k = 0; k < 40000; k++) { s = stepUW(p, s, [0, 0, 0, 0], dt); t += dt; if (prev > 0 && s.th <= 0) { if (cross < 0) cross = t; else { const T = (t - cross); expect(T).toBeCloseTo(2 * Math.PI * Math.sqrt(1.5 / (1025 * 9.81 * p.volume * 0.05)), 1); break; } } prev = s.th; }
  });
  it('vitesse limite en cavalement = √(2F/(ρ·CdA))', () => { const p = P(); let s = { x: 0, z: 0, th: 0, u: 0, w: 0, q: 0 }; for (let k = 0; k < 60000; k++) s = stepUW(p, s, [20, 20, 0, 0], 0.005); expect(s.u).toBeCloseTo(Math.sqrt((2 * 40) / (1025 * 0.08)), 2); });
  it('maintien de profondeur atteint la cible (flottabilité positive compensée)', () => { const p = P({ volume: 30.5 / 1025 }); const r = depthHold(p, { zTarget: -5, surge: 10, T: 60 }); expect(Math.abs(r.final.z + 5)).toBeLessThan(0.2); expect(Math.abs(r.final.th)).toBeLessThan(0.05); });
  it('module : Cd·A par axe, Iyy et kq obligatoires', () => { expect(ALL_MODULES['rov-dyn'].params.filter((p) => p.required && p.demo == null).map((p) => p.key)).toEqual(['Iyy', 'cdAx', 'cdAz', 'kq']); });
});
describe('Planification et suivi', () => {
  it('A* : chemin optimal en espace libre (métrique octile)', () => { const g = makeGrid(20, 20, 0.1); const p = astar(g, [0, 0], [10, 4])!; expect(pathLengthCells(p)).toBeCloseTo(6 + 4 * Math.SQRT2, 9); });
  it('A* : mur bloquant → null ; mur avec passage → contourne', () => {
    const g = makeGrid(20, 20, 0.1); fillRect(g, 10, 0, 10, 19); expect(astar(g, [0, 0], [19, 19])).toBeNull();
    g.occ[10 * 20 + 10] = 0; const p = astar(g, [0, 0], [19, 19])!; expect(p.some((c) => c[0] === 10 && c[1] === 10)).toBe(true);
  });
  it('pas de coupe de coin', () => { const g = makeGrid(3, 3, 1); g.occ[1] = 1; g.occ[3] = 1; expect(astar(g, [0, 0], [1, 1])).toBeNull(); });
  it('gonflement : passage trop étroit pour l\'empreinte', () => { const g = makeGrid(40, 20, 0.1); fillRect(g, 20, 0, 20, 8); fillRect(g, 20, 12, 20, 19); expect(astar(g, [2, 10], [38, 10])).not.toBeNull(); expect(astar(inflate(g, 0.3), [2, 10], [38, 10])).toBeNull(); });
  it('chemin gonflé : chaque cellule à ≥ rayon des obstacles', () => { const g = demoWarehouse(); const inf = inflate(g, 0.3); const p = astar(inf, [5, 5], [95, 55])!; for (const c of p) for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) if (g.occ[y * g.w + x]) expect(Math.hypot(x - c[0], y - c[1]) * 0.1).toBeGreaterThan(0.3); });
  it('pure pursuit : ligne droite, limites d\'accélération respectées', () => { const g = makeGrid(60, 10, 0.1); const r = purePursuit(g, [[0.5, 0.5], [5.5, 0.5]], { vmax: 1, amax: 0.5, mu: null, lookahead: 0.4, track: 0.4, robotR: 0.2 }); expect(r.reached).toBe(true); expect(r.maxAccel).toBeLessThanOrEqual(0.5 + 1e-9); expect(r.time).toBeGreaterThan(5 / 1 + 1); });
  it('adhérence : a ≤ μg', () => { const g = makeGrid(60, 10, 0.1); const r = purePursuit(g, [[0.5, 0.5], [5.5, 0.5]], { vmax: 1, amax: 5, mu: 0.02, lookahead: 0.4, track: 0.4, robotR: 0.2 }); expect(r.aLim).toBeCloseTo(0.1962); expect(r.maxAccel).toBeLessThanOrEqual(0.1962 + 1e-9); });
  it('sans marge, la poursuite pure coupe les virages : collision détectée (honnêteté)', () => { const r = planAndFollow(demoWarehouse(), [5, 5], [95, 55], { robotR: 0.3, vmax: 1.2, amax: 1, mu: null, track: 0.45, lookahead: 0.5, margin: 0 }); expect(r.follow!.collided).toBe(true); });
  it('entrepôt de démo : planifié, suivi sans collision', () => { const r = planAndFollow(demoWarehouse(), [5, 5], [95, 55], { robotR: 0.3, vmax: 1.2, amax: 1, mu: null, track: 0.45, lookahead: 0.5, margin: 0.15 }); expect(r.path).not.toBeNull(); expect(r.follow!.reached).toBe(true); expect(r.follow!.collided).toBe(false); void toWorld; void occupied; });
});
describe('Assistant de bout en bout', () => {
  it('robot à roues / entrepôt : sans valeurs → non exécuté, champs listés ; avec démo acceptée → exécuté', () => {
    const a = assist('Configure un robot à roues pour inspecter un entrepôt'); expect(a.moduleId).toBe('nav-grid'); expect(a.executed).toBe(false); expect(a.missing.map((p) => p.key)).toEqual(['robotR', 'vmax', 'amax', 'track', 'lookahead', 'margin']);
    const b = assist('Configure un robot à roues pour inspecter un entrepôt', { acceptDemo: true }); expect(b.executed).toBe(true); expect(b.result!.results.length).toBeGreaterThan(0); expect(b.explanation.join(' ')).toMatch(/valeurs de démonstration/);
  });
  it('bras 2 kg : masse extraite (utilisateur), μ manquant même avec démo ; exécuté une fois μ fourni', () => {
    const a = assist('Simule un bras qui déplace un objet de deux kilogrammes', { acceptDemo: true }); expect(a.moduleId).toBe('gripper'); expect(a.values!.mass).toEqual({ value: 2, src: 'utilisateur' }); expect(a.executed).toBe(false); expect(a.missing.map((p) => p.key)).toEqual(['mu']);
    const b = assist('Simule un bras qui déplace un objet de deux kilogrammes', { acceptDemo: true, userValues: { mu: 0.5 } }); expect(b.executed).toBe(true);
    expect(b.result!.results.find((r) => r.label === 'Effort de serrage minimal')!.value).toBe((2 * (9.81 + 2) / (2 * 0.5)).toFixed(1));
  });
  it('comparer deux drones : module aérien, intention comparer', () => { const a = assist('Compare deux configurations de drone'); expect(a.parsed.intent).toBe('comparer'); expect(a.moduleId).toBe('aerial'); expect(a.executed).toBe(false); });
  it('type sans module (robot souple) : aucun résultat', () => { const a = assist('Simule un robot souple'); expect(a.executed).toBe(false); expect(a.explanation.join(' ')).toMatch(/Aucun module/); });
  it('requête inconnue', () => expect(assist('bonjour').moduleId).toBeNull());
});
describe('Rapport global', () => {
  const h = [{ date: '2026-10-12T00:00:00Z', type: 'gripper', module: 'gripper', values: { mass: 2 }, ok: true, summary: 'ok', results: [{ label: 'F', value: 23.6, unit: 'N', nature: 'calculé' }, { label: 'v', value: 1, nature: 'estimé' }], issues: [{ severity: 'critique', nature: 'calculé', text: 'X' }, { severity: 'info', nature: 'à valider', text: 'démo' }], missing: ['μ'], assumptions: ['H1'] }];
  it('sections calculé / estimé / à valider', () => { const g = buildGlobal(h); expect(g.calculé.length).toBe(2); expect(g.estimé.length).toBe(1); expect(g.àValider.length).toBe(2); expect(g.nbCritiques).toBe(1); });
  it('exports MD/HTML avec avertissement', () => { expect(globalMarkdown(h)).toContain(DISCLAIMER_G); expect(globalHTML(h)).toContain('<table>'); expect(globalMarkdown([])).toContain('0 exécution'); });
});
describe('Registre v0.5', () => { it('ROV/AUV et robots à roues : nouveaux modules', () => { expect(ROBOT_TYPES.find((t) => t.id === 'rov')!.modules).toContain('rov-dyn'); expect(ROBOT_TYPES.find((t) => t.id === 'wheeled')!.modules).toContain('nav-grid'); }); });
