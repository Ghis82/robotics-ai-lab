// Assistant de bout en bout : requête FR → paramètres structurés → validation → exécution du module → explication à règles.
// N'invente jamais de valeur : seules les valeurs extraites du texte ou saisies sont « utilisateur » ; les valeurs de démonstration
// ne sont utilisées QUE si l'utilisateur l'accepte explicitement (acceptDemo), et restent étiquetées.
import { parseRequest, type ParsedRequest } from './nlp';
import { ALL_MODULES } from './modules/catalog';
import { runModule, defaultValues, type ParamValues, type ModuleResult, type ParamDef } from './modules/types';
import { compareConfigs, type CompareTable } from './compare';
export interface AssistantAnswer { comparison?: CompareTable | null; parsed: ParsedRequest; moduleId: string | null; values: ParamValues | null; missing: ParamDef[]; executed: boolean; result: ModuleResult | null; explanation: string[]; compareWith?: ParamValues }
/** Correspondance des grandeurs extraites du texte vers les paramètres d'un module. */
const MAP: Record<string, Record<string, string>> = { gripper: { payloadMass: 'mass', force: 'fmax' }, aerial: { payloadMass: 'mass', n_rotor: 'nRotors' }, quadrotor: { payloadMass: 'mass' }, 'mobile-diff': { payloadMass: 'mass', speed: 'vmax', torque: 'motorTorque' },
  'nav-grid': { speed: 'vmax', sx: 'sx', sy: 'sy', gx: 'gx', gy: 'gy' }, swarm: { n_agent: 'n', n_robot: 'n', n_drone: 'n' }, 'swarm-mission': { n_agent: 'n', n_robot: 'n', n_drone: 'n', missionCode: 'mission' }, aquatic: { payloadMass: 'mass' }, 'rov-dyn': { payloadMass: 'mass' }, companion: {} };
