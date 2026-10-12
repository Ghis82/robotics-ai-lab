import './style.css';
import './platform.css';
import { route } from './router';
import { Viewer } from '../viz/scene';
import { importFiles } from '../viz/importers';
import { drawChart } from './chart';
import { demoScara, demoCobot } from '../core/model';
import { store } from './store';
import { trajectoryDynamics } from '../core/dynamics';
import { showGuide } from './guide';
import './mobile';
setTimeout(() => showGuide(), 300);
import { demoArm, setUserValue, getPath, type RobotModel } from '../core/model';
import { forwardKinematics, checkJointLimits } from '../core/kinematics';
import { detectCollisions } from '../core/collision';
import { centerOfMass } from '../core/mechanics';
import { simulate, type SimResult } from '../core/simulation';
import { analyze, compare, ASSUMPTIONS, type Analysis } from '../core/analysis';
import { reportJSON, reportHTML, reportMarkdown } from '../core/report';
import { deg, rad } from '../core/math';
import { solveIK } from '../core/ik';
import { solveIK6 } from '../core/ik6';
import { axisAngle, matMul } from '../core/math';
import { parseURDF, analyzeURDF, type URDFModel } from '../core/urdf';

const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as T;
let model: RobotModel = demoArm();
let manualQ = model.joints.map(() => 0);
let poses: { q: number[]; duration: number }[] = [
  { q: [0, 0, 0, 0, 0], duration: 0 },
  { q: [45, 60, 45, 30, 0], duration: 2 },
  { q: [-30, -20, 100, 60, 90], duration: 2 },
  { q: [0, 0, 0, 0, 0], duration: 1.5 },
];
let sim: SimResult | null = null, an: Analysis | null = null, saved: Analysis | null = null, frameIdx = 0, playing = false;
const viewer = new Viewer($('#view'));
const provTag = (path: string) => { const p = model.provenance[path] ?? 'démo'; return `<span class="prov p-${p}" title="${p === 'démo' ? 'valeur de démonstration' : p}">${p === 'démo' ? 'valeur de démo' : p}</span>`; };
function field(label: string, path: string, opts: { kind?: 'num' | 'deg' | 'mm' | 'text'; step?: number } = {}) {
  const k = opts.kind ?? 'num'; let v = getPath(model, path);
  const shown = v == null ? '' : k === 'deg' ? deg(v).toFixed(0) : k === 'mm' ? (v * 1000).toFixed(0) : v;
  return `<div class="row"><label>${label} ${provTag(path)}</label><input data-path="${path}" data-kind="${k}" ${k === 'text' ? '' : `type="number" step="${opts.step ?? 'any'}"`} value="${shown}" placeholder="non renseigné"></div>`;
}
function renderConfig() {
  $('#links').innerHTML = model.links.map((l, i) => `<div class="item"><b>${l.name}</b>${field('Longueur (mm)', `links.${i}.length`, { kind: 'mm' })}${field('Masse (kg)', `links.${i}.mass`)}${field('Rayon capsule (mm)', `links.${i}.radius`, { kind: 'mm' })}${field('Matériau', `links.${i}.material`, { kind: 'text' })}</div>`).join('');
  $('#base').innerHTML = `<div class="row"><label>Modèle de travail</label><select id="mkind"><option value="arm" ${(model.kind ?? 'arm') === 'arm' ? 'selected' : ''}>Bras articulé démo (5 axes)</option><option value="scara" ${model.kind === 'scara' ? 'selected' : ''}>SCARA démo (3 rotoïdes)</option><option value="cobot" ${model.kind === 'cobot' ? 'selected' : ''}>Cobot démo (6 axes)</option></select></div>`
    + (model.kind === 'cobot' ? `<div class="item"><b>Seuils cobot déclarés</b><div class="row"><label>Vitesse TCP max (m/s)</label><input type="number" step="any" id="cobv" value="${model.cobotLimits?.tcpSpeed ?? ''}" placeholder="non renseigné"></div><div class="row"><label>Effort de contact max (N)</label><input type="number" step="any" id="cobf" value="${model.cobotLimits?.contactForce ?? ''}" placeholder="non renseigné"></div><div class="note">Comparaison à vos seuils uniquement — aucune évaluation de conformité ISO/TS 15066.</div></div>` : '')
    + field('Hauteur socle (mm)', 'baseHeight', { kind: 'mm' }) + field('Masse socle (kg)', 'baseMass') + field('Rayon d\'appui (mm)', 'baseFootprintRadius', { kind: 'mm' }) + field('Charge utile (kg)', 'payload.mass');
  const o = model.obstacles[0];
  $('#obst').innerHTML = o ? ['X', 'Y', 'Z'].map((a, k) => field(`Centre ${a} (mm)`, `obstacles.0.center.${k}`, { kind: 'mm' })).join('') + field('Rayon (mm)', 'obstacles.0.radius', { kind: 'mm' }) + '<button id="rmobs">Supprimer l\'obstacle</button>' : '<button id="addobs">Ajouter un obstacle</button>';
  $('#motors').innerHTML = model.joints.map((j, i) => `<div class="item"><b>${j.name}</b> ${provTag(`joints.${i}.motor`)}${j.motor ? `<div class="row"><label>Modèle moteur</label><input data-motor="${i}" data-f="model" value="${j.motor.model}"></div><div class="row"><label>Couple max (N·m)</label><input type="number" data-motor="${i}" data-f="maxTorque" value="${j.motor.maxTorque}"></div><div class="row"><label>Vitesse max (°/s)</label><input type="number" data-motor="${i}" data-f="maxSpeed" value="${j.motor.maxSpeed ? deg(j.motor.maxSpeed).toFixed(0) : ''}"></div><button data-rmmotor="${i}">Retirer le moteur</button>` : `<div class="warn">Moteur non déclaré — couple disponible inconnu.</div><button data-addmotor="${i}">Déclarer un moteur</button>`}</div>`).join('');
  $('#limits').innerHTML = model.joints.map((j, i) => `<div class="item"><b>${j.name}</b>${field('Min (°)', `joints.${i}.min`, { kind: 'deg' })}${field('Max (°)', `joints.${i}.max`, { kind: 'deg' })}<div class="row"><label>Pose : <span id="qv${i}">${deg(manualQ[i]).toFixed(0)}°</span></label><input type="range" data-q="${i}" min="${deg(j.min)}" max="${deg(j.max)}" value="${deg(manualQ[i])}"></div></div>`).join('');
  renderPoses(); viewer.build(model); showManual();
}
function loadKind(k: string) {
  model = k === 'scara' ? demoScara() : k === 'cobot' ? demoCobot() : demoArm(); manualQ = model.joints.map(() => 0); sim = null;
  const n = model.joints.length; poses = k === 'scara' ? [{ q: [0, 0, 0], duration: 0 }, { q: [60, 70, 90], duration: 1.5 }, { q: [-45, -60, 0], duration: 1.5 }, { q: [0, 0, 0], duration: 1 }]
    : k === 'cobot' ? [{ q: [0, 30, 30, 0, 0, 0], duration: 0 }, { q: [90, 45, 60, 20, 0, 0], duration: 2 }, { q: [0, 30, 30, 0, 0, 0], duration: 2 }] : [{ q: Array(n).fill(0), duration: 0 }, { q: [45, 60, 45, 30, 0], duration: 2 }, { q: [-30, -20, 100, 60, 90], duration: 2 }, { q: Array(n).fill(0), duration: 1.5 }];
  renderConfig();
}
document.addEventListener('change', (e) => { const el = e.target as HTMLInputElement; if (el.id === 'mkind') loadKind(el.value);
  if (el.id === 'cobv' || el.id === 'cobf') { model.cobotLimits = model.cobotLimits ?? { tcpSpeed: null, contactForce: null }; const v = el.value === '' ? null : +el.value; if (el.id === 'cobv') model.cobotLimits.tcpSpeed = v; else model.cobotLimits.contactForce = v; } });
