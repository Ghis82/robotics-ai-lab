// Essaim avec obstacles et mission (rendez-vous ou couverture). Agents ponctuels 2D (disques pour les collisions), sans dynamique de véhicule.
import { initSwarm, type Agent } from './swarm';
export interface Obstacle { x: number; y: number; r: number }
export interface MissionOpts { n: number; size: number; radius: number; sep: number; vmax: number; mission: 'rendezvous' | 'couverture'; goal?: [number, number]; goalR?: number; coverCell?: number; coverTarget?: number; obstacles: Obstacle[]; Tmax: number; dt?: number; seed?: number }
export interface MissionResult { completed: boolean; time: number | null; minSep: number; agentCollisions: number; obstacleCollisions: number; coverage: number; log: { t: number[]; metric: number[] } }
export function runMission(o: MissionOpts): MissionResult {
  const dt = o.dt ?? 0.05; let a: Agent[] = initSwarm(o.n, o.size * 0.25, o.seed ?? 7).map((s) => ({ ...s, x: s.x + 0.5, y: s.y + 0.5 }));
  // déplace les agents initialement dans un obstacle
  a = a.map((s) => { for (const ob of o.obstacles) { const d = Math.hypot(s.x - ob.x, s.y - ob.y); if (d < ob.r + o.radius) { const k = (ob.r + o.radius + 0.05) / Math.max(d, 1e-6); return { ...s, x: ob.x + (s.x - ob.x) * k, y: ob.y + (s.y - ob.y) * k }; } } return s; });
  const cell = o.coverCell ?? 1; const nc = Math.ceil(o.size / cell); const visited = new Uint8Array(nc * nc); const freeCells = (() => { let c = 0; for (let j = 0; j < nc; j++) for (let i = 0; i < nc; i++) if (!o.obstacles.some((ob) => Math.hypot((i + 0.5) * cell - ob.x, (j + 0.5) * cell - ob.y) < ob.r)) c++; return c; })();
  // cibles de couverture : chaque agent balaie une bande (balayage en lacets déterministe)
  // couverture : chaque agent balaie sa bande horizontale en lacets (rangées espacées d'une cellule), à 80 % de vmax
  const bandH = o.size / o.n; const lane = (i: number, t: number): [number, number] => { const rows = Math.max(1, Math.ceil(bandH / cell)); const rowLen = o.size; const sTot = t * o.vmax * 0.8; const total = rows * rowLen + (rows - 1) * cell;
    let s = sTot % (2 * total); if (s > total) s = 2 * total - s; let row = 0; while (row < rows - 1 && s > rowLen + cell) { s -= rowLen + cell; row++; }
    const y = Math.min(o.size - 0.05, i * bandH + (row + 0.5) * Math.min(cell, bandH / rows)); const x = s <= rowLen ? (row % 2 ? rowLen - s : s) : (row % 2 ? 0 : rowLen); return [Math.min(o.size - 0.05, Math.max(0.05, x)), y]; };
  let minSep = Infinity, ac = 0, oc = 0, done: number | null = null; const log = { t: [] as number[], metric: [] as number[] };
  const wasA = new Set<string>(), wasO = new Set<string>();
  for (let k = 0; k * dt <= o.Tmax; k++) {
    const t = k * dt;
    a = a.map((s, i) => {
      const tgt: [number, number] = o.mission === 'rendezvous' ? (o.goal ?? [o.size / 2, o.size / 2]) : lane(i, t);
      let vx = tgt[0] - s.x, vy = tgt[1] - s.y; const dn = Math.hypot(vx, vy) || 1; vx = (vx / dn) * o.vmax; vy = (vy / dn) * o.vmax;
      if (o.mission === 'rendezvous' && dn < (o.goalR ?? 1) * 0.5) { vx *= dn / ((o.goalR ?? 1) * 0.5); vy *= dn / ((o.goalR ?? 1) * 0.5); }
      a.forEach((q, j) => { if (i === j) return; const dx = s.x - q.x, dy = s.y - q.y, d = Math.hypot(dx, dy); if (d < o.sep && d > 1e-9) { const f = (o.sep - d) / o.sep * o.vmax * 2; vx += (dx / d) * f; vy += (dy / d) * f; } });
      for (const ob of o.obstacles) { const dx = s.x - ob.x, dy = s.y - ob.y, d = Math.hypot(dx, dy) - ob.r; if (d < o.sep) { const f = (o.sep - Math.max(d, 0.01)) / o.sep * o.vmax * 3; const n = Math.hypot(dx, dy) || 1; vx += (dx / n) * f; vy += (dy / n) * f; } }
      const sp = Math.hypot(vx, vy); if (sp > o.vmax) { vx *= o.vmax / sp; vy *= o.vmax / sp; }
      return { x: Math.min(o.size, Math.max(0, s.x + vx * dt)), y: Math.min(o.size, Math.max(0, s.y + vy * dt)), vx, vy };
    });
    for (let i = 0; i < a.length; i++) { for (let j = i + 1; j < a.length; j++) { const d = Math.hypot(a[i].x - a[j].x, a[i].y - a[j].y); minSep = Math.min(minSep, d); const key = `${i}-${j}`; if (d < 2 * o.radius) { if (!wasA.has(key)) { ac++; wasA.add(key); } } else wasA.delete(key); }
      o.obstacles.forEach((ob, k2) => { const key = `${i}-${k2}`; if (Math.hypot(a[i].x - ob.x, a[i].y - ob.y) < ob.r + o.radius) { if (!wasO.has(key)) { oc++; wasO.add(key); } } else wasO.delete(key); });
      const ci = Math.floor(a[i].x / cell), cj = Math.floor(a[i].y / cell); if (ci >= 0 && cj >= 0 && ci < nc && cj < nc) visited[cj * nc + ci] = 1; }
    const cov = visited.reduce((s, v) => s + v, 0) / freeCells;
    const metric = o.mission === 'rendezvous' ? Math.max(...a.map((s) => Math.hypot(s.x - (o.goal ?? [o.size / 2, o.size / 2])[0], s.y - (o.goal ?? [o.size / 2, o.size / 2])[1]))) : Math.min(1, cov);
    if (k % 10 === 0) { log.t.push(t); log.metric.push(metric); }
    if (done == null && (o.mission === 'rendezvous' ? metric <= (o.goalR ?? 1) : metric >= (o.coverTarget ?? 0.9))) { done = t; break; }
  }
  return { completed: done != null, time: done, minSep, agentCollisions: ac, obstacleCollisions: oc, coverage: Math.min(1, visited.reduce((s, v) => s + v, 0) / freeCells), log };
}
export function compareN(base: Omit<MissionOpts, 'n'>, ns: number[]) { return ns.map((n) => ({ n, ...runMission({ ...base, n }) })); }
