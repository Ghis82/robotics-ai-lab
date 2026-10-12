// Pages plateforme : accueil, bibliothèque, fiche détaillée, atelier générique par famille.
import { FAMILIES, ROBOT_TYPES, typeById, searchTypes, type RobotType, type Status } from '../core/registry';
import { ALL_MODULES } from '../core/modules/catalog';
import { defaultValues, runModule, type ParamValues, type ModuleResult } from '../core/modules/types';
import { parseRequest } from '../core/nlp';
import { buildProcedural, thumbnail } from '../viz/procedural';
import { importFiles } from '../viz/importers';
import { Viewer } from '../viz/scene';
import { drawChart } from './chart';

const root = document.getElementById('platform')!;
const esc = (s: string) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const badge = (s: Status) => `<span class="badge b-${s === 'Disponible' ? 'ok' : s === 'Expérimental' ? 'exp' : 'todo'}">${s}</span>`;
const CAPL: Record<string, string> = { visualisation: 'Visualisation', configuration: 'Configuration', cinematique: 'Cinématique', physique: 'Physique' };
const hasWorkspace = (r: RobotType) => !!r.armWorkspace || r.modules.length > 0;
let viewer: Viewer | null = null;
function mountViewer(el: HTMLElement, shape: string) { viewer = new Viewer(el); viewer.showImported(buildProcedural(shape)); return viewer; }
import { loadHist, pushHist, histFromResult, download } from './history';
import { store, moduleValues, applyProject } from './store';
import { makeProject, validateProject } from '../core/project';
import { assist, type AssistantAnswer } from '../core/assistant';
import { globalMarkdown, globalHTML, buildGlobal } from '../core/globalReport';
export const topbar = (active: string) => `<header class="topbar"><a href="#/" class="brand">⬢ Robotics AI Lab</a><a href="#/" class="${active === 'home' ? 'on' : ''}">Accueil</a><a href="#/bibliotheque" class="${active === 'lib' ? 'on' : ''}">Bibliothèque de robots</a><a href="#/comparateur" class="${active === 'cmp' ? 'on' : ''}">Comparateur</a><a href="#/planificateur" class="${active === 'plan' ? 'on' : ''}">Planificateur</a><a href="#/atelier/arm">Atelier bras articulé</a><a href="#/resistance" class="${active === 'res' ? 'on' : ''}">Résistance</a><a href="#/validation" class="${active === 'val' ? 'on' : ''}">Validation</a><span class="note">Prototype — aucun résultat n'est inventé.</span><button onclick="window.__ralGuide()" title="Guide de démarrage">❓ Guide</button><button onclick="window.__ralSave()">💾 Enregistrer le projet</button><label class="btn">📂 Ouvrir un projet<input type="file" accept=".json" hidden onchange="window.__ralLoad(this)"></label></header>`;

