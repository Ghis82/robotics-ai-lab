// Dynamique multicorps rigide d'une chaîne série d'articulations rotoïdes. Pur TS, sans Three.js.
// RNEA (Newton-Euler récursif, Luh-Walker-Paul) en repère monde ; matrice de masse par CRBA « colonne par colonne »
// (M e_j = RNEA(q, 0, e_j) sans gravité) ; dynamique directe q̈ = M⁻¹(τ − h) ; intégration RK4.
import { add, sub, scale, cross, dot, matMul, matVec, axisAngle, I3, type Mat3, type Vec3 } from './math';
import type { RobotModel, LinkSpec } from './model';
import type { URDFModel } from './urdf';
import { rpyMat } from './urdf';
export interface ChainBody { R0: Mat3; p0: Vec3 /* repère articulation dans repère du corps parent (avant rotation) */; axis: Vec3; mass: number; com: Vec3; I: Mat3 /* au CdM, repère du corps */; name: string }
export interface Chain { base: { R: Mat3; p: Vec3 }; bodies: ChainBody[]; source: string; notes: string[] }
const T = (A: Mat3): Mat3 => [A[0], A[3], A[6], A[1], A[4], A[7], A[2], A[5], A[8]];
const diag = (a: number, b: number, c: number): Mat3 => [a, 0, 0, 0, b, 0, 0, 0, c];
const outerI = (m: number, r: Vec3): Mat3 => { const r2 = dot(r, r); return [m * (r2 - r[0] * r[0]), -m * r[0] * r[1], -m * r[0] * r[2], -m * r[1] * r[0], m * (r2 - r[1] * r[1]), -m * r[1] * r[2], -m * r[2] * r[0], -m * r[2] * r[1], m * (r2 - r[2] * r[2])]; };
const addM = (A: Mat3, B: Mat3): Mat3 => A.map((x, i) => x + B[i]);
/** Rotation amenant +Z sur d. */
function zTo(d: Vec3): Mat3 { const c = cross([0, 0, 1], d); const s = Math.hypot(...c); const co = d[2]; if (s < 1e-12) return co > 0 ? I3 : diag(1, -1, -1); return axisAngle(scale(c, 1 / s), Math.atan2(s, co)); }
export type Section = { kind: 'plein'; d: number } | { kind: 'tube'; d: number; di: number } | { kind: 'rect'; b: number; h: number };
/** Tenseur d'inertie au CdM d'un segment de longueur L le long de +Z (repère local), section donnée ou cylindre plein de rayon r. */
export function segmentInertia(m: number, L: number, l: Pick<LinkSpec, 'radius'> & { section?: Section }): Mat3 {
  const s = l.section;
  if (s?.kind === 'rect') return diag(m * (s.h * s.h + L * L) / 12, m * (s.b * s.b + L * L) / 12, m * (s.b * s.b + s.h * s.h) / 12);
  const ro = s ? s.d / 2 : l.radius, ri = s?.kind === 'tube' ? s.di / 2 : 0; const ax = m * (ro * ro + ri * ri) / 2; const tr = m * (3 * (ro * ro + ri * ri) + L * L) / 12;
  return diag(tr, tr, ax);
}
/** Chaîne depuis le modèle de bras : masse au milieu du segment, inertie de section (tube/plein/rectangle) ou cylindre plein de rayon de capsule ; charge ponctuelle en bout. */
export function chainFromModel(m: RobotModel): Chain {
  const notes: string[] = []; const n = m.joints.length;
  const bodies = m.joints.map((j, i) => {
    const l = m.links[i]; const d = l.dir ?? [0, 0, 1]; const L = l.length; const ml = l.mass ?? 0; if (l.mass == null) notes.push(`Masse du segment « ${l.name} » manquante → 0 (dynamique incomplète).`);
    const Rl = zTo(d); let I = matMul(matMul(Rl, segmentInertia(ml, L, l as any)), T(Rl)); let com = scale(d, L / 2); let M = ml;
    if (i === n - 1 && m.payload.mass) { const tip = scale(d, L); const Mt = M + m.payload.mass; const c2 = scale(add(scale(com, M), scale(tip, m.payload.mass)), 1 / Mt);
      I = addM(addM(I, outerI(M, sub(com, c2))), outerI(m.payload.mass, sub(tip, c2))); com = c2; M = Mt; }
    const pd = i === 0 ? null : (m.links[i - 1].dir ?? [0, 0, 1]); const p0: Vec3 = i === 0 ? [0, 0, 0] : scale(pd!, m.links[i - 1].length);
    return { R0: I3, p0, axis: j.axis, mass: M, com, I, name: j.name };
  });
  return { base: { R: I3, p: [0, 0, m.baseHeight] }, bodies, source: 'modèle', notes };
}
/** Chaîne série depuis un URDF (articulations fixes fusionnées, inerties regroupées par Huygens). Refuse un arbre ramifié. */
export function chainFromURDF(u: URDFModel): Chain {
  const notes: string[] = []; const bodies: ChainBody[] = []; let link = u.root; let accR = I3, accP: Vec3 = [0, 0, 0]; let cur: ChainBody | null = null;
  const lump = (b: ChainBody | null, Rl: Mat3, pl: Vec3, ln: string) => { const L = u.links.find((x) => x.name === ln)!; const inn = L.inertial; if (!inn) { notes.push(`Lien « ${ln} » sans <inertial> → masse 0.`); return; }
    if (!inn.inertia) notes.push(`Lien « ${ln} » sans tenseur d'inertie → inertie nulle (masse ponctuelle).`);
    const v = inn.inertia ?? [0, 0, 0, 0, 0, 0]; const Ic: Mat3 = [v[0], v[1], v[2], v[1], v[3], v[4], v[2], v[4], v[5]]; const c = add(pl, matVec(Rl, inn.com)); const Iw = matMul(matMul(Rl, Ic), T(Rl));
    if (!b) return; const Mt = b.mass + inn.mass; if (Mt <= 0) return; const cn = scale(add(scale(b.com, b.mass), scale(c, inn.mass)), 1 / Mt);
    b.I = addM(addM(b.I, outerI(b.mass, sub(b.com, cn))), addM(Iw, outerI(inn.mass, sub(c, cn)))); b.com = cn; b.mass = Mt; };
  for (;;) {
    const ch = u.joints.filter((j) => j.parent === link); if (!ch.length) break; if (ch.length > 1) { notes.push(`Arbre ramifié au lien « ${link} » : seule la première branche est suivie.`); }
    const j = ch[0]; const Rj = matMul(accR, rpyMat(j.rpy)); const pj = add(accP, matVec(accR, j.xyz));
    if (j.type === 'revolute' || j.type === 'continuous') { cur = { R0: Rj, p0: pj, axis: j.axis, mass: 0, com: [0, 0, 0], I: diag(0, 0, 0), name: j.name }; bodies.push(cur); accR = I3; accP = [0, 0, 0]; lump(cur, I3, [0, 0, 0], j.child); }
    else if (j.type === 'fixed') { accR = Rj; accP = pj; lump(cur, Rj, pj, j.child); }
    else { notes.push(`Articulation « ${j.name} » de type ${j.type} non prise en charge par la dynamique → chaîne tronquée.`); break; }
    link = j.child;
  }
  if (u.links.find((l) => l.name === u.root)?.inertial) notes.push('Inertie du lien de base ignorée (base fixe).');
  return { base: { R: I3, p: [0, 0, 0] }, bodies, source: 'URDF', notes };
}
interface Kin { R: Mat3[]; o: Vec3[]; z: Vec3[]; c: Vec3[] }
function kin(ch: Chain, q: number[]): Kin {
  let R = ch.base.R, p = ch.base.p; const out: Kin = { R: [], o: [], z: [], c: [] };
  ch.bodies.forEach((b, i) => { const o = add(p, matVec(R, b.p0)); const Rj = matMul(R, b.R0); const z = matVec(Rj, b.axis); const Rb = matMul(Rj, axisAngle(b.axis, q[i])); out.R.push(Rb); out.o.push(o); out.z.push(z); out.c.push(add(o, matVec(Rb, b.com))); R = Rb; p = o; });
  return out;
}
/** RNEA : couples articulaires τ = M(q)q̈ + C(q,q̇)q̇ + g(q). Retourne aussi les torseurs transmis (force, moment au point d'articulation, monde). */
export function rnea(ch: Chain, q: number[], qd: number[], qdd: number[], g = 9.81, tipForce?: Vec3) {
  const K = kin(ch, q); const n = ch.bodies.length; const w: Vec3[] = [], al: Vec3[] = [], a: Vec3[] = []; let wp: Vec3 = [0, 0, 0], alp: Vec3 = [0, 0, 0], ap: Vec3 = [0, 0, g], op = K.o[0];
  for (let i = 0; i < n; i++) { const r = sub(K.o[i], op); const ai = add(ap, add(cross(alp, r), cross(wp, cross(wp, r)))); const zi = K.z[i];
    const wi = add(wp, scale(zi, qd[i])); const ali = add(add(alp, scale(zi, qdd[i])), cross(wp, scale(zi, qd[i]))); w.push(wi); al.push(ali); a.push(ai); wp = wi; alp = ali; ap = ai; op = K.o[i]; }
  const tau = new Array(n).fill(0); const f: Vec3[] = new Array(n), nn: Vec3[] = new Array(n); let fN: Vec3 = tipForce ? scale(tipForce, -1) : [0, 0, 0], nN: Vec3 = [0, 0, 0], oN: Vec3 | null = null;
  for (let i = n - 1; i >= 0; i--) { const b = ch.bodies[i]; const rc = sub(K.c[i], K.o[i]); const ac = add(a[i], add(cross(al[i], rc), cross(w[i], cross(w[i], rc))));
    const Iw = matMul(matMul(K.R[i], b.I), T(K.R[i])); const F = scale(ac, b.mass); const N = add(matVec(Iw, al[i]), cross(w[i], matVec(Iw, w[i])));
    const tipPt = i === n - 1 ? null : oN; const ft = add(F, fN); let nt = add(add(N, cross(rc, F)), nN); if (tipPt) nt = add(nt, cross(sub(tipPt, K.o[i]), fN));
    else if (tipForce) { /* force externe appliquée au CdM du dernier corps (approximation documentée) */ nt = add(nt, cross(rc, fN)); }
    f[i] = ft; nn[i] = nt; tau[i] = dot(K.z[i], nt); fN = ft; nN = nt; oN = K.o[i]; }
  return { tau, force: f, moment: nn, kin: K };
}
export function massMatrix(ch: Chain, q: number[]): number[][] { const n = ch.bodies.length; const z = new Array(n).fill(0); return Array.from({ length: n }, (_, j) => rnea(ch, q, z, z.map((_, k) => (k === j ? 1 : 0)), 0).tau).map((_, j, cols) => cols.map((c) => c[j])); }
export function solve(A: number[][], b: number[]): number[] { const n = b.length; const M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) { let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r; [M[c], M[p]] = [M[p], M[c]]; if (Math.abs(M[c][c]) < 1e-14) throw new Error('Matrice de masse singulière (corps sans masse ni inertie ?)');
    for (let r = c + 1; r < n; r++) { const k = M[r][c] / M[c][c]; for (let k2 = c; k2 <= n; k2++) M[r][k2] -= k * M[c][k2]; } }
  const x = new Array(n).fill(0); for (let i = n - 1; i >= 0; i--) { let s = M[i][n]; for (let j = i + 1; j < n; j++) s -= M[i][j] * x[j]; x[i] = s / M[i][i]; } return x; }
