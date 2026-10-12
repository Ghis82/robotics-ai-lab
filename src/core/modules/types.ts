// Interface commune famille ↔ modules de simulation. Aucun module ne fabrique de résultat sans calcul.
import type { Provenance } from '../model';
export type Nature = 'calculé' | 'estimé' | 'à valider';
export interface ParamDef { key: string; label: string; unit: string; demo: number | null; min?: number; required: boolean; help?: string }
export interface ParamValue { value: number | null; src: Provenance }
export type ParamValues = Record<string, ParamValue>;
export interface ResultItem { label: string; value: number | string; unit?: string; nature: Nature }
export interface ModuleIssue { severity: 'critique' | 'avertissement' | 'info'; nature: Nature; text: string }
export interface Series { label: string; x: number[]; y: number[]; xLabel: string; yLabel: string }
export interface ModuleResult { ok: boolean; results: ResultItem[]; issues: ModuleIssue[]; missing: string[]; assumptions: string[]; series?: Series[] }
export interface SimModule { id: string; title: string; description: string; params: ParamDef[]; assumptions: string[]; run(v: Record<string, number | null>): ModuleResult }
/** Valeurs initiales : valeurs de démonstration explicitement étiquetées, ou manquantes. */
export function defaultValues(m: SimModule): ParamValues {
  return Object.fromEntries(m.params.map((p) => [p.key, { value: p.demo, src: p.demo == null ? 'manquant' : 'démo' } as ParamValue]));
}
/** Exécution commune : vérifie les données requises AVANT tout calcul. */
export function runModule(m: SimModule, vals: ParamValues): ModuleResult {
  const missing = m.params.filter((p) => p.required && (vals[p.key]?.value == null || !Number.isFinite(vals[p.key].value!))).map((p) => p.label);
  if (missing.length) return { ok: false, results: [], issues: [{ severity: 'critique', nature: 'à valider', text: 'Calcul non exécuté : données requises manquantes.' }], missing, assumptions: m.assumptions };
  const raw = Object.fromEntries(m.params.map((p) => [p.key, vals[p.key]?.value ?? null]));
  const r = m.run(raw); r.missing = [...m.params.filter((p) => !p.required && raw[p.key] == null).map((p) => `${p.label} (optionnel)`), ...r.missing];
  const demo = m.params.filter((p) => vals[p.key]?.src === 'démo').map((p) => p.label);
  if (demo.length) r.issues.push({ severity: 'info', nature: 'à valider', text: `Valeurs de démonstration utilisées : ${demo.join(', ')}.` });
  return r;
}
