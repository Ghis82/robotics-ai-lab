// Résistance des matériaux simplifiée (poutres d'Euler-Bernoulli) par segment — ESTIMATION, pas un calcul par éléments finis.
import type { Vec3 } from './math';
import { dot, sub, scale, cross, norm } from './math';
import type { RobotModel } from './model';
import { chainFromModel, rnea, type Section } from './dynamics';
export type { Section };
export interface Material { id: string; name: string; E: number /* Pa */; yield: number /* Pa */; density: number /* kg/m³ */; source: string }
/** Valeurs TYPIQUES de la littérature, à confirmer par la fiche du fournisseur. */
export const MATERIALS: Material[] = [
  { id: 'al6061', name: 'Aluminium 6061-T6', E: 68.9e9, yield: 276e6, density: 2700, source: 'Valeur typique — ASM Aerospace Specification Metals / MatWeb, fiche 6061-T6' },
  { id: 'al7075', name: 'Aluminium 7075-T6', E: 71.7e9, yield: 503e6, density: 2810, source: 'Valeur typique — ASM / MatWeb, fiche 7075-T6' },
  { id: 's235', name: 'Acier S235JR', E: 210e9, yield: 235e6, density: 7850, source: 'Limite d\'élasticité minimale EN 10025-2 (épaisseur ≤ 16 mm) ; E et ρ : EN 1993-1-1 §3.2.6' },
  { id: 'inox304', name: 'Inox 304 (recuit)', E: 193e9, yield: 215e6, density: 8000, source: 'Valeur typique — ASM / MatWeb, AISI 304 recuit' },
  { id: 'pla', name: 'PLA imprimé 3D', E: 3.5e9, yield: 50e6, density: 1240, source: 'Ordre de grandeur pour pièces imprimées — très variable (orientation, remplissage) : à mesurer' },
  { id: 'abs', name: 'ABS', E: 2.1e9, yield: 40e6, density: 1050, source: 'Valeur typique — MatWeb, ABS moulé (imprimé : plus faible)' },
  { id: 'pa12', name: 'PA12 (frittage laser)', E: 1.7e9, yield: 48e6, density: 1010, source: 'Valeur typique — fiches fabricants PA12 SLS (résistance à la traction)' },
];
export interface SecProps { A: number; I: number /* flexion, min */; J: number /* torsion (constante) */; c: number /* fibre extrême */; Wt: number /* module de torsion T/τmax */ }
export function sectionProps(s: Section): SecProps {
  if (s.kind === 'plein') { const r = s.d / 2; const I = Math.PI * r ** 4 / 4; return { A: Math.PI * r * r, I, J: 2 * I, c: r, Wt: (Math.PI * r ** 3) / 2 }; }
  if (s.kind === 'tube') { const ro = s.d / 2, ri = s.di / 2; if (ri >= ro) throw new Error('Diamètre intérieur ≥ extérieur'); const I = Math.PI * (ro ** 4 - ri ** 4) / 4; return { A: Math.PI * (ro * ro - ri * ri), I, J: 2 * I, c: ro, Wt: 2 * I / ro }; }
  const b = Math.max(s.b, s.h), h = Math.min(s.b, s.h); // Roark : J ≈ β b h³, τmax = T/(α b h²)
  const beta = (1 / 3) * (1 - 0.63 * (h / b) + 0.052 * (h / b) ** 5); const alpha = 1 / (3 + 1.8 * (h / b));
  return { A: b * h, I: (b * h ** 3) / 12, J: beta * b * h ** 3, c: h / 2, Wt: alpha * b * h * h };
}
export interface LinkStrength { link: string; M: number; T: number; sigma: number; tau: number; vm: number; sf: number; massFromMaterial: number; deflContribution: number }
/** Statique (ou dynamique si q̇/q̈ fournis) : torseur à la base de chaque segment via RNEA ; contraintes de flexion/torsion, von Mises, coefficient de sécurité ;
 *  flèche au TCP = Σ (flèche + rotation × bras de levier) des segments en console, articulations supposées infiniment rigides. */