/** Dynamique directe : q̈ = M(q)⁻¹ (τ − h(q, q̇)). */
export function forwardDynamics(ch: Chain, q: number[], qd: number[], tau: number[], g = 9.81) { const h = rnea(ch, q, qd, q.map(() => 0), g).tau; return solve(massMatrix(ch, q), tau.map((t, i) => t - h[i])); }
/** Intégration RK4 ; tauFn(t,q,qd) facultatif (0 sinon). */
export function simulateFD(ch: Chain, q0: number[], qd0: number[], T: number, dt: number, tauFn?: (t: number, q: number[], qd: number[]) => number[], g = 9.81) {
  let q = [...q0], qd = [...qd0]; const out: { t: number; q: number[]; qd: number[] }[] = [{ t: 0, q: [...q], qd: [...qd] }]; const z = q.map(() => 0);
  const f = (t: number, q: number[], qd: number[]) => forwardDynamics(ch, q, qd, tauFn ? tauFn(t, q, qd) : z, g);
  for (let k = 0, t = 0; t < T - 1e-12; k++, t += dt) {
    const a1 = f(t, q, qd); const q2 = q.map((x, i) => x + qd[i] * dt / 2), v2 = qd.map((x, i) => x + a1[i] * dt / 2); const a2 = f(t + dt / 2, q2, v2);
    const q3 = q.map((x, i) => x + v2[i] * dt / 2), v3 = qd.map((x, i) => x + a2[i] * dt / 2); const a3 = f(t + dt / 2, q3, v3); const q4 = q.map((x, i) => x + v3[i] * dt), v4 = qd.map((x, i) => x + a3[i] * dt); const a4 = f(t + dt, q4, v4);
    q = q.map((x, i) => x + dt / 6 * (qd[i] + 2 * v2[i] + 2 * v3[i] + v4[i])); qd = qd.map((x, i) => x + dt / 6 * (a1[i] + 2 * a2[i] + 2 * a3[i] + a4[i])); out.push({ t: t + dt, q: [...q], qd: [...qd] });
  }
  return out;
}
/** Énergie mécanique (cinétique ½q̇ᵀMq̇ + potentielle Σ m g z_c). */
export function energy(ch: Chain, q: number[], qd: number[], g = 9.81) { const M = massMatrix(ch, q); const K = kin(ch, q); let Ek = 0; for (let i = 0; i < q.length; i++) for (let j = 0; j < q.length; j++) Ek += 0.5 * qd[i] * M[i][j] * qd[j]; return Ek + ch.bodies.reduce((s, b, i) => s + b.mass * g * K.c[i][2], 0); }
/** Courbe couple-vitesse linéaire d'un moteur CC (hypothèse) : τdisp(ω) = τblocage (1 − |ω|/ωvide). */
export const availableTorque = (stall: number, noLoad: number, w: number) => Math.max(0, stall * (1 - Math.abs(w) / noLoad));
/** Couples RNEA le long d'une trajectoire échantillonnée (q̇, q̈ par différences finies centrées) et vérification couple-vitesse. */
export function trajectoryDynamics(m: RobotModel, frames: { t: number; q: number[] }[]) {
  const ch = chainFromModel(m); const n = m.joints.length; const N = frames.length; const rows: { t: number; tau: number[]; qd: number[] }[] = []; const issues: { joint: number; t: number; tau: number; avail: number; w: number }[] = [];
  for (let k = 0; k < N; k++) { const kp = Math.max(0, k - 1), kn = Math.min(N - 1, k + 1); const dtc = frames[kn].t - frames[kp].t || 1;
    const qd = frames[k].q.map((_, i) => (frames[kn].q[i] - frames[kp].q[i]) / dtc); const h = (frames[kn].t - frames[kp].t) / 2 || 1;
    const qdd = frames[k].q.map((_, i) => (k === 0 || k === N - 1 ? 0 : (frames[kn].q[i] - 2 * frames[k].q[i] + frames[kp].q[i]) / (h * h)));
    const tau = rnea(ch, frames[k].q, qd, qdd).tau; rows.push({ t: frames[k].t, tau, qd });
    m.joints.forEach((j, i) => { if (!j.motor || !j.motor.maxSpeed) return; const av = availableTorque(j.motor.maxTorque, j.motor.maxSpeed, qd[i]); if (Math.abs(tau[i]) > av && !issues.some((x) => x.joint === i)) issues.push({ joint: i, t: frames[k].t, tau: tau[i], avail: av, w: qd[i] }); }); }
  return { rows, issues, peak: Array.from({ length: n }, (_, i) => Math.max(...rows.map((r) => Math.abs(r.tau[i])))), notes: ch.notes };
}
