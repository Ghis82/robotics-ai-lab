/** SCARA plan 2R + axe vertical. FK et IK analytiques (deux solutions coude haut/bas). */
export function scaraFK(l1: number, l2: number, t1: number, t2: number) {
  return { x: l1 * Math.cos(t1) + l2 * Math.cos(t1 + t2), y: l1 * Math.sin(t1) + l2 * Math.sin(t1 + t2) };
}
export function scaraIK(l1: number, l2: number, x: number, y: number): { t1: number; t2: number }[] {
  const c2 = (x * x + y * y - l1 * l1 - l2 * l2) / (2 * l1 * l2);
  if (c2 > 1 + 1e-12 || c2 < -1 - 1e-12) return [];
  const cc = Math.max(-1, Math.min(1, c2)); const sols: { t1: number; t2: number }[] = [];
  for (const s of [1, -1]) { const t2 = s * Math.acos(cc); const t1 = Math.atan2(y, x) - Math.atan2(l2 * Math.sin(t2), l1 + l2 * Math.cos(t2)); sols.push({ t1, t2 }); }
  return Math.abs(sols[0].t2) < 1e-12 ? [sols[0]] : sols;
}
export const scaraWorkspace = (l1: number, l2: number) => ({ rMin: Math.abs(l1 - l2), rMax: l1 + l2 });