export function linkStrength(m: RobotModel, q: number[], secs: (Section | null)[], mats: ({ E: number; yield: number; density?: number } | null)[], qd?: number[], qdd?: number[]) {
  const ch = chainFromModel(m); const z = q.map(() => 0); const r = rnea(ch, q, qd ?? z, qdd ?? z); const K = r.kin; const n = q.length; const out: (LinkStrength | null)[] = []; let tool = 0;
  const ends: Vec3[] = K.o.map((_, i) => (i < n - 1 ? K.o[i + 1] : add3(K.o[i], dirW(K, m, i))));
  for (let i = 0; i < n; i++) {
    const s = secs[i], mt = mats[i]; if (!s || !mt) { out.push(null); continue; }
    const L = m.links[i].length; const ax = L > 0 ? scale(sub(ends[i], K.o[i]), 1 / L) : [0, 0, 1] as Vec3; const P = sectionProps(s);
    const Mv = r.moment[i]; const T = Math.abs(dot(Mv, ax)); const M = norm(sub(Mv, scale(ax, dot(Mv, ax))));
    const sigma = (M * P.c) / P.I; const tau = T / P.Wt; const vm = Math.sqrt(sigma * sigma + 3 * tau * tau);
    // efforts transmis en bout de segment (par les corps distaux) : force et moment à l'extrémité
    const fTip: Vec3 = i < n - 1 ? r.force[i + 1] : [0, 0, 0]; const mTip: Vec3 = i < n - 1 ? r.moment[i + 1] : [0, 0, 0];
    const sinG = Math.abs(norm(cross(ax, [0, 0, 1]))); const Fp = i < n - 1 ? norm(sub(fTip, scale(ax, dot(fTip, ax)))) : (m.payload.mass ?? 0) * 9.81 * sinG; const Mp = norm(sub(mTip, scale(ax, dot(mTip, ax)))); const w = (m.links[i].mass ?? 0) * 9.81 * Math.abs(norm(cross(ax, [0, 0, 1]))) / Math.max(L, 1e-9);
    const EI = mt.E * P.I; const delta = Fp * L ** 3 / (3 * EI) + Mp * L * L / (2 * EI) + w * L ** 4 / (8 * EI); const theta = Fp * L * L / (2 * EI) + Mp * L / EI + w * L ** 3 / (6 * EI);
    const lever = norm(sub(ends[n - 1], ends[i])); const contrib = delta + theta * lever; tool += contrib;
    out.push({ link: m.links[i].name, M, T, sigma, tau, vm, sf: mt.yield / Math.max(vm, 1e-9), massFromMaterial: (mt.density ?? 0) * P.A * L, deflContribution: contrib });
  }
  return { links: out, toolDeflection: tool, notes: ['Estimation poutre d\'Euler-Bernoulli (petites déformations, matériau élastique linéaire isotrope) — PAS un calcul par éléments finis.', 'Contraintes nominales à la base de chaque segment ; concentrations de contraintes (alésages, liaisons, soudures), flambement, fatigue et rigidité des articulations/réducteurs NON pris en compte.', 'Flèche au TCP : superposition des consoles, articulations supposées infiniment rigides (la flèche réelle est généralement dominée par les réducteurs).'] };
}
const add3 = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
function dirW(K: { R: number[][] }, m: RobotModel, i: number): Vec3 { const d = m.links[i].dir ?? [0, 0, 1]; const R = K.R[i]; const L = m.links[i].length; return [(R[0] * d[0] + R[1] * d[1] + R[2] * d[2]) * L, (R[3] * d[0] + R[4] * d[1] + R[5] * d[2]) * L, (R[6] * d[0] + R[7] * d[1] + R[8] * d[2]) * L]; }
