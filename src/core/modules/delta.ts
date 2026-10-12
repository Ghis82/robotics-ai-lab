// Robot Delta (type Clavel, 3 bras rotoïdes). Formulation classique : f = côté triangle de base, e = côté triangle effecteur,
// rf = bras supérieur, re = avant-bras (parallélogramme). Repère : z vers le haut, effecteur sous la base (z < 0).
const sqrt3 = Math.sqrt(3), tan30 = 1 / sqrt3, sin120 = sqrt3 / 2, cos120 = -0.5, tan60 = sqrt3;
export interface DeltaGeom { f: number; e: number; rf: number; re: number }
/** Cinématique directe : angles (rad) → position effecteur, ou null si inexistante. */
export function deltaFK(g: DeltaGeom, t1: number, t2: number, t3: number): [number, number, number] | null {
  const { f, e, rf, re } = g; const t = (f - e) * tan30 / 2;
  const y1 = -(t + rf * Math.cos(t1)), z1 = -rf * Math.sin(t1);
  const y2 = (t + rf * Math.cos(t2)) * Math.sin(Math.PI / 6), x2 = y2 * tan60, z2 = -rf * Math.sin(t2);
  const y3 = (t + rf * Math.cos(t3)) * Math.sin(Math.PI / 6), x3 = -y3 * tan60, z3 = -rf * Math.sin(t3);
  const dnm = (y2 - y1) * x3 - (y3 - y1) * x2;
  const w1 = y1 * y1 + z1 * z1, w2 = x2 * x2 + y2 * y2 + z2 * z2, w3 = x3 * x3 + y3 * y3 + z3 * z3;
  const a1 = (z2 - z1) * (y3 - y1) - (z3 - z1) * (y2 - y1), b1 = -((w2 - w1) * (y3 - y1) - (w3 - w1) * (y2 - y1)) / 2;
  const a2 = -(z2 - z1) * x3 + (z3 - z1) * x2, b2 = ((w2 - w1) * x3 - (w3 - w1) * x2) / 2;
  const a = a1 * a1 + a2 * a2 + dnm * dnm, b = 2 * (a1 * b1 + a2 * (b2 - y1 * dnm) - z1 * dnm * dnm), c = (b2 - y1 * dnm) * (b2 - y1 * dnm) + b1 * b1 + dnm * dnm * (z1 * z1 - re * re);
  const d = b * b - 4 * a * c; if (d < 0) return null;
  const z0 = -0.5 * (b + Math.sqrt(d)) / a; return [(a1 * z0 + b1) / dnm, (a2 * z0 + b2) / dnm, z0];
}
function angleYZ(g: DeltaGeom, x0: number, y0: number, z0: number): number | null {
  const { f, e, rf, re } = g; const y1 = -0.5 * tan30 * f; y0 -= 0.5 * tan30 * e;
  const a = (x0 * x0 + y0 * y0 + z0 * z0 + rf * rf - re * re - y1 * y1) / (2 * z0), b = (y1 - y0) / z0;
  const d = -(a + b * y1) * (a + b * y1) + rf * (b * b * rf + rf); if (d < 0) return null;
  const yj = (y1 - a * b - Math.sqrt(d)) / (b * b + 1), zj = a + b * yj;
  return Math.atan2(-zj, y1 - yj);
}
/** Cinématique inverse : position → 3 angles (rad), ou null si hors espace de travail. */
export function deltaIK(g: DeltaGeom, x: number, y: number, z: number): [number, number, number] | null {
  const t1 = angleYZ(g, x, y, z); const t2 = angleYZ(g, x * cos120 + y * sin120, y * cos120 - x * sin120, z); const t3 = angleYZ(g, x * cos120 - y * sin120, y * cos120 + x * sin120, z);
  return t1 == null || t2 == null || t3 == null ? null : [t1, t2, t3];
}
/** Échantillonnage de l'espace de travail : fraction atteignable d'une grille, avec butées angulaires. */
export function deltaWorkspace(g: DeltaGeom, tMin: number, tMax: number, n = 12) {
  let ok = 0, tot = 0, zmin = Infinity, zmax = -Infinity, rmax = 0;
  for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) for (let k = 0; k <= n; k++) {
    const r = deltaFK(g, tMin + ((tMax - tMin) * i) / n, tMin + ((tMax - tMin) * j) / n, tMin + ((tMax - tMin) * k) / n); tot++;
    if (r) { ok++; zmin = Math.min(zmin, r[2]); zmax = Math.max(zmax, r[2]); rmax = Math.max(rmax, Math.hypot(r[0], r[1])); }
  }
  return { samples: tot, valid: ok, zmin, zmax, rmax };
}