export function renderHome() {
  const hist = loadHist();
  root.innerHTML = topbar('home') + `<div class="page">
  <section class="hero"><h1>Concevoir, simuler et analyser des robots — honnêtement.</h1><p>Décrivez votre besoin en français : l'analyseur à règles le transforme en paramètres structurés, liste les données manquantes et oriente vers les modules réellement implémentés.</p>
  <div class="nlbox"><input id="nl" placeholder="Ex. : Configure un robot à roues pour inspecter un entrepôt"><button id="nlgo" class="primary-s">Analyser et exécuter</button></div><label class="note"><input type="checkbox" id="nldemo" style="width:auto"> Accepter les valeurs de démonstration étiquetées pour les champs qui en ont (sinon toutes les données obligatoires doivent être fournies)</label>
  <div class="examples">${['Configure un robot à roues pour inspecter un entrepôt', 'Simule un bras qui déplace un objet de deux kilogrammes', 'Compare deux configurations de drone'].map((e) => `<button class="ex">${e}</button>`).join('')}</div><div id="nlout"></div></section>
  <h2>Familles de robots</h2><div class="grid">${FAMILIES.map((f) => { const types = ROBOT_TYPES.filter((r) => r.family === f.id); const sim = types.filter(hasWorkspace).length; return `<a class="card fam" href="#/bibliotheque?f=${f.id}"><div class="ico">${f.icon}</div><b>${f.name}</b><p class="note">${f.description}</p><p class="note">${types.length} types · ${sim} avec simulation opérationnelle</p></a>`; }).join('')}</div>
  <h2>Historique des simulations <small class="note">(stocké localement dans le navigateur)</small></h2><div><b>Rapport global de session :</b> <button id="gHtml">HTML</button><button id="gMd">Markdown</button><button id="gJson">JSON</button> <span class="note">Agrège toutes les exécutions, classées calculé / estimé / à valider.</span></div>
  ${hist.length ? `<table class="tbl"><tr><th>Date</th><th>Robot</th><th>Module</th><th>Résultat</th></tr>${hist.slice(0, 10).map((h) => `<tr><td>${new Date(h.date).toLocaleString('fr-FR')}</td><td>${esc(typeById(h.type)?.name ?? h.type)}</td><td>${esc(h.moduleTitle ?? ALL_MODULES[h.module]?.title ?? h.module)}</td><td>${h.ok ? '✔' : '✖'} ${esc(h.summary)}</td></tr>`).join('')}</table><button id="clrh">Effacer l'historique</button>` : '<p class="note">Aucune simulation enregistrée.</p>'}</div>`;
  let userVals: Record<string, number> = {};
  const go = (fresh = true) => {
    const text = (document.getElementById('nl') as HTMLInputElement).value; if (fresh) userVals = {};
    const acceptDemo = (document.getElementById('nldemo') as HTMLInputElement).checked;
    const a: AssistantAnswer = assist(text, { userValues: userVals, acceptDemo }); const p = a.parsed;
    const out = document.getElementById('nlout')!;
    out.innerHTML = `<div class="card"><h3>1. Interprétation structurée</h3><table class="tbl">
      <tr><td>Intention</td><td>${p.intent}</td></tr><tr><td>Type de robot</td><td>${p.type ? esc(p.type.name) : '<span class="sev-critique">non reconnu</span>'}</td></tr>
      <tr><td>Paramètres extraits du texte</td><td>${Object.keys(p.params).length ? Object.entries(p.params).map(([k, v]) => `${k} = ${v}`).join(', ') : '—'}</td></tr>
      <tr><td>Contexte</td><td>${p.context.join(', ') || '—'}</td></tr><tr><td>Module retenu</td><td>${a.moduleId ? esc(ALL_MODULES[a.moduleId].title) : '—'}</td></tr></table>
      ${a.moduleId ? `<h3>2. Validation des données</h3>${a.missing.length ? `<p class="sev-avertissement">Données obligatoires manquantes — saisissez-les (aucune valeur n'est inventée) :</p><div id="nlform">${a.missing.map((m) => `<div class="row"><label>${esc(m.label)} ${m.unit ? `(${esc(m.unit)})` : ''}${m.help ? `<br><small class="note">${esc(m.help)}</small>` : ''}</label><input type="number" step="any" data-nk="${m.key}" placeholder="à saisir"></div>`).join('')}</div><button id="nlfill" class="primary-s">Valider et exécuter</button>` : '<p class="note">Toutes les données obligatoires sont présentes.</p>'}
      <details><summary class="note">Valeurs utilisées</summary><table class="tbl">${ALL_MODULES[a.moduleId].params.map((prm) => { const v = a.values![prm.key]; return `<tr><td>${esc(prm.label)}</td><td>${v.value ?? '—'} ${prm.unit}</td><td><span class="prov p-${v.src}">${v.src === 'démo' ? 'valeur de démo' : v.src}</span></td></tr>`; }).join('')}</table></details>` : ''}
      <h3>${a.moduleId ? '3. ' : ''}Explication de l'assistant <small class="note">(règles déterministes, uniquement à partir des calculs)</small></h3><ul>${a.explanation.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>${a.comparison ? `<table class="tbl"><tr><th>Grandeur</th><th>Nature</th>${a.comparison.configs.map((c) => `<th>${esc(c)}</th>`).join('')}</tr>${a.comparison.results.map((r) => `<tr><td>${esc(r.label)}</td><td>${r.nature}</td>${r.values.map((v) => `<td>${v ?? '—'}${r.unit ? ' ' + r.unit : ''}</td>`).join('')}</tr>`).join('')}</table>` : ''}${a.parsed.mission?.kind === 'trajet' ? `<a class="btn" href="#/planificateur?sx=${a.parsed.mission.from![0]}&sy=${a.parsed.mission.from![1]}&gx=${a.parsed.mission.to![0]}&gy=${a.parsed.mission.to![1]}">Ouvrir ce trajet dans le planificateur</a>` : ''}
      ${a.result ? `<table class="tbl">${a.result.results.map((x) => `<tr><td>${esc(x.label)}</td><td><b>${esc(String(x.value))}</b> ${x.unit ?? ''}</td><td><span class="nat">${x.nature}</span></td></tr>`).join('')}</table>` : ''}
      ${p.intent === 'comparer' && a.moduleId ? `<a class="btn primary-s" href="#/comparateur?m=${a.moduleId}">Ouvrir le comparateur (${esc(ALL_MODULES[a.moduleId].title)})</a>` : ''}
      ${p.type && (p.type.armWorkspace || p.type.modules.length) ? `<button id="nlopen">Ouvrir l'atelier « ${esc(p.type.name)} »</button>` : ''}</div>`;
    if (a.result) pushHist(histFromResult(p.type!.id, p.type!.name, a.moduleId!, ALL_MODULES[a.moduleId!].title, a.values!, a.result));
    document.getElementById('nlfill')?.addEventListener('click', () => { root.querySelectorAll<HTMLInputElement>('[data-nk]').forEach((i) => { if (i.value.trim() !== '' && Number.isFinite(+i.value)) userVals[i.dataset.nk!] = +i.value; }); go(false); });
    document.getElementById('nlopen')?.addEventListener('click', () => { sessionStorage.setItem('ral-prefill', JSON.stringify(p.params)); location.hash = `#/atelier/${p.type!.id}`; });
  };
  document.getElementById('nlgo')!.onclick = () => go();
  (document.getElementById('nl') as HTMLInputElement).onkeydown = (e) => { if (e.key === 'Enter') go(); };
  root.querySelectorAll<HTMLButtonElement>('.ex').forEach((b) => (b.onclick = () => { (document.getElementById('nl') as HTMLInputElement).value = b.textContent!; go(); }));
  document.getElementById('gHtml')!.onclick = () => download('rapport-global.html', globalHTML(loadHist()), 'text/html');
  document.getElementById('gMd')!.onclick = () => download('rapport-global.md', globalMarkdown(loadHist()), 'text/markdown');
  document.getElementById('gJson')!.onclick = () => download('rapport-global.json', JSON.stringify(buildGlobal(loadHist()), null, 2));
  document.getElementById('clrh')?.addEventListener('click', () => { localStorage.removeItem('ral-history'); renderHome(); });
}

