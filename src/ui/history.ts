import type { HistItem } from '../core/globalReport';
import type { ModuleResult, ParamValues } from '../core/modules/types';
export const loadHist = (): HistItem[] => { try { return JSON.parse(localStorage.getItem('ral-history') || '[]'); } catch { return []; } };
export const pushHist = (h: HistItem) => localStorage.setItem('ral-history', JSON.stringify([h, ...loadHist()].slice(0, 100)));
export function histFromResult(type: string, typeName: string, module: string, moduleTitle: string, vals: ParamValues, r: ModuleResult): HistItem {
  return { date: new Date().toISOString(), type, typeName, module, moduleTitle, values: Object.fromEntries(Object.entries(vals).map(([k, v]) => [k, v.value])), sources: Object.fromEntries(Object.entries(vals).map(([k, v]) => [k, v.src])),
    ok: r.ok, summary: r.ok ? `${r.results.length} résultat(s), ${r.issues.filter((i) => i.severity === 'critique').length} critique(s)` : `incomplet/échec : ${r.missing.slice(0, 2).join(', ') || r.issues[0]?.text || ''}`,
    results: r.results, issues: r.issues, missing: r.missing, assumptions: r.assumptions };
}
export function download(name: string, text: string, type = 'application/json') { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); }
