// Planification sur grille d'occupation (A*, 8-connexité sans coupe de coin), gonflement par l'empreinte du robot,
// suivi par poursuite pure (pure pursuit) d'un robot différentiel avec limites d'accélération / adhérence.
export interface Grid { w: number; h: number; res: number /* m/cellule */; occ: Uint8Array }
export type Cell = [number, number];
export const makeGrid = (w: number, h: number, res: number): Grid => ({ w, h, res, occ: new Uint8Array(w * h) });
export const idx = (g: Grid, x: number, y: number) => y * g.w + x;
export const occupied = (g: Grid, x: number, y: number) => x < 0 || y < 0 || x >= g.w || y >= g.h || g.occ[idx(g, x, y)] === 1;
export function fillRect(g: Grid, x0: number, y0: number, x1: number, y1: number) { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (x >= 0 && y >= 0 && x < g.w && y < g.h) g.occ[idx(g, x, y)] = 1; }
/** Gonflement : toute cellule à distance (centre-à-centre) ≤ rayon d'un obstacle devient occupée. */
export function inflate(g: Grid, radius: number): Grid {
  const r = Math.ceil(radius / g.res); const out = { ...g, occ: new Uint8Array(g.occ) };
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) if (g.occ[idx(g, x, y)]) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (Math.hypot(dx, dy) * g.res <= radius + 1e-9) { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < g.w && Y < g.h) out.occ[idx(g, X, Y)] = 1; } }
  return out;
}
export function astar(g: Grid, s: Cell, goal: Cell): Cell[] | null {
  if (occupied(g, ...s) || occupied(g, ...goal)) return null;
  const N = g.w * g.h, gs = new Float64Array(N).fill(Infinity), came = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
  const hfn = (x: number, y: number) => { const dx = Math.abs(x - goal[0]), dy = Math.abs(y - goal[1]); return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy); };
  const open: [number, number][] = []; const push = (f: number, i: number) => { open.push([f, i]); let k = open.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (open[p][0] <= open[k][0]) break; [open[p], open[k]] = [open[k], open[p]]; k = p; } };
  const pop = () => { const top = open[0]; const last = open.pop()!; if (open.length) { open[0] = last; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < open.length && open[l][0] < open[m][0]) m = l; if (r < open.length && open[r][0] < open[m][0]) m = r; if (m === k) break; [open[m], open[k]] = [open[k], open[m]]; k = m; } } return top; };
  const si = idx(g, ...s); gs[si] = 0; push(hfn(...s), si);
  while (open.length) {
    const [, ci] = pop(); if (closed[ci]) continue; closed[ci] = 1; const cx = ci % g.w, cy = (ci / g.w) | 0;
    if (cx === goal[0] && cy === goal[1]) { const path: Cell[] = []; let k = ci; while (k !== -1) { path.push([k % g.w, (k / g.w) | 0]); k = came[k]; } return path.reverse(); }
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue; const nx = cx + dx, ny = cy + dy; if (occupied(g, nx, ny)) continue;
      if (dx && dy && (occupied(g, cx + dx, cy) || occupied(g, cx, cy + dy))) continue; // pas de coupe de coin
      const ni = idx(g, nx, ny); const ng = gs[ci] + (dx && dy ? Math.SQRT2 : 1);
      if (ng < gs[ni]) { gs[ni] = ng; came[ni] = ci; push(ng + hfn(nx, ny), ni); }
    }
  }
  return null;
}
export const pathLengthCells = (p: Cell[]) => p.slice(1).reduce((s, c, i) => s + Math.hypot(c[0] - p[i][0], c[1] - p[i][1]), 0);
export const toWorld = (g: Grid, c: Cell): [number, number] => [(c[0] + 0.5) * g.res, (c[1] + 0.5) * g.res];
/** Distance du point au plus proche obstacle (cellule occupée, carré) — balayage local. */
export function clearanceAt(g: Grid, x: number, y: number, maxR: number): number {
  const r = Math.ceil(maxR / g.res) + 1; const cx = Math.floor(x / g.res), cy = Math.floor(y / g.res); let best = maxR;
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const X = cx + dx, Y = cy + dy; if (!occupied(g, X, Y)) continue;
    const qx = Math.max(X * g.res, Math.min(x, (X + 1) * g.res)), qy = Math.max(Y * g.res, Math.min(y, (Y + 1) * g.res)); best = Math.min(best, Math.hypot(x - qx, y - qy)); }
  return best;
}
export interface FollowOpts { vmax: number; amax: number; mu?: number | null; lookahead: number; track: number; wheelVmax?: number; dt?: number; Tmax?: number; robotR: number }
/** Poursuite pure : courbure κ = 2·sin(α)/Ld ; vitesse limitée par vmax, accélération (min(amax, μ·g)), accélération latérale (μ·g) et vitesse roue max. */
export function purePursuit(g: Grid, pathW: [number, number][], o: FollowOpts) {
  const dt = o.dt ?? 0.02; const aLim = Math.min(o.amax, o.mu != null ? o.mu * 9.81 : Infinity); const latLim = o.mu != null ? o.mu * 9.81 : Infinity;
  let x = pathW[0][0], y = pathW[0][1], th = Math.atan2(pathW[1][1] - y, pathW[1][0] - x), v = 0; let seg = 0; let t = 0;
  const log = { t: [] as number[], x: [] as number[], y: [] as number[], v: [] as number[], clr: [] as number[] }; let minClr = Infinity, maxA = 0, collided = false;
  const goal = pathW[pathW.length - 1];
  while (t < (o.Tmax ?? 120)) {
    while (seg < pathW.length - 2 && Math.hypot(pathW[seg + 1][0] - x, pathW[seg + 1][1] - y) < o.lookahead) seg++;
    let tgt = pathW[Math.min(seg + 1, pathW.length - 1)]; for (let k = seg + 1; k < pathW.length; k++) { tgt = pathW[k]; if (Math.hypot(pathW[k][0] - x, pathW[k][1] - y) >= o.lookahead) break; }
    const alpha = Math.atan2(tgt[1] - y, tgt[0] - x) - th; const a2 = Math.atan2(Math.sin(alpha), Math.cos(alpha)); const Ld = Math.max(Math.hypot(tgt[0] - x, tgt[1] - y), 1e-6);
    const kappa = (2 * Math.sin(a2)) / Ld; const dGoal = Math.hypot(goal[0] - x, goal[1] - y);
    let vT = Math.min(o.vmax, Math.sqrt(2 * aLim * dGoal)); if (Number.isFinite(latLim) && Math.abs(kappa) > 1e-9) vT = Math.min(vT, Math.sqrt(latLim / Math.abs(kappa)));
    if (o.wheelVmax) vT = Math.min(vT, o.wheelVmax / (1 + Math.abs(kappa) * o.track / 2));
    if (Math.abs(a2) > Math.PI / 2) vT = Math.min(vT, 0.05); // réorientation quasi sur place
    const dv = Math.max(-aLim * dt, Math.min(aLim * dt, vT - v)); maxA = Math.max(maxA, Math.abs(dv / dt)); v += dv;
    const w = Math.abs(a2) > Math.PI / 2 ? Math.sign(a2) * 1.0 : v * kappa;
    th += w * dt; x += v * Math.cos(th) * dt; y += v * Math.sin(th) * dt; t += dt;
    const c = clearanceAt(g, x, y, 2); minClr = Math.min(minClr, c - o.robotR); if (c < o.robotR) collided = true;
    if (Math.round(t / dt) % 5 === 0) { log.t.push(t); log.x.push(x); log.y.push(y); log.v.push(v); log.clr.push(c - o.robotR); }
    if (dGoal < 0.05 && v < 0.05) break;
  }
  return { reached: Math.hypot(goal[0] - x, goal[1] - y) < 0.1, time: t, minClearance: minClr, collided, maxAccel: maxA, log, aLim };
}
