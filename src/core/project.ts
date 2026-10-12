// Sauvegarde / chargement de projet complet avec versionnage de schéma et validation. Pur TS.
import type { RobotModel } from './model';
import type { ParamValues } from './modules/types';
import type { HistItem } from './globalReport';
import { ALL_MODULES } from './modules/catalog';
export const PROJECT_SCHEMA = 'robotics-ai-lab/projet'; export const PROJECT_VERSION = 2;
export interface PlannerState { w: number; h: number; res: number; occupied: number[]; start: [number, number]; goal: [number, number]; params: Record<string, number | null> }
export interface Project { schema: string; version: number; savedAt: string; name: string; arm: { model: RobotModel; poses: { q: number[]; duration: number }[] } | null; modules: Record<string, ParamValues>; planner: PlannerState | null; history: HistItem[]; note: string }
export function makeProject(p: Omit<Project, 'schema' | 'version' | 'savedAt' | 'note'>): Project {
  return { schema: PROJECT_SCHEMA, version: PROJECT_VERSION, savedAt: new Date().toISOString(), note: 'Fichier de projet Robotics AI Lab. Les valeurs « démo » ne sont pas des données réelles.', ...p };
}
const isNum = (x: unknown) => typeof x === 'number' && Number.isFinite(x);
const SRC = ['démo', 'utilisateur', 'URDF', 'manquant', 'proposé'];
/** Migration des versions antérieures (v1 : pas de champ planner ni name). */
export function migrate(o: any): any { if (o && o.schema === PROJECT_SCHEMA && o.version === 1) return { ...o, version: 2, name: o.name ?? 'Projet migré', planner: o.planner ?? null }; return o; }
export function validateProject(raw: unknown): { ok: true; project: Project; warnings: string[] } | { ok: false; errors: string[] } {
  const errors: string[] = [], warnings: string[] = []; const o: any = migrate(raw);
  if (!o || typeof o !== 'object') return { ok: false, errors: ['Le fichier ne contient pas un objet JSON.'] };
  if (o.schema !== PROJECT_SCHEMA) errors.push(`Schéma inattendu : « ${o.schema ?? 'absent'} » (attendu « ${PROJECT_SCHEMA} »).`);
  if (!isNum(o.version)) errors.push('Version de schéma absente.'); else if (o.version > PROJECT_VERSION) errors.push(`Version ${o.version} plus récente que celle prise en charge (${PROJECT_VERSION}).`);
  if (o.arm != null) { const m = o.arm.model;
    if (!m || !Array.isArray(m.joints) || !Array.isArray(m.links) || m.joints.length !== m.links.length || !m.joints.length) errors.push('Bras : articulations et segments incohérents.');
    else { m.links.forEach((l: any, i: number) => { if (!isNum(l.length) || l.length < 0) errors.push(`Bras : longueur invalide (segment ${i + 1}).`); if (l.mass != null && (!isNum(l.mass) || l.mass < 0)) errors.push(`Bras : masse invalide (segment ${i + 1}).`); });
      m.joints.forEach((j: any, i: number) => { if (!isNum(j.min) || !isNum(j.max) || j.min > j.max) errors.push(`Bras : butées invalides (axe ${i + 1}).`); if (j.motor && !isNum(j.motor.maxTorque)) errors.push(`Bras : couple moteur invalide (axe ${i + 1}).`); }); }
    if (!Array.isArray(o.arm.poses)) errors.push('Bras : poses absentes.'); else o.arm.poses.forEach((p: any, k: number) => { if (!Array.isArray(p.q) || (m?.joints && p.q.length !== m.joints.length) || !p.q.every(isNum)) errors.push(`Bras : pose ${k + 1} invalide.`); }); }
  if (o.modules != null) { if (typeof o.modules !== 'object') errors.push('Modules : format invalide.'); else for (const [id, vals] of Object.entries<any>(o.modules)) {
    const m = ALL_MODULES[id]; if (!m) { warnings.push(`Module inconnu ignoré : ${id}.`); delete o.modules[id]; continue; }
    for (const p of m.params) { const v = vals[p.key]; if (!v) { vals[p.key] = { value: null, src: 'manquant' }; warnings.push(`${m.title} : « ${p.label} » absent → marqué manquant.`); continue; }
      if (v.value != null && !isNum(v.value)) errors.push(`${m.title} : valeur non numérique pour « ${p.label} ».`); if (!SRC.includes(v.src)) errors.push(`${m.title} : provenance invalide pour « ${p.label} ».`);
      if (v.value == null && v.src !== 'manquant') { v.src = 'manquant'; warnings.push(`${m.title} : « ${p.label} » sans valeur → provenance corrigée en « manquant ».`); } } } }
  if (o.planner != null) { const pl = o.planner; if (!isNum(pl.w) || !isNum(pl.h) || !isNum(pl.res) || !Array.isArray(pl.occupied) || !pl.occupied.every((i: number) => isNum(i) && i >= 0 && i < pl.w * pl.h)) errors.push('Planificateur : carte invalide.'); }
  if (o.history != null && !Array.isArray(o.history)) errors.push('Historique : format invalide.');
  if (errors.length) return { ok: false, errors };
  return { ok: true, project: { modules: {}, history: [], arm: null, planner: null, name: 'Projet', ...o }, warnings };
}
