import { describe, it, expect } from 'vitest';
import { headTiltTorque, armTorque, companionCoM, autonomyH } from '../src/core/modules/companion';
import { ALL_MODULES } from '../src/core/modules/catalog';
import { runModule, defaultValues } from '../src/core/modules/types';
import { FAMILIES, ROBOT_TYPES } from '../src/core/registry';
import { assist } from '../src/core/assistant';
import { parseRequest } from '../src/core/nlp';
const base = { bodyMass: 0.25, bodyComH: 0.03, headMass: 0.12, headPivotH: 0.07, headD: 0.02, tiltDeg: 30, armMass: 0.015, armL: 0.05, baseR: 0.04 };
const vals = (o: Record<string, number | null>) => { const v = defaultValues(ALL_MODULES.companion); for (const [k, x] of Object.entries(o)) v[k] = { value: x, src: 'utilisateur' }; return v; };
describe('Robots compagnons', () => {
  it('couples statiques (cas calculés à la main)', () => {
    expect(headTiltTorque(0.12, 0.02, 30)).toBeCloseTo(0.12 * 9.81 * 0.02 * 0.5, 10); expect(headTiltTorque(0.1, 0.02, 0)).toBe(0);
    expect(armTorque(0.015, 0.05)).toBeCloseTo(9.81 * 0.015 * 0.025, 10); expect(armTorque(0.01, 0.05, 0.02)).toBeCloseTo(9.81 * (0.01 * 0.025 + 0.02 * 0.05), 10);
  });
  it('CdM et basculement : tête inclinée avance le CdM', () => {
    const c0 = companionCoM({ ...base, tiltDeg: 0, armL: 0, armMass: 0 }); expect(c0.x).toBeCloseTo(0); expect(c0.margin).toBeCloseTo(0.04);
    const c = companionCoM(base); const M = 0.25 + 0.12 + 0.03; expect(c.M).toBeCloseTo(M); expect(c.x).toBeCloseTo((0.12 * 0.02 * 0.5 + 0.03 * 0.025) / M, 10);
    expect(companionCoM({ ...base, headMass: 2, headD: 0.08, tiltDeg: 80 }).margin).toBeLessThan(0);
  });
  it('autonomie', () => { expect(autonomyH(3.7, 1.5)).toBeCloseTo(2.4667, 3); });
  it('couples de blocage obligatoires (pas de valeur inventée)', () => {
    const r = runModule(ALL_MODULES.companion, defaultValues(ALL_MODULES.companion)); expect(r.missing).toEqual(expect.arrayContaining(['Couple de blocage servo de tilt', 'Couple de blocage servo de bras']));
  });
  it('détection : servo insuffisant, avertissement > 50 %, autonomie estimée', () => {
    const tH = headTiltTorque(0.12, 0.02, 30);
    let r = runModule(ALL_MODULES.companion, vals({ tiltStall: tH * 0.8, armStall: 0.1 })); expect(r.ok).toBe(false); expect(r.issues.some((i) => i.severity === 'critique' && /Tête/.test(i.text))).toBe(true);
    r = runModule(ALL_MODULES.companion, vals({ tiltStall: tH * 1.5, armStall: 0.1, batWh: 3.7, power: 1.5 })); expect(r.ok).toBe(true); expect(r.issues.some((i) => i.severity === 'avertissement' && /tilt/.test(i.text))).toBe(true);
    const a = r.results.find((x) => x.label === 'Autonomie')!; expect(a.nature).toBe('estimé'); expect(a.value).toBe('2.47');
    expect(r.issues.some((i) => /à développer/.test(i.text))).toBe(true);
  });
  it('registre : 7e famille, 3 types, badges', () => {
    expect(FAMILIES.map((f) => f.id)).toContain('companion'); const ts = ROBOT_TYPES.filter((t) => t.family === 'companion'); expect(ts.map((t) => t.id)).toEqual(['companion-desk', 'companion-pocket', 'companion-mobile']);
    ts.forEach((t) => { expect(t.modules).toContain('companion'); expect(t.notImplemented.join(' ')).toMatch(/Personnalité/); expect(t.name).not.toMatch(/Eilik|Emo|Aibi/i); });
  });
  it('assistant : robot compagnon', () => {
    expect(parseRequest('Configure un robot compagnon de bureau').type!.id).toBe('companion-desk');
    expect(parseRequest('un robot compagnon mobile sur roues').type!.id).toBe('companion-mobile');
    expect(parseRequest('un robot de poche en pendentif').type!.id).toBe('companion-pocket');
    const a = assist('Vérifie un robot compagnon de bureau'); expect(a.moduleId).toBe('companion'); expect(a.executed).toBe(false); expect(a.missing.map((p) => p.key)).toEqual(expect.arrayContaining(['tiltStall', 'armStall']));
  });
});