store.arm = { get: () => ({ model: JSON.parse(JSON.stringify(model)), poses: JSON.parse(JSON.stringify(poses)) }), set: (m, p) => { model = m; poses = p; manualQ = model.joints.map(() => 0); sim = null; renderConfig(); } };
const kindFromHash = () => new URLSearchParams(location.hash.split('?')[1] ?? '').get('modele');
window.addEventListener('hashchange', () => { const k = kindFromHash(); if (location.hash.startsWith('#/atelier/arm') && k && k !== (model.kind ?? 'arm')) loadKind(k); });
setTimeout(() => { const k = kindFromHash(); if (location.hash.startsWith('#/atelier/arm') && k && k !== 'arm') loadKind(k); }, 0);
function renderPoses() {
  $('#poses').innerHTML = `<div class="pose note">${model.joints.map((_, i) => `<span>A${i + 1}</span>`).join('')}<span>durée s</span><span></span></div>` + poses.map((p, k) => `<div class="pose">${p.q.map((v, i) => `<input type="number" data-pose="${k}" data-j="${i}" value="${v}">`).join('')}${k === 0 ? '<span class="note">départ</span>' : `<input type="number" data-pose="${k}" data-j="d" value="${p.duration}" min="0.1" step="0.1">`}${k > 1 ? `<button class="x" data-rmpose="${k}">×</button>` : '<span></span>'}</div>`).join('');
}
function showManual() {
  const fk = forwardKinematics(model, manualQ); const c = detectCollisions(model, fk); const com = centerOfMass(model, fk);
  viewer.update(model, fk, c, com?.com ?? null);
  const lim = checkJointLimits(model, manualQ);
  $('#status').innerHTML = `Pose manuelle · ${c.length ? `<span class="sev-critique">${c.length} collision(s) détectée(s)</span>` : '<span style="color:#4ade80">aucune collision (capsules)</span>'}${lim.length ? ' · <span class="sev-critique">limite dépassée</span>' : ''}`;
}
function showFrame(i: number) {
  if (!sim) return; frameIdx = i; const f = sim.frames[i];
  viewer.update(model, f.fk, f.contacts, f.com);
  ($('#scrub') as HTMLInputElement).value = String(i); $('#tlabel').textContent = `t = ${f.t.toFixed(2)} s`;
  $('#status').innerHTML = `Simulation · ${f.contacts.length ? `<span class="sev-critique">collision : ${f.contacts.map((c) => `${model.links[c.a].name}/${typeof c.b === 'number' ? model.links[c.b].name : c.b}`).join(', ')}</span>` : '<span style="color:#4ade80">aucune collision</span>'}`;
  drawCharts();
}
function drawCharts() {
  const c1 = $('#c1') as HTMLCanvasElement, c2 = $('#c2') as HTMLCanvasElement;
  if (!sim) { drawChart(c1, [], [], { yLabel: '' }); drawChart(c2, [], [], { yLabel: '' }); return; }
  const j = +($('#jsel') as HTMLSelectElement).value; const xs = sim.frames.map((f) => f.t); const mot = model.joints[j].motor;
  const s1 = [{ label: 'dyn. estimé', color: '#f87171', data: sim.frames.map((f) => Math.abs(f.tauDynamic[j])) }, { label: 'statique calculé', color: '#60a5fa', data: sim.frames.map((f) => Math.abs(f.tauStatic[j])) }];
  if (mot) s1.push({ label: 'moteur déclaré', color: '#34d399', data: xs.map(() => mot.maxTorque), dashed: true } as any);
  drawChart(c1, xs, s1, { yLabel: `|τ| N·m${mot ? '' : ' (moteur non déclaré)'}`, cursor: sim.frames[frameIdx]?.t });
  const minClear = (kind: string) => sim!.frames.map((f) => { const fk = f.fk; void fk; const cs = f.contacts.filter((c) => c.kind === kind); return cs.length ? Math.min(...cs.map((c) => c.clearance)) * 1000 : NaN; });
  const clearance = sim.frames.map((f) => minClearanceAll(f.fk) * 1000);
  const s2: any[] = [{ label: 'dégagement min (mm)', color: '#60a5fa', data: clearance }];
  if (sim.frames[0].tipMargin != null) s2.push({ label: 'marge basculement (mm)', color: '#fbbf24', data: sim.frames.map((f) => f.tipMargin! * 1000) });
  void minClear; drawChart(c2, xs, s2, { yLabel: 'mm (négatif = interpénétration / basculement)', cursor: sim.frames[frameIdx]?.t });
}
function minClearanceAll(fk: ReturnType<typeof forwardKinematics>) { const c = detectCollisions(model, fk, Infinity); return Math.min(...c.map((x) => x.clearance)); }
function run() {
  const start = poses[0].q.map(rad); const wps = poses.slice(1).map((p) => ({ q: p.q.map(rad), duration: Math.max(0.1, p.duration) }));
  sim = simulate(model, start, wps, 0.02); an = analyze(model, sim);
  viewer.setTrail(sim.frames.map((f) => f.fk.tip));
  const s = $('#scrub') as HTMLInputElement; s.max = String(sim.frames.length - 1);
  $('#summary').innerHTML = '<ul>' + an.summary.map((x) => `<li>${x}</li>`).join('') + '</ul>';
  try { const d = trajectoryDynamics(model, sim!.frames);
    $('#dyn').innerHTML = `<h3>Dynamique multicorps rigide (RNEA) <span class="nat">calculé</span></h3><p class="note">Couples τ = M(q)q̈ + C(q,q̇)q̇ + g(q) avec tenseurs d'inertie des segments (cylindre plein du rayon de capsule, ou section déclarée), q̇/q̈ par différences finies de la trajectoire. Courbe moteur : modèle CC linéaire τdisp = τmax(1 − |ω|/ωmax) — <b>hypothèse</b> (couple max pris comme couple de blocage, vitesse max comme vitesse à vide).</p>
    <table><thead><tr><th>Axe</th><th>|τ| RNEA max (N·m)</th><th>Couple max déclaré</th><th>Couple-vitesse</th></tr></thead><tbody>${model.joints.map((j, i) => { const is = d.issues.find((x) => x.joint === i); return `<tr><td>${j.name}</td><td>${d.peak[i].toFixed(2)}</td><td>${j.motor ? j.motor.maxTorque : '<span class="sev-avertissement">non déclaré</span>'}</td><td>${!j.motor || !j.motor.maxSpeed ? '—' : is ? `<span class="sev-critique">dépassé à t = ${is.t.toFixed(2)} s : ${Math.abs(is.tau).toFixed(2)} N·m requis, ${is.avail.toFixed(2)} disponibles à ${(Math.abs(is.w) * 180 / Math.PI).toFixed(0)} °/s</span>` : '<span style="color:#4ade80">respectée</span>'}</td></tr>`; }).join('')}</tbody></table>${d.notes.map((n) => `<div class="warn">${n}</div>`).join('')}`; } catch (e) { $('#dyn').innerHTML = `<div class="warn">Dynamique non calculée : ${(e as Error).message}</div>`; }
  $('#anom tbody').innerHTML = an.anomalies.map((a) => `<tr><td class="sev-${a.severity}">${a.severity}</td><td><span class="nat">${a.nature}</span></td><td>${a.title}</td><td>${a.detail}</td><td>${a.suggestion ?? ''}</td></tr>`).join('');
  if (saved) $('#cmp').innerHTML = 'A (mémorisée) → B (actuelle) :<br>' + compare(saved, an).join('<br>');
  showFrame(0);
}
function download(name: string, text: string, type: string) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); }
const needSim = () => { if (!sim || !an) { alert('Lancez d\'abord une simulation : le rapport ne contient que des résultats calculés.'); return false; } return true; };
// ---------- événements ----------
document.addEventListener('change', (e) => {
  const t = e.target as HTMLInputElement;
  if (t.dataset.path) {
    const k = t.dataset.kind; let v: any = t.value.trim();
    v = v === '' ? null : k === 'text' ? v : k === 'deg' ? rad(+v) : k === 'mm' ? +v / 1000 : +v;
    if (v != null && k !== 'text' && !Number.isFinite(v)) return;
    if (t.dataset.path === 'payload.mass' && v == null) v = 0;
    if (t.dataset.path.startsWith('obstacles')) { const ps = t.dataset.path.split('.'); const o: any = model.obstacles[0]; if (ps[2] === 'center') o.center[+ps[3]] = v ?? 0; else o.radius = v ?? 0; }
    else setUserValue(model, t.dataset.path, v);
    sim = null; renderConfig();
  } else if (t.dataset.motor) {
    const m = model.joints[+t.dataset.motor].motor!; const f = t.dataset.f!;
    (m as any)[f] = f === 'model' ? t.value : f === 'maxSpeed' ? (t.value ? rad(+t.value) : undefined) : +t.value;
    model.provenance[`joints.${t.dataset.motor}.motor`] = 'utilisateur'; renderConfig();
  } else if (t.dataset.pose) {
    const p = poses[+t.dataset.pose]; if (t.dataset.j === 'd') p.duration = +t.value; else p.q[+t.dataset.j!] = +t.value;
  } else if (t.id === 'jsel') drawCharts();
});
document.addEventListener('input', (e) => {
  const t = e.target as HTMLInputElement;
  if (t.dataset.q) { manualQ[+t.dataset.q] = rad(+t.value); $(`#qv${t.dataset.q}`).textContent = `${t.value}°`; showManual(); }
  if (t.id === 'scrub') { playing = false; $('#play').textContent = '▶'; showFrame(+t.value); }
});
document.addEventListener('click', (e) => {
  const t = e.target as HTMLElement; const d = t.dataset;
  if (d.tab) { document.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('on', b === t)); document.querySelectorAll<HTMLElement>('[data-pane]').forEach((p) => (p.hidden = p.dataset.pane !== d.tab)); }
  if (d.addmotor) { model.joints[+d.addmotor].motor = { model: 'à préciser', maxTorque: 0 }; model.provenance[`joints.${d.addmotor}.motor`] = 'utilisateur'; renderConfig(); }
  if (d.rmmotor) { model.joints[+d.rmmotor].motor = null; model.provenance[`joints.${d.rmmotor}.motor`] = 'manquant'; renderConfig(); }
  if (d.rmpose) { poses.splice(+d.rmpose, 1); renderPoses(); }
  if (d.act === 'new') { e.preventDefault(); if (confirm('Réinitialiser le projet avec le bras de démonstration ?')) { model = demoArm(); manualQ = model.joints.map(() => 0); sim = null; renderConfig(); } }
  if (t.id === 'rmobs') { model.obstacles = []; renderConfig(); }
  if (t.id === 'addobs') { model.obstacles = [{ name: 'Obstacle (sphère)', center: [0.35, 0, 0.1], radius: 0.08 }]; renderConfig(); }
});
$('#addpose').onclick = () => { poses.push({ q: [...poses[poses.length - 1].q], duration: 2 }); renderPoses(); };
$('#run').onclick = () => { run(); if (!sim || !an) return; import('./history').then(({ pushHist }) => pushHist({ date: new Date().toISOString(), type: 'arm', typeName: model.name, module: 'arm-sim', moduleTitle: 'Atelier bras : trajectoire, collisions, couples',
  values: { payload_kg: model.payload.mass, poses: poses.length }, sources: Object.fromEntries(Object.entries(model.provenance)), ok: !an!.anomalies.some((a) => a.severity === 'critique'), summary: an!.summary[1],
  results: an!.peaks.flatMap((p) => [{ label: `${p.joint} — couple statique max`, value: p.static.toFixed(2), unit: 'N·m', nature: 'calculé' }, { label: `${p.joint} — couple dynamique max`, value: p.dynamic.toFixed(2), unit: 'N·m', nature: 'estimé' }]),
  issues: an!.anomalies.map((a) => ({ severity: a.severity, nature: a.nature, text: `${a.title} — ${a.detail}` })), missing: [], assumptions: an!.assumptions })); };
