// Suite de validation : cas de référence analytiques publiés → valeur calculée par nos modules, référence, erreur relative.
import type { RobotModel } from './model';
import { chainFromModel, rnea, simulateFD, energy } from './dynamics';
import { linkStrength } from './strength';
export interface VCase { id: string; title: string; reference: string; computed: number; expected: number; unit: string; tol: number; err: number; pass: boolean; kind: 'indépendant' | 'cohérence' }
const mk = (c: Omit<VCase, 'err' | 'pass'>): VCase => { const err = Math.abs(c.computed - c.expected) / Math.max(Math.abs(c.expected), 1e-12); return { ...c, err, pass: err <= c.tol }; };
/** Barre (ou chaîne de barres) horizontale le long de +X, articulations d'axe Y. */
export function bars(Ls: number[], ms: number[], payload = 0, r = 0.005): RobotModel {
  return { name: 'banc', baseHeight: 1, baseMass: 0, baseFootprintRadius: null as any, joints: Ls.map((_, i) => ({ name: `J${i + 1}`, type: 'revolute', axis: [0, 1, 0], min: -10, max: 10, motor: null })) as any,
    links: Ls.map((L, i) => ({ name: `Barre ${i + 1}`, length: L, mass: ms[i], radius: r, material: null, dir: [1, 0, 0] })) as any, payload: { mass: payload, label: '' }, obstacles: [], provenance: {} };
}
function period(ts: number[], xs: number[]) { const z: number[] = []; for (let i = 1; i < xs.length; i++) if (xs[i - 1] < 0 && xs[i] >= 0) z.push(ts[i - 1] + (ts[i] - ts[i - 1]) * (-xs[i - 1]) / (xs[i] - xs[i - 1])); return (z[z.length - 1] - z[0]) / (z.length - 1); }
export function runValidation(): VCase[] {
  const out: VCase[] = []; const g = 9.81;
  { // 1. pendule composé (barre uniforme), petites oscillations ; q=0 horizontal → équilibre à q=+π/2 (barre vers le bas pour axe Y)
    const L = 0.5, m = bars([L], [1], 0, 1e-4); const ch = chainFromModel(m); const q0 = Math.PI / 2 + 0.02; const s = simulateFD(ch, [q0], [0], 6, 0.001);
    out.push(mk({ id: 'pendule', title: 'Pendule composé (barre uniforme, petites oscillations) : période', reference: 'T = 2π√(2L/3g) — mécanique classique (ex. Halliday, Resnick & Walker, Fundamentals of Physics, pendule physique)', computed: period(s.map((x) => x.t), s.map((x) => x.q[0] - Math.PI / 2)), expected: 2 * Math.PI * Math.sqrt((2 * L) / (3 * g)), unit: 's', tol: 2e-3, kind: 'indépendant' }));
  }
  { // 2. double pendule : conservation de l'énergie (système conservatif)
    const ch = chainFromModel(bars([0.4, 0.3], [1, 0.7], 0, 0.01)); const q0 = [0.3, 1.2]; const E0 = energy(ch, q0, [0, 0]); const s = simulateFD(ch, q0, [0, 0], 3, 0.0005); const E1 = energy(ch, s[s.length - 1].q, s[s.length - 1].qd);
    out.push(mk({ id: 'double', title: 'Double pendule chaotique : énergie après 3 s (RK4)', reference: 'Conservation de l\'énergie mécanique (Lagrange) ; référence = énergie initiale', computed: E1, expected: E0, unit: 'J', tol: 1e-5, kind: 'cohérence' }));
  }
  { // 3. couple statique barre horizontale + charge
    const L = 0.6, M = 2, P = 1.5; const tau = rnea(chainFromModel(bars([L], [M], P)), [0], [0], [0]).tau[0];
    out.push(mk({ id: 'statique', title: 'Couple statique d\'une barre horizontale portant une charge', reference: 'τ = g (M L/2 + P L) — statique', computed: Math.abs(tau), expected: g * (M * L / 2 + P * L), unit: 'N·m', tol: 1e-9, kind: 'indépendant' }));
  }
  { // 4. accélération initiale du pendule lâché à l'horizontale : α = 3g/(2L)
    const L = 0.8; const s = rnea(chainFromModel(bars([L], [1], 0, 1e-6)), [0], [0], [1], 0).tau[0]; const tau = rnea(chainFromModel(bars([L], [1], 0, 1e-6)), [0], [0], [0]).tau[0];
    out.push(mk({ id: 'alpha', title: 'Barre lâchée à l\'horizontale : accélération angulaire initiale', reference: 'α = 3g/(2L) — I_O = mL²/3', computed: Math.abs(tau / s), expected: 3 * g / (2 * L), unit: 'rad/s²', tol: 1e-4, kind: 'indépendant' }));
  }
  { // 5. poutre console : flèche et contrainte (segment sans masse, charge en bout)
    const L = 0.5, P = 2, D = 0.02, Dd = 0.016, E = 68.9e9; const m = bars([L], [1e-9], P); const r = linkStrength(m, [0], [{ kind: 'tube', d: D, di: Dd }], [{ E, yield: 276e6 }]); const I = Math.PI * (D ** 4 - Dd ** 4) / 64;
    out.push(mk({ id: 'fleche', title: 'Poutre console tube Ø20/16 alu, 2 kg en bout : flèche', reference: 'δ = PL³/(3EI) — Euler-Bernoulli (Timoshenko & Gere, Mechanics of Materials)', computed: r.toolDeflection, expected: P * g * L ** 3 / (3 * E * I), unit: 'm', tol: 1e-3, kind: 'indépendant' }));
    out.push(mk({ id: 'contrainte', title: 'Même poutre : contrainte de flexion à l\'encastrement', reference: 'σ = M c / I, M = P g L', computed: r.links[0]!.sigma, expected: (P * g * L * (D / 2)) / I, unit: 'Pa', tol: 1e-3, kind: 'indépendant' }));
  }
  return out;
}
