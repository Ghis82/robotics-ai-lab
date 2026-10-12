// Analyse d'URDF côté moteur (pur TS, sans Three.js) : arbre cinématique, FK, couples gravitaires, collisions estimées.
import { XMLParser } from 'fast-xml-parser';
import { matMul, matVec, add, sub, cross, dot, norm, axisAngle, normalize, I3, type Mat3, type Vec3, type Frame } from './math';
import { segmentSegmentDistance } from './collision';
export interface UInertial { mass: number; com: Vec3; inertia: number[] | null }
export interface UGeom { kind: 'box' | 'cylinder' | 'sphere' | 'mesh'; size: number[]; origin: Vec3 }
export interface ULink { name: string; inertial: UInertial | null; collision: UGeom | null; visual: UGeom | null }
export interface UJoint { name: string; type: 'revolute' | 'continuous' | 'prismatic' | 'fixed' | string; parent: string; child: string; xyz: Vec3; rpy: Vec3; axis: Vec3; lower: number | null; upper: number | null; effort: number | null; velocity: number | null }
export interface URDFModel { name: string; links: ULink[]; joints: UJoint[]; root: string; warnings: string[] }
const arr = <T>(x: T | T[] | undefined): T[] => (x == null ? [] : Array.isArray(x) ? x : [x]);
const v3 = (s: string | undefined, d: Vec3 = [0, 0, 0]): Vec3 => { if (!s) return d; const a = s.trim().split(/\s+/).map(Number); return [a[0] ?? 0, a[1] ?? 0, a[2] ?? 0]; };
const num = (s: any): number | null => (s == null || s === '' || !Number.isFinite(+s) ? null : +s);
function geom(g: any): UGeom | null {
  if (!g?.geometry) return null; const G = g.geometry; const o = v3(g.origin?.['@_xyz']);
  if (G.box) return { kind: 'box', size: v3(G.box['@_size']), origin: o };
  if (G.cylinder) return { kind: 'cylinder', size: [+G.cylinder['@_radius'], +G.cylinder['@_length']], origin: o };
  if (G.sphere) return { kind: 'sphere', size: [+G.sphere['@_radius']], origin: o };
  if (G.mesh) return { kind: 'mesh', size: [], origin: o };
  return null;
}
export function parseURDF(xml: string): URDFModel {
  const doc = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' }).parse(xml); const R = doc.robot;
  if (!R) throw new Error('Balise <robot> absente : fichier URDF invalide.');
  const warnings: string[] = [];
  const links: ULink[] = arr<any>(R.link).map((l) => {
    const I = l.inertial; let inertial: UInertial | null = null;
    if (I?.mass && num(I.mass['@_value']) != null) { const t = I.inertia; inertial = { mass: +I.mass['@_value'], com: v3(I.origin?.['@_xyz']), inertia: t ? ['ixx', 'ixy', 'ixz', 'iyy', 'iyz', 'izz'].map((k) => +t[`@_${k}`] || 0) : null }; if (!t) warnings.push(`Segment « ${l['@_name']} » : inertie absente.`); }
    else warnings.push(`Segment « ${l['@_name']} » : masse absente (<inertial>) — exclu des couples gravitaires.`);
    return { name: l['@_name'], inertial, collision: geom(arr<any>(l.collision)[0]), visual: geom(arr<any>(l.visual)[0]) };
  });
  const joints: UJoint[] = arr<any>(R.joint).map((j) => {
    const lim = j.limit; const J: UJoint = { name: j['@_name'], type: j['@_type'], parent: j.parent['@_link'], child: j.child['@_link'], xyz: v3(j.origin?.['@_xyz']), rpy: v3(j.origin?.['@_rpy']), axis: normalize(v3(j.axis?.['@_xyz'], [1, 0, 0])), lower: num(lim?.['@_lower']), upper: num(lim?.['@_upper']), effort: num(lim?.['@_effort']), velocity: num(lim?.['@_velocity']) };
    if (J.type !== 'fixed' && J.effort == null) warnings.push(`Articulation « ${J.name} » : effort (couple/force max) non déclaré.`);
    if ((J.type === 'revolute' || J.type === 'prismatic') && (J.lower == null || J.upper == null)) warnings.push(`Articulation « ${J.name} » : limites absentes.`);
    if (!['revolute', 'continuous', 'prismatic', 'fixed'].includes(J.type)) warnings.push(`Articulation « ${J.name} » : type ${J.type} non pris en charge (traité comme fixe).`);
    return J;
  });
  const children = new Set(joints.map((j) => j.child)); const roots = links.filter((l) => !children.has(l.name));
  if (roots.length !== 1) warnings.push(`Arbre cinématique : ${roots.length} racine(s) trouvée(s).`);
  return { name: R['@_name'] ?? '?', links, joints, root: roots[0]?.name ?? links[0]?.name, warnings };
}
export const movable = (m: URDFModel) => m.joints.filter((j) => ['revolute', 'continuous', 'prismatic'].includes(j.type));
function rpyMat([r, p, y]: Vec3): Mat3 { return matMul(axisAngle([0, 0, 1], y), matMul(axisAngle([0, 1, 0], p), axisAngle([1, 0, 0], r))); }
export interface UFK { link: Record<string, Frame>; jointOrigin: Record<string, Vec3>; jointAxis: Record<string, Vec3> }
/** FK sur l'arbre ; q indexé par nom d'articulation mobile (0 par défaut). Base fixée au monde à l'origine. */
export function urdfFK(m: URDFModel, q: Record<string, number>): UFK {
  const out: UFK = { link: { [m.root]: { R: I3, p: [0, 0, 0] } }, jointOrigin: {}, jointAxis: {} };
  const queue = [m.root];
  while (queue.length) {
    const L = queue.shift()!; const F = out.link[L];
    for (const j of m.joints.filter((x) => x.parent === L)) {
      const R0 = matMul(F.R, rpyMat(j.rpy)); const p0 = add(F.p, matVec(F.R, j.xyz)); const ax = matVec(R0, j.axis);
      out.jointOrigin[j.name] = p0; out.jointAxis[j.name] = ax; const qq = q[j.name] ?? 0;
      out.link[j.child] = j.type === 'revolute' || j.type === 'continuous' ? { R: matMul(R0, axisAngle(j.axis, qq)), p: p0 } : j.type === 'prismatic' ? { R: R0, p: add(p0, matVec(R0, j.axis.map((a) => a * qq) as Vec3)) } : { R: R0, p: p0 };
      queue.push(j.child);
    }
  }
  return out;
}
function descendants(m: URDFModel, link: string): string[] { const out = [link]; m.joints.filter((j) => j.parent === link).forEach((j) => out.push(...descendants(m, j.child))); return out; }
export interface UAnalysis { torques: { joint: string; type: string; value: number; unit: string; effort: number | null; ok: boolean | null }[]; limits: string[]; collisions: { a: string; b: string; clearance: number }[]; massKnown: number; massMissing: string[] }
/** Couple (rotoïde) ou force (prismatique) gravitaire statique ; collisions par capsules ESTIMÉES depuis la géométrie. */
export function analyzeURDF(m: URDFModel, q: Record<string, number>, g = 9.81): UAnalysis {
  const fk = urdfFK(m, q); const res: UAnalysis = { torques: [], limits: [], collisions: [], massKnown: 0, massMissing: [] };
  m.links.forEach((l) => (l.inertial ? (res.massKnown += l.inertial.mass) : res.massMissing.push(l.name)));
  for (const j of movable(m)) {
    const o = fk.jointOrigin[j.name], z = fk.jointAxis[j.name]; let t = 0;
    for (const ln of descendants(m, j.child)) { const L = m.links.find((x) => x.name === ln)!; if (!L.inertial) continue; const F = fk.link[ln]; const c = add(F.p, matVec(F.R, L.inertial.com)); const f: Vec3 = [0, 0, L.inertial.mass * g];
      t += j.type === 'prismatic' ? dot(f, z) : dot(cross(sub(c, o), f), z); }
    res.torques.push({ joint: j.name, type: j.type, value: t, unit: j.type === 'prismatic' ? 'N' : 'N·m', effort: j.effort, ok: j.effort == null ? null : Math.abs(t) <= j.effort });
    const qq = q[j.name] ?? 0; if (j.type !== 'continuous' && j.lower != null && j.upper != null && (qq < j.lower - 1e-9 || qq > j.upper + 1e-9)) res.limits.push(`${j.name} : ${qq.toFixed(3)} hors [${j.lower}, ${j.upper}]`);
  }
  const caps = linkCapsules(m, fk); const adj = new Set(m.joints.map((j) => `${j.parent}|${j.child}`));
  for (let i = 0; i < caps.length; i++) for (let k = i + 1; k < caps.length; k++) {
    const A = caps[i], B = caps[k]; if (adj.has(`${A.link}|${B.link}`) || adj.has(`${B.link}|${A.link}`)) continue;
    const pa = m.joints.find((j) => j.child === A.link)?.parent, pb = m.joints.find((j) => j.child === B.link)?.parent;
    if ((pa && pa === pb) || pa === B.link && false || (pa && adj.has(`${B.link}|${pa}`)) || (pb && adj.has(`${A.link}|${pb}`))) continue; // frères et « grands-parents » ignorés (capsules courtes se chevauchant aux liaisons)
    const c = segmentSegmentDistance(A.a, A.b, B.a, B.b) - A.r - B.r; if (c < 0) res.collisions.push({ a: A.link, b: B.link, clearance: c });
  }
  caps.filter((c) => c.link !== m.root).forEach((c) => { const cl = Math.min(c.a[2], c.b[2]) - c.r; if (cl < 0) res.collisions.push({ a: c.link, b: 'sol', clearance: cl }); });
  return res;
}
/** Capsule estimée par segment : de l'origine du segment vers l'origine de ses enfants (ou centre de géométrie) ; rayon issu de la géométrie de collision (ou 0,02 m par défaut, ESTIMÉ). */
export function linkCapsules(m: URDFModel, fk: UFK) {
  return m.links.map((l) => {
    const F = fk.link[l.name]; if (!F) return null; const kids = m.joints.filter((j) => j.parent === l.name).map((j) => fk.jointOrigin[j.name]);
    const gm = l.collision ?? l.visual; let r = 0.02, estimated = true;
    if (gm?.kind === 'cylinder') { r = gm.size[0]; estimated = false; } else if (gm?.kind === 'sphere') { r = gm.size[0]; estimated = false; } else if (gm?.kind === 'box') { const s = [...gm.size].sort((a, b) => a - b); r = Math.hypot(s[0], s[1]) / 2; estimated = false; }
    let b = kids.length ? kids.reduce((best, p) => (norm(sub(p, F.p)) > norm(sub(best, F.p)) ? p : best)) : gm ? add(F.p, matVec(F.R, gm.origin)) : F.p;
    if (gm?.kind === 'cylinder' && !kids.length) b = add(F.p, matVec(F.R, add(gm.origin, [0, 0, gm.size[1] / 2])));
    return { link: l.name, a: F.p, b, r, estimated };
  }).filter((x): x is NonNullable<typeof x> => !!x && !(norm(sub(x.a, x.b)) < 1e-9 && x.r === 0.02 && !(m.links.find((l) => l.name === x.link)!.collision)));
}
