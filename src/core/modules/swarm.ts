export interface Agent { x: number; y: number; vx: number; vy: number }
/** Générateur pseudo-aléatoire déterministe (reproductibilité). */
export function lcg(seed: number) { let s = seed >>> 0; return () => ((s = (1664525 * s + 1013904223) >>> 0) / 4294967296); }
export function initSwarm(n: number, size: number, seed = 1): Agent[] { const r = lcg(seed); return Array.from({ length: n }, () => ({ x: r() * size, y: r() * size, vx: r() - 0.5, vy: r() - 0.5 })); }
export function minSeparation(a: Agent[]) { let m = Infinity; for (let i = 0; i < a.length; i++) for (let j = i + 1; j < a.length; j++) m = Math.min(m, Math.hypot(a[i].x - a[j].x, a[i].y - a[j].y)); return m; }
export function collisions(a: Agent[], radius: number) { let c = 0; for (let i = 0; i < a.length; i++) for (let j = i + 1; j < a.length; j++) if (Math.hypot(a[i].x - a[j].x, a[i].y - a[j].y) < 2 * radius) c++; return c; }
/** Un pas de « flocking » simple (Reynolds) : séparation, alignement, cohésion, vitesse bornée. Modèle de points, sans dynamique de véhicule. */
export function step(a: Agent[], p: { sep: number; view: number; vmax: number; dt: number; wSep?: number; wAli?: number; wCoh?: number }): Agent[] {
  const { wSep = 1.5, wAli = 0.5, wCoh = 0.3 } = p;
  return a.map((s, i) => {
    let sx = 0, sy = 0, ax = 0, ay = 0, cx = 0, cy = 0, n = 0;
    a.forEach((o, j) => { if (i === j) return; const dx = s.x - o.x, dy = s.y - o.y, d = Math.hypot(dx, dy); if (d > p.view) return; n++; ax += o.vx; ay += o.vy; cx += o.x; cy += o.y; if (d < p.sep && d > 0) { sx += dx / d / d; sy += dy / d / d; } });
    let vx = s.vx + wSep * sx * p.dt, vy = s.vy + wSep * sy * p.dt;
    if (n) { vx += wAli * (ax / n - s.vx) * p.dt + wCoh * (cx / n - s.x) * p.dt; vy += wAli * (ay / n - s.vy) * p.dt + wCoh * (cy / n - s.y) * p.dt; }
    const sp = Math.hypot(vx, vy); if (sp > p.vmax) { vx *= p.vmax / sp; vy *= p.vmax / sp; }
    return { x: s.x + vx * p.dt, y: s.y + vy * p.dt, vx, vy };
  });
}
