// Comparateur multi-configurations (même scénario/module, N jeux de paramètres).
import { ALL_MODULES } from '../core/modules/catalog';
import { defaultValues, type ParamValues } from '../core/modules/types';
import { compareConfigs, toCSV } from '../core/compare';
import { topbar } from './platform';
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
function download(name: string, text: string, type: string) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['\ufeff' + text], { type })); a.download = name; a.click(); }
export function renderComparator(qs: URLSearchParams) {
  const root = document.getElementById('platform')!; let mod = ALL_MODULES[qs.get('m') ?? ''] ?? Object.values(ALL_MODULES)[0];
  let cfgs: { name: string; values: ParamValues }[] = [];
  const reset = () => { cfgs = ['A', 'B'].map((n) => ({ name: n, values: defaultValues(mod) })); };
  reset();
  root.innerHTML = topbar('cmp') + `<div class="page"><h1>Comparateur de configurations</h1><p class="note">Même module, N configurations. Chaque cellule de résultat provient d'une exécution réelle du module ; une configuration incomplète n'est pas calculée.</p>
    <div class="filters"><select id="cmod">${Object.values(ALL_MODULES).map((m) => `<option value="${m.id}" ${m.id === mod.id ? 'selected' : ''}>${esc(m.title)}</option>`).join('')}</select><button id="cadd">＋ Configuration</button><button id="crun" class="primary-s">Comparer</button><button id="ccsv">Exporter CSV</button><button id="cjson">Exporter JSON</button></div>
    <div class="card" style="overflow:auto"><table class="tbl" id="cgrid"></table></div><div class="card" style="overflow:auto;margin-top:10px"><h3>Résultats</h3><table class="tbl" id="cres"><tr><td class="note">Cliquez sur « Comparer ».</td></tr></table></div></div>`;
  const grid = () => {
    document.getElementById('cgrid')!.innerHTML = `<tr><th>Paramètre</th>${cfgs.map((c, i) => `<th><input data-name="${i}" value="${esc(c.name)}" style="width:90px"> ${cfgs.length > 2 ? `<button data-rm="${i}">×</button>` : ''}</th>`).join('')}</tr>` +
      mod.params.map((p) => `<tr><td>${esc(p.label)} ${p.unit ? `(${esc(p.unit)})` : ''}${p.required ? '' : ' <span class="note">opt.</span>'}</td>${cfgs.map((c, i) => { const v = c.values[p.key]; return `<td><input type="number" step="any" data-c="${i}" data-k="${p.key}" value="${v.value ?? ''}" placeholder="non renseigné" style="width:100px"> <span class="prov p-${v.src}">${v.src === 'démo' ? 'démo' : v.src}</span></td>`; }).join('')}</tr>`).join('');
  };
  let table: ReturnType<typeof compareConfigs> | null = null;
  const run = () => {
    table = compareConfigs(mod, cfgs); const t = table;
    document.getElementById('cres')!.innerHTML = `<tr><th>Résultat</th><th>Nature</th>${t.configs.map((c) => `<th>${esc(c)}</th>`).join('')}</tr>` +
      t.results.map((r) => `<tr><td>${esc(r.label)} ${r.unit ? `(${esc(r.unit)})` : ''}</td><td><span class="nat">${r.nature}</span></td>${r.values.map((v) => `<td>${v == null ? '<span class="note">—</span>' : `<b>${esc(v)}</b>`}</td>`).join('')}</tr>`).join('') +
      `<tr><td>Problèmes critiques / avertissements</td><td><span class="nat">calculé</span></td>${t.issues.map((i) => `<td class="${i[0] ? 'sev-critique' : ''}">${i[0]} / ${i[1]}</td>`).join('')}</tr>` +
      `<tr><td>Données manquantes</td><td></td>${t.missing.map((m) => `<td class="note">${esc(m.join(', ') || '—')}</td>`).join('')}</tr>`;
  };
  grid();
  (document.getElementById('cmod') as HTMLSelectElement).onchange = (e) => { mod = ALL_MODULES[(e.target as HTMLSelectElement).value]; reset(); grid(); table = null; };
  document.getElementById('cadd')!.onclick = () => { cfgs.push({ name: String.fromCharCode(65 + cfgs.length), values: JSON.parse(JSON.stringify(cfgs[cfgs.length - 1].values)) }); grid(); };
  document.getElementById('cgrid')!.onchange = (e) => { const t = e.target as HTMLInputElement; if (t.dataset.name) cfgs[+t.dataset.name].name = t.value; else if (t.dataset.k) { const v = t.value.trim(); const src = v === '' ? 'manquant' : 'utilisateur'; cfgs[+t.dataset.c!].values[t.dataset.k] = { value: v === '' ? null : +v, src }; const sp = t.nextElementSibling as HTMLElement; sp.className = `prov p-${src}`; sp.textContent = src; } };
  document.getElementById('cgrid')!.onclick = (e) => { const d = (e.target as HTMLElement).dataset; if (d.rm) { cfgs.splice(+d.rm, 1); grid(); } };
  document.getElementById('crun')!.onclick = run;
  document.getElementById('ccsv')!.onclick = () => { if (!table) run(); download(`comparaison-${mod.id}.csv`, toCSV(table!), 'text/csv'); };
  document.getElementById('cjson')!.onclick = () => { if (!table) run(); download(`comparaison-${mod.id}.json`, JSON.stringify({ avertissement: 'Comparaison de prototype ; valeurs « démo » non réelles ; ne certifie aucune fabrication.', configurations: cfgs, tableau: table }, null, 2), 'application/json'); };
}
