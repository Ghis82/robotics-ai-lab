import { deg } from './math';
import { missingData, type RobotModel } from './model';
import type { SimResult } from './simulation';
import type { Analysis } from './analysis';
export const DISCLAIMER = 'AVERTISSEMENT : ce rapport est issu d\'un prototype de simulation simplifiée. Il ne certifie en aucun cas que le robot est apte à être fabriqué ou utilisé dans le monde réel. Toute conclusion doit être validée par des calculs détaillés (dynamique complète, éléments finis), des données constructeur et des essais physiques.';
export function reportJSON(m: RobotModel, sim: SimResult, an: Analysis) {
  return {
    généréLe: new Date().toISOString(), avertissement: DISCLAIMER,
    robot: { nom: m.name, socle: { hauteur_m: m.baseHeight, masse_kg: m.baseMass, rayonEmpreinte_m: m.baseFootprintRadius },
      segments: m.links, articulations: m.joints.map((j) => ({ ...j, min_deg: deg(j.min), max_deg: deg(j.max) })), charge_kg: m.payload.mass, obstacles: m.obstacles, provenance: m.provenance },
    simulation: { départ_deg: sim.start.map(deg), poses: sim.waypoints.map((w) => ({ q_deg: w.q.map(deg), durée_s: w.duration })), pas_s: sim.dt, échantillons: sim.frames.length },
    hypothèses: an.assumptions, résumé: an.summary,
    couplesMax_Nm: an.peaks.map((p) => ({ articulation: p.joint, statique_calculé: +p.static.toFixed(4), dynamique_estimé: +p.dynamic.toFixed(4), moteurDéclaré: p.motor })),
    anomalies: an.anomalies, donnéesManquantes: missingData(m),
  };
}
const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!));
export function reportMarkdown(m: RobotModel, sim: SimResult, an: Analysis): string {
  const L: string[] = [`# Rapport d'analyse robotique — ${m.name}`, `Généré le ${new Date().toLocaleString('fr-FR')}`, '', `> ${DISCLAIMER}`, '', '## Résumé', ...an.summary.map((s) => `- ${s}`), '',
    '## Couples maximaux', '| Articulation | Statique (calculé) N·m | Dynamique (estimé) N·m | Moteur déclaré N·m |', '|---|---|---|---|',
    ...an.peaks.map((p) => `| ${p.joint} | ${p.static.toFixed(2)} | ${p.dynamic.toFixed(2)} | ${p.motor ?? 'NON DÉCLARÉ'} |`), '',
    '## Anomalies', '| Gravité | Nature | Titre | Détail | Suggestion |', '|---|---|---|---|---|',
    ...an.anomalies.map((a) => `| ${a.severity} | ${a.nature} | ${a.title} | ${a.detail} | ${a.suggestion ?? ''} |`), '',
    '## Hypothèses', ...an.assumptions.map((s) => `- ${s}`), '', '## Provenance des données',
    ...Object.entries(m.provenance).map(([k, v]) => `- ${k} : ${v === 'démo' ? 'valeur de démonstration' : v}`)];
  return L.join('\n');
}
export function reportHTML(m: RobotModel, sim: SimResult, an: Analysis): string {
  const md = reportMarkdown(m, sim, an);
  const body = md.split('\n').map((l) => {
    if (l.startsWith('# ')) return `<h1>${esc(l.slice(2))}</h1>`; if (l.startsWith('## ')) return `<h2>${esc(l.slice(3))}</h2>`;
    if (l.startsWith('> ')) return `<p class="warn">${esc(l.slice(2))}</p>`; if (l.startsWith('- ')) return `<li>${esc(l.slice(2))}</li>`;
    if (l.startsWith('|---')) return ''; if (l.startsWith('|')) return `<tr>${l.split('|').slice(1, -1).map((c) => `<td>${esc(c.trim())}</td>`).join('')}</tr>`;
    return l ? `<p>${esc(l)}</p>` : '';
  }).join('\n');
  return `<!doctype html><html lang="fr"><meta charset="utf-8"><title>Rapport ${esc(m.name)}</title><style>body{font-family:system-ui;max-width:1000px;margin:2em auto;color:#111}td{border:1px solid #ccc;padding:4px 8px;font-size:13px}tr:first-of-type td{font-weight:bold;background:#eef}.warn{background:#fff3cd;padding:1em;border-left:4px solid #e0a800}table{border-collapse:collapse}</style><body>${body.replace(/(<tr>[\s\S]*?<\/tr>\n?)+/g, (t) => `<table>${t}</table>`)}</body></html>`;
}
