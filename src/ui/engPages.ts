// Pages « Résistance » et « Validation ».
import { topbar } from './platform';
import { store } from './store';
import { MATERIALS, linkStrength, type Section } from '../core/strength';
import { runValidation, type VCase } from '../core/validation';
import { deg } from '../core/math';
const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!));
type LinkIn = { kind: 'plein' | 'tube' | 'rect' | ''; d: string; di: string; b: string; h: string; mat: string; E: string; Y: string; rho: string };
const st: { links: LinkIn[] } = { links: [] };
export function renderStrength() {
  const root = document.getElementById('platform')!; const arm = store.arm?.get(); if (!arm) { root.innerHTML = topbar('res') + '<div class="page">Ouvrez d\'abord l\'atelier bras.</div>'; return; }
  const m = arm.model; while (st.links.length < m.links.length) st.links.push({ kind: '', d: '', di: '', b: '', h: '', mat: '', E: '', Y: '', rho: '' }); st.links.length = m.links.length;
  root.innerHTML = topbar('res') + `<div class="page"><h1>Résistance simplifiée des segments — ${esc(m.name)}</h1>
  <p class="note"><b>Estimation par poutres (Euler-Bernoulli), pas un calcul par éléments finis.</b> Section et matériau (E, limite élastique) <b>obligatoires</b> par segment ; les matériaux de la bibliothèque sont des <span class="prov p-démo">valeurs typiques</span> sourcées à confirmer par la fiche fournisseur. Poses analysées : celles de la trajectoire de l'atelier (statique, pire cas retenu).</p>
  <div class="card"><table><thead><tr><th>Segment</th><th>Section</th><th>Dimensions (mm)</th><th>Matériau</th><th>E (GPa) / Re (MPa) / ρ (kg/m³)</th></tr></thead><tbody>${m.links.map((l, i) => { const x = st.links[i]; return `<tr><td>${esc(l.name)}<br><small class="note">L = ${(l.length * 1000).toFixed(0)} mm, m = ${l.mass ?? '?'} kg</small></td>
   <td><select data-i="${i}" data-f="kind"><option value="">— non renseigné —</option><option value="plein" ${x.kind === 'plein' ? 'selected' : ''}>Rond plein</option><option value="tube" ${x.kind === 'tube' ? 'selected' : ''}>Tube</option><option value="rect" ${x.kind === 'rect' ? 'selected' : ''}>Rectangle plein</option></select></td>
   <td>${x.kind === 'rect' ? `b <input data-i="${i}" data-f="b" value="${x.b}" size="4"> h <input data-i="${i}" data-f="h" value="${x.h}" size="4">` : x.kind ? `Ø <input data-i="${i}" data-f="d" value="${x.d}" size="4">${x.kind === 'tube' ? ` Øint <input data-i="${i}" data-f="di" value="${x.di}" size="4">` : ''}` : '—'}</td>
   <td><select data-i="${i}" data-f="mat"><option value="">— saisie manuelle —</option>${MATERIALS.map((M) => `<option value="${M.id}" ${x.mat === M.id ? 'selected' : ''}>${M.name}</option>`).join('')}</select>${x.mat ? `<br><span class="prov p-démo">valeur typique</span> <small class="note">${esc(MATERIALS.find((M) => M.id === x.mat)!.source)}</small>` : ''}</td>
   <td>${x.mat ? (() => { const M = MATERIALS.find((M) => M.id === x.mat)!; return `${M.E / 1e9} / ${M.yield / 1e6} / ${M.density}`; })() : `<input data-i="${i}" data-f="E" value="${x.E}" size="4" placeholder="E"> <input data-i="${i}" data-f="Y" value="${x.Y}" size="4" placeholder="Re"> <input data-i="${i}" data-f="rho" value="${x.rho}" size="4" placeholder="ρ opt.">`}</td></tr>`; }).join('')}</tbody></table>
  <button id="srun" class="primary-s">Calculer</button></div><div class="card" id="sres"></div></div>`;
  root.querySelectorAll<HTMLInputElement>('[data-f]').forEach((el) => { el.onchange = () => { (st.links[+el.dataset.i!] as any)[el.dataset.f!] = el.value; if (el.dataset.f === 'kind' || el.dataset.f === 'mat') renderStrength(); }; });
  document.getElementById('srun')!.onclick = () => {
    const secs: (Section | null)[] = st.links.map((x) => { const n = (v: string) => (v === '' ? NaN : +v / 1000); if (x.kind === 'plein' && n(x.d) > 0) return { kind: 'plein', d: n(x.d) }; if (x.kind === 'tube' && n(x.d) > n(x.di) && n(x.di) > 0) return { kind: 'tube', d: n(x.d), di: n(x.di) }; if (x.kind === 'rect' && n(x.b) > 0 && n(x.h) > 0) return { kind: 'rect', b: n(x.b), h: n(x.h) }; return null; });
    const mats = st.links.map((x) => { if (x.mat) { const M = MATERIALS.find((M) => M.id === x.mat)!; return { E: M.E, yield: M.yield, density: M.density }; } return +x.E > 0 && +x.Y > 0 ? { E: +x.E * 1e9, yield: +x.Y * 1e6, density: +x.rho || undefined } : null; });
    const poses = arm.poses.map((p) => p.q.map((v) => (v * Math.PI) / 180)); let worst: ReturnType<typeof linkStrength> | null = null; let wq: number[] = [];
    for (const q of poses) { const r = linkStrength(m, q, secs, mats); if (!worst || r.toolDeflection > worst.toolDeflection || r.links.some((l, i) => l && worst!.links[i] && l.sf < worst!.links[i]!.sf)) { worst = r; wq = q; } }
    const miss = m.links.filter((_, i) => !secs[i] || !mats[i]).map((l) => l.name);
    document.getElementById('sres')!.innerHTML = `<h3>Résultats <span class="nat">estimé</span> — pire pose (${wq.map((v) => deg(v).toFixed(0)).join(', ')}°)</h3>${miss.length ? `<div class="warn">Non calculé (section ou matériau manquant) : ${miss.map(esc).join(', ')}.</div>` : ''}
    <table><thead><tr><th>Segment</th><th>Flexion M (N·m)</th><th>Torsion T (N·m)</th><th>σ (MPa)</th><th>τ (MPa)</th><th>von Mises (MPa)</th><th>Coef. sécurité</th><th>Masse matériau vs déclarée</th></tr></thead><tbody>${worst!.links.map((l, i) => l ? `<tr><td>${esc(l.link)}</td><td>${l.M.toFixed(2)}</td><td>${l.T.toFixed(2)}</td><td>${(l.sigma / 1e6).toFixed(2)}</td><td>${(l.tau / 1e6).toFixed(2)}</td><td>${(l.vm / 1e6).toFixed(2)}</td><td class="${l.sf < 1 ? 'sev-critique' : l.sf < 2 ? 'sev-avertissement' : ''}">${l.sf.toFixed(1)}</td><td>${mats[i]?.density ? `${l.massFromMaterial.toFixed(3)} kg / ${m.links[i].mass ?? '?'} kg` : '—'}</td></tr>` : '').join('')}</tbody></table>
    <p>Flèche estimée au TCP (majorant, articulations rigides) : <b>${(worst!.toolDeflection * 1000).toFixed(3)} mm</b></p><ul>${worst!.notes.map((n) => `<li class="note">${n}</li>`).join('')}<li class="note">Coefficient de sécurité &lt; 1 : plastification probable ; &lt; 2 : marge faible (seuil indicatif, non normatif).</li></ul>`;
  };
}
const row = (c: VCase) => `<tr><td>${esc(c.title)}<br><small class="note">${esc(c.reference)}</small></td><td>${c.kind}</td><td>${fmt(c.computed)}</td><td>${fmt(c.expected)}</td><td>${c.unit}</td><td>${(c.err * 100).toExponential(2)} %</td><td>${(c.tol * 100).toPrecision(2)} %</td><td class="${c.pass ? '' : 'sev-critique'}">${c.pass ? '✔ conforme' : '✘ hors tolérance'}</td></tr>`;
const fmt = (x: number) => (Math.abs(x) > 1e4 || (Math.abs(x) < 1e-3 && x !== 0) ? x.toExponential(4) : x.toPrecision(6));
export function renderValidation() {
  const root = document.getElementById('platform')!; const t0 = performance.now(); const v = runValidation(); const dt = performance.now() - t0;
  root.innerHTML = topbar('val') + `<div class="page"><h1>Suite de validation</h1><p class="note">Chaque cas est recalculé à l'ouverture de la page par les modules de l'application et comparé à une référence analytique publiée. « indépendant » : référence établie sans notre code ; « cohérence » : vérification interne (conservation, accord entre deux moteurs). Une validation réussie ne garantit pas la fidélité au monde réel.</p>
  <div class="card"><table><thead><tr><th>Cas</th><th>Type</th><th>Calculé</th><th>Référence</th><th>Unité</th><th>Erreur rel.</th><th>Tolérance</th><th>Résultat</th></tr></thead><tbody id="vrows">${v.map(row).join('')}</tbody></table>
  <p class="note">Cas analytiques calculés en ${dt.toFixed(0)} ms. <span id="vr">Cas Rapier (WebAssembly) en cours…</span></p></div></div>`;
  import('../physics/validationRapier').then(async ({ rapierCases }) => { const r = await rapierCases(); document.getElementById('vrows')!.insertAdjacentHTML('beforeend', r.map(row).join('')); document.getElementById('vr')!.textContent = 'Cas Rapier terminés.'; }).catch((e) => { document.getElementById('vr')!.textContent = 'Cas Rapier non exécutés : ' + e.message; });
}
