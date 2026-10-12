// Rapport global de session : agrège l'historique de tous les modules, classé calculé / estimé / à valider.
export const DISCLAIMER_G = 'AVERTISSEMENT : rapport de prototype de simulation simplifiée. Il ne certifie en aucun cas qu\'un robot est apte à être fabriqué ou utilisé dans le monde réel.';
export interface HistItem { date: string; type: string; typeName?: string; module: string; moduleTitle?: string; values: Record<string, number | null>; sources?: Record<string, string>; ok: boolean; summary: string;
  results?: { label: string; value: number | string; unit?: string; nature: string }[]; issues?: { severity: string; nature: string; text: string }[]; missing?: string[]; assumptions?: string[] }
export function buildGlobal(h: HistItem[]) {
  const runs = h.map((x, i) => ({ id: i + 1, ...x }));
  const pick = (n: string) => runs.flatMap((r) => [...(r.results ?? []).filter((x) => x.nature === n).map((x) => ({ run: r.id, text: `${x.label} = ${x.value}${x.unit ? ' ' + x.unit : ''}` })), ...(r.issues ?? []).filter((i) => i.nature === n).map((i) => ({ run: r.id, text: `[${i.severity}] ${i.text}` }))]);
  return { généréLe: new Date().toISOString(), avertissement: DISCLAIMER_G, nbExécutions: runs.length, nbCritiques: runs.reduce((s, r) => s + (r.issues ?? []).filter((i) => i.severity === 'critique').length, 0),
    exécutions: runs.map((r) => ({ id: r.id, date: r.date, robot: r.typeName ?? r.type, module: r.moduleTitle ?? r.module, ok: r.ok, résumé: r.summary, paramètres: r.values, provenance: r.sources ?? {}, hypothèses: r.assumptions ?? [], manquant: r.missing ?? [] })),
    calculé: pick('calculé'), estimé: pick('estimé'), àValider: [...pick('à valider'), ...runs.flatMap((r) => (r.missing ?? []).map((m) => ({ run: r.id, text: `Donnée manquante : ${m}` })))] };
}
export function globalMarkdown(h: HistItem[]): string {
  const g = buildGlobal(h); const L = [`# Rapport global de session — Robotics AI Lab`, `Généré le ${new Date(g.généréLe).toLocaleString('fr-FR')}`, '', `> ${g.avertissement}`, '', `${g.nbExécutions} exécution(s), ${g.nbCritiques} problème(s) critique(s).`, '', '## Exécutions', '| # | Date | Robot | Module | Statut | Résumé |', '|---|---|---|---|---|---|',
    ...g.exécutions.map((e) => `| ${e.id} | ${new Date(e.date).toLocaleString('fr-FR')} | ${e.robot} | ${e.module} | ${e.ok ? 'exécuté' : 'incomplet/échec'} | ${e.résumé} |`)];
  for (const [t, arr] of [['Résultats et anomalies CALCULÉS', g.calculé], ['ESTIMATIONS (hypothèses simplificatrices)', g.estimé], ['À VALIDER (données manquantes, valeurs de démonstration, validations nécessaires)', g.àValider]] as const) L.push('', `## ${t}`, ...(arr.length ? arr.map((x) => `- (#${x.run}) ${x.text}`) : ['- —']));
  L.push('', '## Hypothèses par exécution', ...g.exécutions.flatMap((e) => [`### #${e.id} ${e.module}`, ...e.hypothèses.map((a) => `- ${a}`)]));
  return L.join('\n');
}
const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!));
export function globalHTML(h: HistItem[]): string {
  const body = globalMarkdown(h).split('\n').map((l) => l.startsWith('# ') ? `<h1>${esc(l.slice(2))}</h1>` : l.startsWith('## ') ? `<h2>${esc(l.slice(3))}</h2>` : l.startsWith('### ') ? `<h3>${esc(l.slice(4))}</h3>` : l.startsWith('> ') ? `<p class="warn">${esc(l.slice(2))}</p>` : l.startsWith('- ') ? `<li>${esc(l.slice(2))}</li>` : l.startsWith('|---') ? '' : l.startsWith('|') ? `<tr>${l.split('|').slice(1, -1).map((c) => `<td>${esc(c.trim())}</td>`).join('')}</tr>` : l ? `<p>${esc(l)}</p>` : '').join('\n');
  return `<!doctype html><html lang="fr"><meta charset="utf-8"><title>Rapport global</title><style>body{font-family:system-ui;max-width:1000px;margin:2em auto}td{border:1px solid #ccc;padding:4px 8px;font-size:13px}table{border-collapse:collapse}.warn{background:#fff3cd;padding:1em;border-left:4px solid #e0a800}</style><body>${body.replace(/(<tr>[\s\S]*?<\/tr>\n?)+/g, (t) => `<table>${t}</table>`)}</body></html>`;
}
