// Comparateur multi-configurations : même module, N jeux de paramètres, tableau de résultats exportable.
import { runModule, type ParamValues, type SimModule, type ModuleResult } from './modules/types';
export interface CompareTable { module: string; configs: string[]; params: { label: string; values: (number | null)[] }[]; results: { label: string; unit: string; nature: string; values: (string | number | null)[] }[]; issues: number[][]; ok: boolean[]; missing: string[][] }
export function compareConfigs(m: SimModule, configs: { name: string; values: ParamValues }[]): CompareTable {
  const runs: ModuleResult[] = configs.map((c) => runModule(m, c.values)); const labels: { label: string; unit: string; nature: string }[] = [];
  runs.forEach((r) => r.results.forEach((x) => { if (!labels.some((l) => l.label === x.label)) labels.push({ label: x.label, unit: x.unit ?? '', nature: x.nature }); }));
  return { module: m.title, configs: configs.map((c) => c.name),
    params: m.params.map((p) => ({ label: `${p.label}${p.unit ? ` (${p.unit})` : ''}`, values: configs.map((c) => c.values[p.key]?.value ?? null) })),
    results: labels.map((l) => ({ ...l, values: runs.map((r) => r.results.find((x) => x.label === l.label)?.value ?? null) })),
    issues: runs.map((r) => [r.issues.filter((i) => i.severity === 'critique').length, r.issues.filter((i) => i.severity === 'avertissement').length]),
    ok: runs.map((r) => r.ok), missing: runs.map((r) => r.missing) };
}
const q = (s: unknown) => `"${String(s ?? '').replace(/"/g, '""')}"`;
export function toCSV(t: CompareTable): string {
  const rows = [['Élément', 'Nature', ...t.configs], ...t.params.map((p) => [p.label, 'entrée', ...p.values.map((v) => v ?? 'NON RENSEIGNÉ')]), ...t.results.map((r) => [`${r.label}${r.unit ? ` (${r.unit})` : ''}`, r.nature, ...r.values.map((v) => v ?? '—')]),
    ['Problèmes critiques', 'calculé', ...t.issues.map((i) => i[0])], ['Avertissements', 'calculé', ...t.issues.map((i) => i[1])], ['Calcul exécuté', '', ...t.ok.map((o) => (o ? 'oui' : 'non/échec'))]];
  return rows.map((r) => r.map(q).join(';')).join('\n');
}