$('#play').onclick = () => { if (!sim) run(); playing = !playing; $('#play').textContent = playing ? '❚❚' : '▶'; if (playing && frameIdx >= sim!.frames.length - 1) frameIdx = 0; };
setInterval(() => { if (playing && sim) { if (frameIdx >= sim.frames.length - 1) { playing = false; $('#play').textContent = '▶'; } else showFrame(frameIdx + 1); } }, 20);
$('#tAxes').onclick = (e) => { viewer.showAxes = !viewer.showAxes; (e.target as HTMLElement).classList.toggle('on'); sim ? showFrame(frameIdx) : showManual(); };
$('#tCaps').onclick = (e) => { viewer.showCapsules = !viewer.showCapsules; (e.target as HTMLElement).classList.toggle('on'); sim ? showFrame(frameIdx) : showManual(); };
$('#tReset').onclick = () => viewer.resetView();
$('#exJson').onclick = () => needSim() && download('rapport-robotics-ai-lab.json', JSON.stringify(reportJSON(model, sim!, an!), null, 2), 'application/json');
$('#exHtml').onclick = () => needSim() && download('rapport-robotics-ai-lab.html', reportHTML(model, sim!, an!), 'text/html');
$('#exMd').onclick = () => needSim() && download('rapport-robotics-ai-lab.md', reportMarkdown(model, sim!, an!), 'text/markdown');
$('#saveA').onclick = () => { if (needSim()) { saved = an; $('#cmp').textContent = 'Configuration A mémorisée. Modifiez les paramètres puis relancez la simulation pour comparer.'; } };
$('#jsel').innerHTML = model.joints.map((j, i) => `<option value="${i}">${j.name}</option>`).join('');
$('#assume').innerHTML = ASSUMPTIONS.map((a) => `<li>${a}</li>`).join('');
// Import
const drop = $('#drop'), file = $('#file') as HTMLInputElement;
async function handle(files: File[]) {
  if (!files.length) return; $('#impinfo').innerHTML = '<div class="note">Import en cours… (le lecteur STEP OpenCascade ≈ 7 Mo est chargé à la première utilisation)</div>';
  let info; try { info = await importFiles(files); } catch (err) { $('#impinfo').innerHTML = `<div class="warn">Échec de l'import : ${(err as Error).message}</div>`; return; }
  const uf = files.find((f) => /\.urdf$/i.test(f.name)); if (uf) document.dispatchEvent(new CustomEvent('impfile', { detail: await uf.text() })); else { $('#urdfan').innerHTML = ''; }
  $('#impinfo').innerHTML = info.lines.map((l) => `<div class="note">${l}</div>`).join('') + info.warnings.map((w) => `<div class="warn">${w}</div>`).join('')
    + (info.stepVolume ? `<div class="row"><label>Masse volumique (kg/m³) — obligatoire pour une masse</label><input type="number" id="steprho" placeholder="non renseigné"></div><div class="note" id="stepmass">Masse : non calculée (masse volumique non fournie).</div>` : '');
  if (info.stepVolume) { const V = info.stepVolume; ($('#steprho') as HTMLInputElement).oninput = (e) => { const r = +(e.target as HTMLInputElement).value; $('#stepmass').textContent = r > 0 ? `Masse calculée = ${r} × ${(V * 1e6).toFixed(2)} cm³ = ${(r * V).toFixed(4)} kg (pièce pleine et homogène supposée).` : 'Masse : non calculée (masse volumique non fournie).'; }; }
  $('#urdfj').innerHTML = (info.urdfJoints ?? []).map((j, i) => `<div class="row"><label>${j.name} (${j.type})</label><input type="range" data-uj="${i}" min="${j.lower ?? -3.14}" max="${j.upper ?? 3.14}" step="0.01" value="0"></div>`).join('');
  $('#urdfj').oninput = (e) => { const t = e.target as HTMLInputElement; info.urdfJoints![+t.dataset.uj!].set(+t.value); };
  if (info.object) { viewer.showImported(info.object); $('#backdemo').hidden = false; $('#status').textContent = 'Modèle importé (visualisation seulement)'; }
}
drop.onclick = () => file.click(); file.onchange = () => handle([...file.files!]);
drop.ondragover = (e) => { e.preventDefault(); drop.classList.add('over'); }; drop.ondragleave = () => drop.classList.remove('over');
drop.ondrop = (e) => { e.preventDefault(); drop.classList.remove('over'); handle([...e.dataTransfer!.files]); };
$('#backdemo').onclick = () => { viewer.showImported(null); $('#backdemo').hidden = true; showManual(); };
window.addEventListener('resize', drawCharts);
// Pré-remplissage depuis l'analyseur de requêtes (valeur fournie par l'utilisateur → provenance « utilisateur »)
try { const pf = JSON.parse(sessionStorage.getItem('ral-prefill') || '{}'); if (location.hash.startsWith('#/atelier/arm') && pf.payloadMass != null) { setUserValue(model, 'payload.mass', pf.payloadMass); sessionStorage.removeItem('ral-prefill'); } } catch { /* ignore */ }
document.addEventListener('click', (e) => { const g = (e.target as HTMLElement).dataset?.goto; if (g) { e.preventDefault(); if (!location.hash.startsWith('#/atelier/arm')) location.hash = '#/atelier/arm'; if (g === 'import') (document.querySelector('[data-tab=imp]') as HTMLElement).click(); setTimeout(() => document.getElementById(g)?.scrollIntoView({ behavior: 'smooth' }), 50); } });
window.addEventListener('hashchange', () => { if (location.hash.startsWith('#/atelier/arm')) { try { const pf = JSON.parse(sessionStorage.getItem('ral-prefill') || '{}'); if (pf.payloadMass != null) { setUserValue(model, 'payload.mass', pf.payloadMass); sessionStorage.removeItem('ral-prefill'); renderConfig(); run(); } } catch { /* ignore */ } } });
// ---------- IK ----------
let lastIK: number[] | null = null;
$('#iksolve').onclick = () => {
  const t: [number, number, number] = [+($('#ikx') as HTMLInputElement).value / 1000, +($('#iky') as HTMLInputElement).value / 1000, +($('#ikz') as HTMLInputElement).value / 1000];
  const start = manualQ.map((v, i) => (i > 0 && i < 4 && Math.abs(v) < 1e-3 ? 0.1 : v));
  if (($('#ikori') as HTMLInputElement).checked) {
    const [ro, pi, ya] = ($('#ikrpy') as HTMLInputElement).value.split(',').map((x) => rad(+x)); const Rd = matMul(axisAngle([0, 0, 1], ya || 0), matMul(axisAngle([0, 1, 0], pi || 0), axisAngle([1, 0, 0], ro || 0)));
    const r6 = solveIK6(model, t, Rd, start, { wOri: +($('#ikwo') as HTMLInputElement).value || 0.3 }); lastIK = r6.q; manualQ = [...r6.q]; renderConfig();
    $('#ikres').innerHTML = `<b class="${r6.reached ? '' : 'sev-critique'}">${r6.reached ? 'Position et orientation atteintes' : 'Non atteint (compromis)'}</b> — erreur position ${(r6.posError * 1000).toFixed(2)} mm · orientation ${deg(r6.oriError).toFixed(2)}° · ${r6.iterations} itérations<br>Angles : ${r6.q.map((v) => deg(v).toFixed(1) + '°').join(', ')}${r6.atLimit.length ? `<br><span class="sev-avertissement">En butée : ${r6.atLimit.map((i) => model.joints[i].name).join(', ')}</span>` : ''}<br><small>${r6.note} Orientation de référence : axe z de l'outil = axe du dernier segment. Angles roulis-tangage-lacet (X, Y, Z fixes).</small>`;
    return;
  }
  const r = solveIK(model, t, start);
  lastIK = r.q; manualQ = [...r.q]; renderConfig();
  $('#ikres').innerHTML = `<b class="${r.reached ? '' : 'sev-critique'}">${r.reached ? 'Cible atteinte' : 'Cible non atteinte'}</b> — atteignable : ${r.reachable} · erreur ${(r.error * 1000).toFixed(2)} mm · ${r.iterations} itérations<br>Angles : ${r.q.map((v) => deg(v).toFixed(1) + '°').join(', ')}${r.atLimit.length ? `<br><span class="sev-avertissement">En butée : ${r.atLimit.map((i) => model.joints[i].name).join(', ')}</span>` : ''}<br><small>IK numérique (moindres carrés amortis) sur la position seule ; une seule solution parmi plusieurs possibles, dépend du point de départ. Collisions vérifiées sur la pose affichée.</small>`;
};
$('#ikori').onchange = (e) => { $('#ikoriBox').hidden = !(e.target as HTMLInputElement).checked; };
$('#ikadd').onclick = () => { if (!lastIK) return alert('Résolvez d\'abord l\'IK.'); poses.push({ q: lastIK.map((v) => +deg(v).toFixed(1)), duration: 2 }); renderPoses(); };
// ---------- URDF → moteur ----------
let urdfM: URDFModel | null = null; const urdfQ: Record<string, number> = {};
function urdfAnalysis() {
  if (!urdfM) return; const a = analyzeURDF(urdfM, urdfQ);
  $('#urdfan').innerHTML = `<h3>Analyse moteur du URDF « ${urdfM.name} »</h3><table><tr><th>Articulation</th><th>Statique</th><th>Effort déclaré</th></tr>${a.torques.map((t) => `<tr><td>${t.joint} (${t.type})</td><td>${t.value.toFixed(2)} ${t.unit} <span class="nat">calculé</span></td><td class="${t.ok === false ? 'sev-critique' : ''}">${t.effort ?? '<span class="sev-avertissement">non déclaré</span>'}</td></tr>`).join('')}</table>
  <div class="note">Masse connue : ${a.massKnown.toFixed(2)} kg${a.massMissing.length ? ` · <span class="sev-avertissement">sans masse : ${a.massMissing.join(', ')}</span>` : ''}</div>
  ${a.limits.map((l) => `<div class="sev-critique">Limite : ${l}</div>`).join('')}
  <div>${a.collisions.length ? a.collisions.map((c) => `<div class="sev-critique">Collision ${c.a} / ${c.b} (${(c.clearance * 1000).toFixed(0)} mm) <span class="nat">estimé</span></div>`).join('') : '<span class="note">Aucune collision détectée (capsules estimées).</span>'}</div>
  ${urdfM.warnings.map((w) => `<div class="warn">${w}</div>`).join('')}<div class="note">Capsules de collision ESTIMÉES à partir des origines d'articulation et de la géométrie de collision (rayon par défaut 20 mm si absente) ; paires adjacentes et à deux niveaux ignorées.</div>`;
}
document.addEventListener('impfile', ((e: CustomEvent) => { try { urdfM = parseURDF(e.detail); Object.keys(urdfQ).forEach((k) => delete urdfQ[k]); urdfAnalysis(); } catch (err) { $('#urdfan').innerHTML = `<div class="warn">URDF non analysable : ${(err as Error).message}</div>`; } }) as EventListener);
$('#urdfj').addEventListener('input', (e) => { const t = e.target as HTMLInputElement; const name = t.closest('.row')!.querySelector('label')!.textContent!.split(' (')[0]; urdfQ[name] = +t.value; urdfAnalysis(); });
$('#urdfdemo').onclick = async () => { const txt = await (await fetch('samples/sample_arm.urdf')).text(); await handle([new File([txt], 'sample_arm.urdf', { type: 'text/xml' })]); };
// ---------- Rapier (expérimental, chargé à la demande) ----------
let rapSamples: { t: number; q: number[]; contacts: number }[] | null = null;
$('#rapj').innerHTML = model.joints.map((j, i) => `<option value="${i}">${j.name}</option>`).join('');
function drawRap() { if (!rapSamples || !sim) return; const j = +($('#rapj') as HTMLSelectElement).value; const xs = rapSamples.map((s) => s.t);
  const ana = rapSamples.map((s) => { const f = sim!.frames[Math.min(sim!.frames.length - 1, Math.round(s.t / sim!.dt))]; return deg(f.q[j]); });
  drawChart($('#c3') as HTMLCanvasElement, xs, [{ label: 'consigne (analytique)', color: '#60a5fa', data: ana }, { label: 'Rapier (mesuré)', color: '#f87171', data: rapSamples.map((s) => deg(s.q[j])) }], { yLabel: '°' }); }