export function renderLibrary(params: URLSearchParams) {
  root.innerHTML = topbar('lib') + `<div class="page"><h1>Bibliothèque de robots</h1>
  <div class="filters"><input id="q" placeholder="Rechercher (ex. drone, entrepôt, pince…)" value="${esc(params.get('q') ?? '')}">
  <select id="fam"><option value="">Toutes les familles</option>${FAMILIES.map((f) => `<option value="${f.id}" ${params.get('f') === f.id ? 'selected' : ''}>${f.name}</option>`).join('')}</select>
  <select id="st"><option value="">Tout statut</option><option>Disponible</option><option>Expérimental</option><option>À développer</option></select></div><div id="cards"></div></div>`;
  const draw = () => {
    const q = (document.getElementById('q') as HTMLInputElement).value, f = (document.getElementById('fam') as HTMLSelectElement).value, s = (document.getElementById('st') as HTMLSelectElement).value as Status;
    const list = searchTypes(q, f || undefined, s || undefined);
    document.getElementById('cards')!.innerHTML = FAMILIES.filter((fa) => list.some((r) => r.family === fa.id)).map((fa) => `<h2>${fa.icon} ${fa.name}</h2><div class="grid">${list.filter((r) => r.family === fa.id).map((r) => `<a class="card rcard" href="#/robot/${r.id}"><img alt="" src="${thumbnail(r.shape)}"><b>${esc(r.name)}</b><p class="note">${esc(r.description)}</p><div>${Object.entries(r.capabilities).map(([k, v]) => `<div class="caprow"><span>${CAPL[k]}</span>${badge(v)}</div>`).join('')}</div></a>`).join('')}</div>`).join('') || '<p class="note">Aucun résultat.</p>';
  };
  ['q', 'fam', 'st'].forEach((id) => document.getElementById(id)!.addEventListener('input', draw)); draw();
}

