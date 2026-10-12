import { store } from './store';
// Éditeur de scénario (grille d'occupation) + A* + poursuite pure.
import { demoWarehouse, navModule } from '../core/modules/catalog';
import { makeGrid, inflate, astar, toWorld, purePursuit, pathLengthCells, type Grid, type Cell } from '../core/modules/planning';
import { topbar } from './platform';
import { pushHist, download } from './history';
export function renderPlanner() {
  const root = document.getElementById('platform')!; let g: Grid = demoWarehouse(); let start: Cell = [5, 5], goal: Cell = [95, 55]; let mode: 'obs' | 'free' | 'start' | 'goal' = 'obs';
  const sp = store.planner; if (sp) { g = { w: sp.w, h: sp.h, res: sp.res, occ: new Uint8Array(sp.w * sp.h) }; sp.occupied.forEach((i) => (g.occ[i] = 1)); start = sp.start; goal = sp.goal; }
  const qs = new URLSearchParams(location.hash.split('?')[1] ?? ''); const cl = (v: string | null, d: number, n: number) => (v == null ? d : Math.min(n - 1, Math.max(0, Math.floor(+v / g.res))));
  if (qs.has('sx')) { start = [cl(qs.get('sx'), start[0], g.w), cl(qs.get('sy'), start[1], g.h)]; goal = [cl(qs.get('gx'), goal[0], g.w), cl(qs.get('gy'), goal[1], g.h)]; }
  let last: { inf?: Grid; path?: Cell[] | null; traj?: { x: number[]; y: number[] } } = {};
  const P = [['robotR', 'Rayon d\'empreinte (m)', 0.3], ['margin', 'Marge de planification (m)', 0.15], ['vmax', 'Vitesse max (m/s)', 1.2], ['amax', 'Accélération max (m/s²)', 1.0], ['mu', 'Adhérence μ (optionnel)', ''], ['track', 'Voie (m)', 0.45], ['lookahead', 'Anticipation (m)', 0.5]] as const;
  root.innerHTML = topbar('plan') + `<div class="page"><h1>Planificateur — robot à roues différentiel</h1><p class="note">Carte d'occupation éditable (résolution 0,1 m). A* sur carte gonflée (empreinte + marge), suivi par poursuite pure, contrôle de collision de l'empreinte sur la carte réelle. Les valeurs initiales sont des <span class="prov p-démo">valeurs de démo</span>.</p>
  <div class="wsgrid" style="grid-template-columns:300px 1fr"><div class="card"><h3>Outil</h3>${[['obs', 'Ajouter obstacle'], ['free', 'Effacer'], ['start', 'Départ'], ['goal', 'Arrivée']].map(([k, l]) => `<label class="note" style="display:block"><input type="radio" name="pm" value="${k}" ${k === 'obs' ? 'checked' : ''} style="width:auto"> ${l}</label>`).join('')}
  <button id="pclear">Carte vide</button><button id="pdemo">Carte entrepôt (démo)</button><h3>Paramètres</h3>${P.map(([k, l, d]) => `<div class="row"><label>${l}</label><input type="number" step="any" id="pp_${k}" value="${sp?.params[k] !== undefined ? (sp.params[k] ?? '') : d}" placeholder="non renseigné"></div>`).join('')}
  <button id="prun" class="primary-s">Planifier et suivre</button><button id="pexp">Exporter la carte (JSON)</button><div id="pres" class="note"></div></div>
  <div class="card"><canvas id="pcv" style="height:auto;aspect-ratio:10/6;cursor:crosshair"></canvas><p class="note">Gris clair : zone interdite par gonflement · bleu : chemin A* · rouge : trajectoire suivie · vert : départ · orange : arrivée.</p></div></div></div>`;
  const cv = document.getElementById('pcv') as HTMLCanvasElement;
  const draw = () => {
    store.planner = { w: g.w, h: g.h, res: g.res, occupied: [...g.occ].flatMap((v, i) => (v ? [i] : [])), start, goal, params: Object.fromEntries(P.map(([k]) => { const el = document.getElementById('pp_' + k) as HTMLInputElement | null; return [k, el && el.value !== '' ? +el.value : null]; })) };
    const W = cv.clientWidth, H = W * 0.6; cv.width = W; cv.height = H; const c = cv.getContext('2d')!; const sx = W / g.w, sy = H / g.h; const Y = (y: number) => H - (y + 1) * sy;
    c.fillStyle = '#0b1220'; c.fillRect(0, 0, W, H);
    if (last.inf) { c.fillStyle = '#1e293b'; for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) if (last.inf.occ[y * g.w + x]) c.fillRect(x * sx, Y(y), sx, sy); }
    c.fillStyle = '#94a3b8'; for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) if (g.occ[y * g.w + x]) c.fillRect(x * sx, Y(y), sx, sy);
    if (last.path) { c.strokeStyle = '#3b82f6'; c.lineWidth = 2; c.beginPath(); last.path.forEach(([x, y], i) => (i ? c.lineTo((x + 0.5) * sx, Y(y) + sy / 2) : c.moveTo((x + 0.5) * sx, Y(y) + sy / 2))); c.stroke(); }
    if (last.traj) { c.strokeStyle = '#f87171'; c.lineWidth = 1.5; c.beginPath(); last.traj.x.forEach((x, i) => { const px = (x / g.res) * sx, py = H - (last.traj!.y[i] / g.res) * sy; i ? c.lineTo(px, py) : c.moveTo(px, py); }); c.stroke(); }
    for (const [cell, col] of [[start, '#22c55e'], [goal, '#f59e0b']] as const) { c.fillStyle = col; c.beginPath(); c.arc((cell[0] + 0.5) * sx, Y(cell[1]) + sy / 2, Math.max(4, sx), 0, 7); c.fill(); }
  };
  const cellAt = (e: MouseEvent): Cell => { const r = cv.getBoundingClientRect(); return [Math.floor(((e.clientX - r.left) / r.width) * g.w), g.h - 1 - Math.floor(((e.clientY - r.top) / r.height) * g.h)]; };
  let down = false;
  const paint = (e: MouseEvent) => { const [x, y] = cellAt(e); if (x < 0 || y < 0 || x >= g.w || y >= g.h) return; if (mode === 'start') start = [x, y]; else if (mode === 'goal') goal = [x, y]; else for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const X = x + dx, Y2 = y + dy; if (X >= 0 && Y2 >= 0 && X < g.w && Y2 < g.h) g.occ[Y2 * g.w + X] = mode === 'obs' ? 1 : 0; } last = {}; draw(); };
  cv.onmousedown = (e) => { down = true; paint(e); }; cv.onmousemove = (e) => { if (down && (mode === 'obs' || mode === 'free')) paint(e); }; window.onmouseup = () => (down = false);
  root.querySelectorAll<HTMLInputElement>('[name=pm]').forEach((r) => (r.onchange = () => (mode = r.value as typeof mode)));
  document.getElementById('pclear')!.onclick = () => { g = makeGrid(100, 60, 0.1); last = {}; draw(); };
  document.getElementById('pdemo')!.onclick = () => { g = demoWarehouse(); last = {}; draw(); };
  document.getElementById('pexp')!.onclick = () => download('carte.json', JSON.stringify({ largeur: g.w, hauteur: g.h, résolution_m: g.res, départ: start, arrivée: goal, occupées: [...g.occ.keys()].filter((i) => g.occ[i]) }));
  document.getElementById('prun')!.onclick = () => {
    const val = (k: string) => { const s = (document.getElementById('pp_' + k) as HTMLInputElement).value.trim(); return s === '' ? null : +s; };
    const v = Object.fromEntries(P.map(([k]) => [k, val(k)])) as Record<string, number | null>; const miss = P.filter(([k]) => k !== 'mu' && v[k] == null).map(([, l]) => l);
    const out = document.getElementById('pres')!; if (miss.length) { out.innerHTML = `<div class="sev-critique">Calcul non exécuté — manquant : ${miss.join(', ')}</div>`; return; }
    const inf = inflate(g, v.robotR! + v.margin!); const path = astar(inf, start, goal); last = { inf, path };
    if (!path) { out.innerHTML = '<div class="sev-critique">Aucun chemin (départ/arrivée bloqués ou passages trop étroits pour empreinte + marge). [calculé]</div>'; draw(); return; }
    const pw = path.filter((_, i) => i % 3 === 0 || i === path.length - 1).map((c) => toWorld(g, c));
    const f = pw.length > 1 ? purePursuit(g, pw, { robotR: v.robotR!, vmax: v.vmax!, amax: v.amax!, mu: v.mu, track: v.track!, lookahead: v.lookahead! }) : null; last.traj = f ? { x: f.log.x, y: f.log.y } : undefined; draw();
    const results = [{ label: 'Longueur du chemin A*', value: (pathLengthCells(path) * g.res).toFixed(2), unit: 'm', nature: 'calculé' }, ...(f ? [{ label: 'Durée de suivi', value: f.time.toFixed(1), unit: 's', nature: 'estimé' }, { label: 'Dégagement minimal', value: (f.minClearance * 100).toFixed(1), unit: 'cm', nature: 'calculé' }, { label: 'Accélération max appliquée', value: f.maxAccel.toFixed(2), unit: 'm/s²', nature: 'calculé' }] : [])];
    const issues = [...(f && f.collided ? [{ severity: 'critique', nature: 'calculé', text: 'Collision de l\'empreinte pendant le suivi : augmentez la marge ou réduisez l\'anticipation.' }] : []), ...(f && !f.reached ? [{ severity: 'critique', nature: 'estimé', text: 'Arrivée non atteinte.' }] : []), ...(v.mu == null ? [{ severity: 'info', nature: 'à valider', text: 'μ non renseigné : adhérence non limitée.' }] : [])];
    out.innerHTML = results.map((r) => `<div>${r.label} : <b>${r.value}</b> ${r.unit} <span class="nat">${r.nature}</span></div>`).join('') + issues.map((i) => `<div class="sev-${i.severity}">• [${i.nature}] ${i.text}</div>`).join('');
    pushHist({ date: new Date().toISOString(), type: 'wheeled', typeName: 'Robot à roues (planificateur)', module: 'nav-grid', moduleTitle: navModule.title + ' (carte éditée)', values: v, ok: !!f && f.reached && !f.collided, summary: f ? `${f.reached ? 'atteint' : 'non atteint'}${f.collided ? ', collision' : ''}` : 'chemin trivial', results, issues, missing: v.mu == null ? ['μ (optionnel)'] : [], assumptions: navModule.assumptions.slice(1) });
  };
  new ResizeObserver(draw).observe(cv); draw();
}
