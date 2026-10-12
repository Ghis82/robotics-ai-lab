// Volume (théorème de divergence, maillage fermé orienté) et boîte englobante. Pur TS.
export interface MeshData { positions: ArrayLike<number>; indices: ArrayLike<number> }
export function meshVolume(ms: MeshData[]): number { let v = 0; for (const m of ms) { const p = m.positions, ix = m.indices;
  for (let k = 0; k < ix.length; k += 3) { const a = ix[k] * 3, b = ix[k + 1] * 3, c = ix[k + 2] * 3;
    v += (p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1]) - p[a + 1] * (p[b] * p[c + 2] - p[b + 2] * p[c]) + p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c])) / 6; } } return Math.abs(v); }
export function meshBBox(ms: MeshData[]) { const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (const m of ms) for (let i = 0; i < m.positions.length; i += 3) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], m.positions[i + k]); mx[k] = Math.max(mx[k], m.positions[i + k]); }
  return { min: mn, max: mx, size: mn.map((v, k) => mx[k] - v) }; }
/** Le maillage est-il fermé (chaque arête partagée par exactement 2 triangles) ? Sinon le volume n'a pas de sens. */
export function isClosed(ms: MeshData[], tol = 1e-6): boolean { const e = new Map<string, number>(); const ids = new Map<string, number>();
  const vid = (m: MeshData, i: number) => { const p = m.positions; const key = `${Math.round(p[i * 3] / tol)},${Math.round(p[i * 3 + 1] / tol)},${Math.round(p[i * 3 + 2] / tol)}`; let v = ids.get(key); if (v == null) { v = ids.size; ids.set(key, v); } return v; }; // soudure des sommets coïncidents
  for (const m of ms) { const ix = m.indices;
  for (let k = 0; k < ix.length; k += 3) for (let s = 0; s < 3; s++) { const a = vid(m, ix[k + s]), b = vid(m, ix[k + (s + 1) % 3]); const key = a < b ? `${a}_${b}` : `${b}_${a}`; e.set(key, (e.get(key) ?? 0) + 1); }
  } for (const c of e.values()) if (c !== 2) return false; return true; }
