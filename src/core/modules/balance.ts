export type P2 = [number, number];
/** Enveloppe convexe (chaîne monotone d'Andrew), sens trigonométrique. */
export function convexHull(pts: P2[]): P2[] {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]); if (p.length < 3) return p;
  const cr = (o: P2, a: P2, b: P2) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo: P2[] = [], up: P2[] = [];
  for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (const q of [...p].reverse()) { while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
/** Marge de stabilité statique : distance signée du CdM projeté au bord du polygone d'appui (>0 = à l'intérieur). */
export function stabilityMargin(com: P2, contacts: P2[]): number {
  const h = convexHull(contacts); if (h.length < 3) return -Infinity;
  let m = Infinity;
  for (let i = 0; i < h.length; i++) { const a = h[i], b = h[(i + 1) % h.length]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    m = Math.min(m, ((b[0] - a[0]) * (com[1] - a[1]) - (b[1] - a[1]) * (com[0] - a[0])) / L); }
  return m;
}
export function comOf(masses: { m: number; p: P2 }[]): P2 { const M = masses.reduce((s, x) => s + x.m, 0); return [masses.reduce((s, x) => s + x.m * x.p[0], 0) / M, masses.reduce((s, x) => s + x.m * x.p[1], 0) / M]; }