export function renderDetail(id: string) {
  const r = typeById(id); if (!r) { root.innerHTML = topbar('lib') + '<div class="page">Type inconnu.</div>'; return; }
  const fam = FAMILIES.find((f) => f.id === r.family)!;
  root.innerHTML = topbar('lib') + `<div class="page detail"><p><a href="#/bibliotheque">← Bibliothèque</a> / ${fam.name}</p><h1>${esc(r.name)}</h1><p>${esc(r.description)}</p>
  <div class="split"><div class="card"><div id="dview" class="view3d"></div><p class="tag">Modèle générique non validé — illustration procédurale sans données mécaniques.</p></div>
  <div class="card"><h3>Statut des capacités</h3>${Object.entries(r.capabilities).map(([k, v]) => `<div class="caprow"><span>${CAPL[k]}</span>${badge(v)}</div>`).join('')}
  <h3>Composants</h3><p>${r.components.join(', ') || '<span class="note">à définir</span>'}</p><h3>Articulations / axes</h3><p>${esc(r.joints)}</p>
  <h3>Paramètres configurables</h3><p>${r.params.join(', ') || '<span class="note">à définir</span>'}</p><h3>Formats d'import</h3><p>${r.importFormats.join(', ')} <span class="note">(STEP : conversion OpenCascade côté serveur requise)</span></p>
  <h3>Simulations prises en charge</h3><ul>${r.armWorkspace ? '<li>Atelier bras : cinématique, trajectoires, collisions, couples, basculement</li>' : ''}${r.modules.map((m) => `<li>${esc(ALL_MODULES[m].title)}</li>`).join('') || '<li class="note">Aucune simulation implémentée</li>'}</ul>
  <h3>Non implémenté</h3><ul>${r.notImplemented.map((n) => `<li class="note">${esc(n)}</li>`).join('')}</ul>
  ${r.armWorkspace ? `<a class="btn primary-s" href="#/atelier/arm?modele=${r.armModel ?? 'arm'}">Ouvrir l'atelier ${r.armModel === 'scara' ? 'SCARA' : r.armModel === 'cobot' ? 'cobot' : 'bras'} (dynamique, collisions, Rapier)</a>` : ''}
  <button class="primary-s" ${hasWorkspace(r) && r.modules.length ? '' : 'disabled title="Aucun module de simulation implémenté et testé pour ce type"'} onclick="location.hash='#/atelier/${r.id}${r.armWorkspace ? '/modules' : ''}'">${r.armWorkspace ? 'Modules complémentaires' : 'Ouvrir l\'atelier de simulation'}</button></div></div></div>`;
  mountViewer(document.getElementById('dview')!, r.shape);
}

export function renderWorkspace(id: string) {
  const r = typeById(id)!; let mod = ALL_MODULES[r.modules[0]]; const vals: Record<string, ParamValues> = {};
  const prefill = JSON.parse(sessionStorage.getItem('ral-prefill') || '{}'); sessionStorage.removeItem('ral-prefill');
  r.modules.forEach((m) => { vals[m] = moduleValues(m); if (prefill.payloadMass != null && vals[m].mass && m === 'gripper') vals[m].mass = { value: prefill.payloadMass, src: 'utilisateur' }; if (prefill.n_rotor != null && m === 'aerial') vals[m].nRotors = { value: prefill.n_rotor, src: 'utilisateur' }; });
  let last: ModuleResult | null = null; let saved: ModuleResult | null = null;
  root.innerHTML = topbar('lib') + `<div class="page ws"><p><a href="#/robot/${r.id}">← Fiche ${esc(r.name)}</a></p><h1>Atelier — ${esc(r.name)}</h1>
  <div class="wsgrid"><div class="card"><h3>Scénario / module</h3><select id="msel">${r.modules.map((m) => `<option value="${m}">${esc(ALL_MODULES[m].title)}</option>`).join('')}</select><p class="note" id="mdesc"></p><div id="pform"></div>
    <button id="mrun" class="primary-s">Exécuter le calcul</button><button id="mexp">Exporter la configuration (JSON)</button><label class="btn">Importer une config.<input type="file" id="mimp" accept=".json" hidden></label></div>
  <div class="card"><div id="wview" class="view3d"></div><p class="tag">Modèle générique non validé.</p><label class="btn">⇪ Importer un modèle 3D (GLB/glTF, STL, OBJ, URDF)<input type="file" id="w3d" multiple hidden></label><div id="w3dinfo"></div></div>
  <div class="card"><h3>Résultats</h3><div id="mres" class="note">Aucun calcul exécuté.</div><canvas id="mchart" style="display:none"></canvas>
    <button id="mrep">Exporter le rapport (Markdown)</button><button id="mrepj">Rapport JSON</button><button id="msave">Mémoriser (comparaison)</button><button id="mgrip" hidden>Vérifier la saisie dans Rapier (expérimental)</button><div id="mgripres" class="note"></div><a class="btn" href="#/comparateur?m=${r.modules[0]}">Comparateur N configurations</a><div id="mcmp" class="note"></div></div></div></div>`;
  mountViewer(document.getElementById('wview')!, r.shape);
  const form = () => {
    document.getElementById('mdesc')!.textContent = mod.description;
    document.getElementById('pform')!.innerHTML = mod.params.map((p) => { const v = vals[mod.id][p.key]; return `<div class="row"><label>${esc(p.label)} ${p.unit ? `(${p.unit})` : ''} <span class="prov p-${v.src}">${v.src === 'démo' ? 'valeur de démo' : v.src}</span>${p.required ? '' : ' <span class="note">optionnel</span>'}${p.help ? `<br><small class="note">${esc(p.help)}</small>` : ''}</label><input type="number" step="any" data-k="${p.key}" value="${v.value ?? ''}" placeholder="non renseigné"></div>`; }).join('');
  };
  const show = (res: ModuleResult) => {
    const el = document.getElementById('mres')!;
    el.innerHTML = `${res.results.length ? `<table class="tbl">${res.results.map((x) => `<tr><td>${esc(x.label)}</td><td><b>${esc(String(x.value))}</b> ${x.unit ?? ''}</td><td><span class="nat">${x.nature}</span></td></tr>`).join('')}</table>` : ''}
      <h4>Anomalies</h4>${res.issues.map((i) => `<div class="sev-${i.severity}">• [${i.nature}] ${esc(i.text)}</div>`).join('') || '—'}
      <h4>Données manquantes</h4>${res.missing.map((m) => `<div class="sev-avertissement">• ${esc(m)}</div>`).join('') || '—'}<h4>Hypothèses</h4>${res.assumptions.map((a) => `<div>• ${esc(a)}</div>`).join('')}`;
    const cv = document.getElementById('mchart') as HTMLCanvasElement; const s = res.series?.[0];
    cv.style.display = s ? 'block' : 'none'; if (s) drawChart(cv, s.x, [{ label: s.label, color: '#60a5fa', data: s.y }], { yLabel: s.yLabel });
  };
  const run = () => { last = runModule(mod, vals[mod.id]); last.assumptions = mod.assumptions; show(last); pushHist(histFromResult(r.id, r.name, mod.id, mod.title, vals[mod.id], last));
    if (saved) document.getElementById('mcmp')!.innerHTML = 'Comparaison A → B :<br>' + last.results.map((x) => { const a = saved!.results.find((y) => y.label === x.label); return `${esc(x.label)} : ${a ? esc(String(a.value)) : '—'} → ${esc(String(x.value))} ${x.unit ?? ''}`; }).join('<br>'); };
  const gripBtn = () => { document.getElementById('mgrip')!.hidden = mod.id !== 'gripper'; };
  form(); gripBtn();
  (document.getElementById('msel') as HTMLSelectElement).onchange = (e) => { mod = ALL_MODULES[(e.target as HTMLSelectElement).value]; form(); gripBtn(); };
  document.getElementById('mgrip')!.onclick = async () => {
    const v = vals.gripper; const need = ['mass', 'mu', 'n', 'accel', 'fmax'].filter((k) => v[k]?.value == null); const out = document.getElementById('mgripres')!;
    if (need.length) { out.innerHTML = `<span class="sev-critique">Simulation non lancée : renseignez ${need.map((k) => ALL_MODULES.gripper.params.find((p) => p.key === k)!.label).join(', ')} (l'effort de serrage disponible est obligatoire ici).</span>`; return; }
    if (v.n.value !== 2) { out.innerHTML = '<span class="sev-avertissement">La simulation Rapier modélise uniquement une pince à 2 doigts (n = 2).</span>'; return; }
    out.textContent = 'Simulation Rapier en cours…'; const { initRapier, simulateGrip } = await import('../physics/rapierGripper'); await initRapier();
    const g = simulateGrip({ boxMass: v.mass.value!, box: [0.03, 0.03, 0.05], mu: v.mu.value!, fingerForce: v.fmax.value!, liftAccel: v.accel.value! });
    out.innerHTML = `<b class="${g.held ? '' : 'sev-critique'}">${g.held ? 'Objet maintenu' : g.boxDropped ? 'Objet lâché (glissement)' : 'Glissement détecté'}</b> — glissement relatif ${(g.slip * 1000).toFixed(1)} mm après 0,6 s de levée à ${v.accel.value} m/s².<br>Effort analytique requis F ≥ m(g+a)/(2μ) = ${g.required.toFixed(1)} N ; effort déclaré ${v.fmax.value} N (${(100 * v.fmax.value! / g.required).toFixed(0)} %).<br><small>Expérimental : boîte 60×60×100 mm, frottement de Coulomb du solveur Rapier, doigts rigides, effort borné par le moteur de glissière ; validation physique nécessaire.</small>`;
  };
  document.getElementById('pform')!.onchange = (e) => { const t = e.target as HTMLInputElement; const v = t.value.trim(); vals[mod.id][t.dataset.k!] = { value: v === '' ? null : +v, src: v === '' ? 'manquant' : 'utilisateur' }; form(); };
  document.getElementById('mrun')!.onclick = run;
  const cfg = () => ({ robot: r.id, module: mod.id, valeurs: vals[mod.id], avertissement: 'Configuration de prototype ; valeurs « démo » non réelles.' });
  document.getElementById('mexp')!.onclick = () => download(`config-${r.id}-${mod.id}.json`, JSON.stringify(cfg(), null, 2));
  (document.getElementById('mimp') as HTMLInputElement).onchange = async (e) => { const f = (e.target as HTMLInputElement).files![0]; const j = JSON.parse(await f.text()); if (ALL_MODULES[j.module] && vals[j.module]) { vals[j.module] = store.modules[j.module] = j.valeurs; mod = ALL_MODULES[j.module]; (document.getElementById('msel') as HTMLSelectElement).value = j.module; form(); } else alert('Configuration incompatible avec ce robot.'); };
  const rep = () => last ? `# Rapport — ${r.name} — ${mod.title}\n\n> AVERTISSEMENT : prototype de calcul simplifié. Ne certifie aucune aptitude à la fabrication ou à l'utilisation réelle.\n\n## Paramètres\n${mod.params.map((p) => `- ${p.label} : ${vals[mod.id][p.key].value ?? 'NON RENSEIGNÉ'} ${p.unit} (${vals[mod.id][p.key].src})`).join('\n')}\n\n## Résultats\n${last.results.map((x) => `- ${x.label} : ${x.value} ${x.unit ?? ''} [${x.nature}]`).join('\n') || 'Aucun (calcul non exécuté)'}\n\n## Anomalies\n${last.issues.map((i) => `- (${i.severity}, ${i.nature}) ${i.text}`).join('\n')}\n\n## Données manquantes\n${last.missing.map((m) => `- ${m}`).join('\n') || '—'}\n\n## Hypothèses\n${mod.assumptions.map((a) => `- ${a}`).join('\n')}\n` : null;
  document.getElementById('mrep')!.onclick = () => { const t = rep(); t ? download(`rapport-${r.id}.md`, t, 'text/markdown') : alert('Exécutez d\'abord le calcul.'); };
  document.getElementById('mrepj')!.onclick = () => last ? download(`rapport-${r.id}.json`, JSON.stringify({ ...cfg(), résultat: last }, null, 2)) : alert('Exécutez d\'abord le calcul.');
  document.getElementById('msave')!.onclick = () => { if (last) { saved = last; document.getElementById('mcmp')!.textContent = 'Configuration A mémorisée : modifiez puis exécutez pour comparer.'; } };
  (document.getElementById('w3d') as HTMLInputElement).onchange = async (e) => { const info = await importFiles([...(e.target as HTMLInputElement).files!]); document.getElementById('w3dinfo')!.innerHTML = info.lines.map((l) => `<div class="note">${esc(l)}</div>`).join('') + info.warnings.map((w) => `<div class="warn">${esc(w)}</div>`).join(''); if (info.object) viewer!.showImported(info.object); };
  if (Object.keys(prefill).length) run();
}

// ---------- Projet ----------
(window as any).__ralSave = () => {
  const p = makeProject({ name: store.name, arm: store.arm ? store.arm.get() : null, modules: store.modules, planner: store.planner, history: loadHist() });
  download(`projet-${store.name.replace(/\W+/g, '_')}.json`, JSON.stringify(p, null, 2));
};
(window as any).__ralLoad = async (inp: HTMLInputElement) => {
  const f = inp.files?.[0]; if (!f) return; let raw: unknown; try { raw = JSON.parse(await f.text()); } catch { alert('Fichier JSON illisible.'); return; }
  const v = validateProject(raw); if (!v.ok) { alert('Projet refusé :\n- ' + v.errors.join('\n- ')); return; }
  applyProject(v.project); alert(`Projet « ${v.project.name} » chargé (schéma v${v.project.version}).${v.warnings.length ? '\nAvertissements :\n- ' + v.warnings.join('\n- ') : ''}`); window.dispatchEvent(new HashChangeEvent('hashchange'));
};