const PREF: Record<string, string> = { arm: 'gripper', wheeled: 'nav-grid', inspection: 'nav-grid', multirotor: 'aerial', rov: 'rov-dyn', auv: 'rov-dyn', swarm: 'swarm-mission', 'companion-mobile': 'companion' };
export function chooseModule(p: ParsedRequest): string | null { if (!p.type) return null; const pref = PREF[p.type.id]; if (pref && p.type.modules.includes(pref)) return pref; return p.type.modules[0] ?? null; }
export function assist(text: string, opts: { userValues?: Record<string, number>; acceptDemo?: boolean } = {}): AssistantAnswer {
  const parsed = parseRequest(text); const moduleId = chooseModule(parsed); const expl: string[] = [];
  if (parsed.mission?.kind === 'rendezvous') parsed.params.missionCode = 1; if (parsed.mission?.kind === 'couverture') parsed.params.missionCode = 2;
  if (parsed.mission?.kind === 'trajet') { parsed.params.sx = parsed.mission.from![0]; parsed.params.sy = parsed.mission.from![1]; parsed.params.gx = parsed.mission.to![0]; parsed.params.gy = parsed.mission.to![1]; }
  if (!parsed.type) return { parsed, moduleId: null, values: null, missing: [], executed: false, result: null, explanation: ['Type de robot non reconnu : reformulez (ex. « bras », « robot à roues », « drone », « ROV »).'] };
  expl.push(`Demande comprise : intention « ${parsed.intent} », robot « ${parsed.type.name} »${parsed.context.length ? `, contexte : ${parsed.context.join(', ')}` : ''}.`);
  if (!moduleId) return { parsed, moduleId: null, values: null, missing: [], executed: false, result: null, explanation: [...expl, `Aucun module de simulation implémenté pour ce type (${parsed.type.notImplemented.join(' ; ')}). Aucun résultat ne peut être produit.`] };
  const m = ALL_MODULES[moduleId]; const base = defaultValues(m); const values: ParamValues = {};
  for (const prm of m.params) values[prm.key] = opts.acceptDemo && base[prm.key].value != null ? base[prm.key] : { value: null, src: 'manquant' };
  for (const [k, pk] of Object.entries(MAP[moduleId] ?? {})) if (parsed.params[k] != null && values[pk]) { values[pk] = { value: parsed.params[k], src: 'utilisateur' }; expl.push(`Valeur extraite du texte : ${m.params.find((x) => x.key === pk)!.label} = ${parsed.params[k]}.`); }
  for (const [k, v] of Object.entries(opts.userValues ?? {})) if (values[k] && Number.isFinite(v)) values[k] = { value: v, src: 'utilisateur' };
  if (parsed.intent === 'comparer' && parsed.params.massA != null && values.mass) { values.mass = { value: parsed.params.massA, src: 'utilisateur' }; }
  const missing = m.params.filter((p) => p.required && values[p.key].value == null);
  expl.push(`Module retenu : « ${m.title} ».`);
  if (parsed.intent === 'comparer') {
    if (missing.length) { expl.push(`Comparaison non exécutée : données obligatoires manquantes — ${missing.map((p) => p.label).join(', ')}.`); return { parsed, moduleId, values, missing, executed: false, result: null, explanation: expl, comparison: null }; }
    const B: ParamValues = JSON.parse(JSON.stringify(values)); if (parsed.params.massB != null && B.mass) B.mass = { value: parsed.params.massB, src: 'utilisateur' };
    const cmp = compareConfigs(m, [{ name: 'A', values }, { name: 'B', values: B }]);
    expl.push(parsed.params.massB != null ? `Comparaison exécutée : configuration A (masse ${parsed.params.massA} kg) vs B (masse ${parsed.params.massB} kg), toutes choses égales par ailleurs.` : 'Comparaison exécutée avec deux configurations identiques : modifiez B dans le comparateur.');
    cmp.results.forEach((r) => { if (r.values[0] !== r.values[1]) expl.push(`${r.label} [${r.nature}] : A = ${r.values[0] ?? '—'} ; B = ${r.values[1] ?? '—'}${r.unit ? ' ' + r.unit : ''}.`); });
    return { parsed, moduleId, values, missing, executed: true, result: null, explanation: expl, comparison: cmp };
  }
  if (missing.length) {
    expl.push(`Calcul NON exécuté : ${missing.length} donnée(s) obligatoire(s) manquante(s) — ${missing.map((p) => p.label).join(', ')}.`);
    if (!opts.acceptDemo) expl.push('Vous pouvez saisir ces valeurs ou accepter explicitement les valeurs de démonstration étiquetées (pour les champs qui en ont).');
    return { parsed, moduleId, values, missing, executed: false, result: null, explanation: expl };
  }
  const result = runModule(m, values); result.assumptions = m.assumptions;
  const crit = result.issues.filter((i) => i.severity === 'critique'); const warn = result.issues.filter((i) => i.severity === 'avertissement');
  expl.push(result.ok && !crit.length ? `Calcul exécuté : aucun problème critique détecté dans le cadre des hypothèses (${m.assumptions.length} hypothèses listées).` : `Calcul exécuté : ${crit.length} problème(s) critique(s).`);
  crit.forEach((i) => expl.push(`⚠ [${i.nature}] ${i.text}`)); warn.forEach((i) => expl.push(`△ [${i.nature}] ${i.text}`));
  const byNat = (n: string) => result.results.filter((x) => x.nature === n).map((x) => `${x.label} = ${x.value}${x.unit ? ' ' + x.unit : ''}`);
  if (byNat('calculé').length) expl.push(`Résultats calculés : ${byNat('calculé').join(' ; ')}.`);
  if (byNat('estimé').length) expl.push(`Estimations (hypothèses simplificatrices) : ${byNat('estimé').join(' ; ')}.`);
  const demo = m.params.filter((p) => values[p.key].src === 'démo').map((p) => p.label); if (demo.length) expl.push(`À valider : valeurs de démonstration utilisées (${demo.join(', ')}).`);
  if (result.missing.length) expl.push(`Données optionnelles absentes : ${result.missing.join(', ')}.`);
  expl.push('Ces résultats ne certifient pas l\'aptitude du robot à être fabriqué ou utilisé.');
  return { parsed, moduleId, values, missing, executed: true, result, explanation: expl };
}