$('#rapj').onchange = drawRap;
$('#rapRun').onclick = async () => {
  if (!sim) run(); $('#rapres').textContent = 'Chargement du moteur Rapier (WASM)…';
  const { initRapier, RapierArm } = await import('../physics/rapierArm'); await initRapier();
  const ra = new RapierArm(model, sim!.frames[0].q, { stiffness: 20000, damping: 400, dt: 1 / 480, motors: true }); const S = sim!;
  const gEng = ra.gravityTorquesFromEngine(); const gAna = sim!.frames[0].tauStatic; const unp = ra.unpowered.map((i) => model.joints[i].name);
  rapSamples = ra.run(S.frames[S.frames.length - 1].t + 0.5, (t) => S.frames[Math.min(S.frames.length - 1, Math.round(t / S.dt))].q); ra.free();
  const errs = model.joints.map((_, j) => Math.max(...rapSamples!.map((s) => { const f = S.frames[Math.min(S.frames.length - 1, Math.round(s.t / S.dt))]; return Math.abs(s.q[j] - f.q[j]); })));
  const cont = rapSamples.filter((s) => s.contacts > 0).length; const pairs = [...new Set(rapSamples.flatMap((s) => (s as any).pairs as string[]))];
  const first = rapSamples.find((s) => s.contacts > 0);
  $('#rapres').innerHTML = `Simulation numérique terminée (${rapSamples.length} échantillons). Écart de suivi max par axe : ${errs.map((e, i) => `${model.joints[i].name.split(' (')[0]} ${deg(e).toFixed(1)}°`).join(' · ')}.<br>Échantillons avec contact physique (hors paires adjacentes) : ${cont}${pairs.length ? ` — paires : ${pairs.join(', ')} (premier à t = ${first!.t.toFixed(2)} s)` : ''}.<br>
  Couples moteurs bornés aux valeurs déclarées (le solveur limite l'impulsion à couple × dt).${unp.length ? ` <span class="sev-avertissement">Non motorisé (moteur non déclaré) : ${unp.join(', ')}.</span>` : ''}<br>
  Relecture des couples gravitaires à t = 0 depuis les masses/CdM stockés dans Rapier vs analytique : ${gEng.map((g, i) => `${model.joints[i].name.split(' (')[0]} ${Math.abs(g).toFixed(2)}/${Math.abs(gAna[i]).toFixed(2)} N·m`).join(' · ')}.<br><b>Limites :</b> segments = capsules rigides avec masse et inertie de tige homogène (hypothèse), moteurs = régulateurs PD idéaux sans saturation de couple ni modèle électrique, pas de frottement articulaire ; résultats dépendants du pas de temps et des gains. Ne remplace pas une validation sur MuJoCo/Drake ni des essais.`;
  ($('#rapPlay') as HTMLButtonElement).disabled = false; drawRap();
};
$('#rapPlay').onclick = () => { if (!rapSamples) return; let k = 0; const id = setInterval(() => { if (k >= rapSamples!.length) return clearInterval(id); const q = rapSamples![k]; const fk = forwardKinematics(model, q.q); viewer.update(model, fk, detectCollisions(model, fk), null); $('#status').innerHTML = `<span class="badge b-exp">Rapier</span> t = ${q.t.toFixed(2)} s`; k += 2; }, 16); };
renderConfig(); run(); route();
