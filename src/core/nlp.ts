// Analyseur de requêtes en français à base de règles. Il structure la demande ; il ne produit AUCUN résultat.
import { ROBOT_TYPES, type RobotType } from './registry';
import { ALL_MODULES } from './modules/catalog';
import { wordsToDigits } from './nlpNumbers';
export interface Quantity { value: number; kind: 'masse' | 'longueur' | 'force' | 'couple' | 'vitesse'; si: number; raw: string }
export interface ParsedRequest { intent: 'configurer' | 'simuler' | 'comparer' | 'inconnu'; type: RobotType | null; params: Record<string, number>; context: string[]; modules: string[]; missing: string[]; notes: string[]; quantities: Quantity[]; mission?: { kind: 'rendezvous' | 'couverture' | 'trajet'; from?: [number, number]; to?: [number, number] } }
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const NUM: Record<string, number> = { un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10, vingt: 20, cent: 100 };
const num = (s: string) => (NUM[s] ?? parseFloat(s.replace(',', '.')));
const SYN: [RegExp, string][] = [[/\b(robot de compagnie|robot compagnon de bureau|desk robot|companion robot)\b/, ' robot compagnon '], [/\b(manipulateur|bras robotise|bras robotique|robot bras)\b/, ' bras '], [/\b(agv|amr|chariot autonome|robot mobile a roues|vehicule a roues)\b/, ' robot a roues '], [/\b(uav|quadricoptere|quadrirotor|quadcopter|multicoptere|hexacoptere)\b/, ' drone '],
  [/\b(sous-marin|sous marin|robot sous-marin|engin sous-marin)\b/, ' rov '], [/\b(flotte de robots|groupe de robots|essaim de robots)\b/, ' essaim '], [/\b(robot collaboratif)\b/, ' cobot '], [/\b(prehenseur|pince)\b/, ' pince '], [/\b(robot chien|robot a quatre pattes)\b/, ' quadrupede ']];
export function parseRequest(text: string): ParsedRequest {
  let t = wordsToDigits(norm(text)); for (const [re, rep] of SYN) t = t.replace(re, rep);
  const r: ParsedRequest = { intent: 'inconnu', type: null, params: {}, context: [], modules: [], missing: [], notes: [], quantities: [] };
  const QRE = /(\d+(?:[.,]\d+)?)\s*(kilogrammes?|kg|grammes?|g|millimetres?|mm|centimetres?|cm|metres?|m|newtons?\s*metres?|n\.?m|n·m|nm|newtons?|n|m\/s|km\/h)(?![a-z])/g;
  for (const mm of t.matchAll(QRE)) { const v = parseFloat(mm[1].replace(',', '.')); const u = mm[2].replace(/\s+/g, '');
    const q: Quantity | null = /^(kilogrammes?|kg)$/.test(u) ? { value: v, kind: 'masse', si: v, raw: mm[0] } : /^(grammes?|g)$/.test(u) ? { value: v, kind: 'masse', si: v / 1000, raw: mm[0] }
      : /^(millimetres?|mm)$/.test(u) ? { value: v, kind: 'longueur', si: v / 1000, raw: mm[0] } : /^(centimetres?|cm)$/.test(u) ? { value: v, kind: 'longueur', si: v / 100, raw: mm[0] } : /^(metres?|m)$/.test(u) ? { value: v, kind: 'longueur', si: v, raw: mm[0] }
      : /^(newtons?metres?|n\.?m|n·m|nm)$/.test(u) ? { value: v, kind: 'couple', si: v, raw: mm[0] } : /^(newtons?|n)$/.test(u) ? { value: v, kind: 'force', si: v, raw: mm[0] } : u === 'm/s' ? { value: v, kind: 'vitesse', si: v, raw: mm[0] } : u === 'km/h' ? { value: v, kind: 'vitesse', si: v / 3.6, raw: mm[0] } : null;
    if (q) r.quantities.push(q); }
  const first = (k: Quantity['kind']) => r.quantities.find((q) => q.kind === k)?.si;
  if (first('force') != null) r.params.force = first('force')!; if (first('couple') != null) r.params.torque = first('couple')!;
  if (/rendez-vous|rendez vous|regroup|rassembl/.test(t)) r.mission = { kind: 'rendezvous' }; else if (/couverture|couvrir|balay|quadrill/.test(t)) r.mission = { kind: 'couverture' };
  const pts = [...t.matchAll(/\(\s*(\d+(?:[.,]\d+)?)\s*[;,]\s*(\d+(?:[.,]\d+)?)\s*\)/g)].map((m) => [parseFloat(m[1].replace(',', '.')), parseFloat(m[2].replace(',', '.'))] as [number, number]);
  if (pts.length >= 2 && /(de|depuis|du)\b.*\b(a|vers|jusqu)/.test(t)) r.mission = { kind: 'trajet', from: pts[0], to: pts[1] };
  if (/compar/.test(t)) r.intent = 'comparer'; else if (/simul|teste|verifi|calcul/.test(t)) r.intent = 'simuler'; else if (/configur|concoi|cree|construi|dimensionn/.test(t)) r.intent = 'configurer';
  let best = 0;
  for (const rt of ROBOT_TYPES) { const sc = rt.keywords.filter((k) => t.includes(norm(k))).length * 2 + (t.includes(norm(rt.name)) ? 3 : 0); if (sc > best) { best = sc; r.type = rt; } }
  const W = '(\\d+(?:[.,]\\d+)?|un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|vingt|cent)';
  if (first('masse') != null) r.params.payloadMass = first('masse')!; if (first('longueur') != null) r.params.length = first('longueur')!;
  const masses = r.quantities.filter((q) => q.kind === 'masse').map((q) => q.si);
  const cnt = t.match(new RegExp(`${W}\\s*(rotors?|helices?|roues?|agents?|robots?|doigts?|drones?)`)); if (cnt && !/^une?$/.test(cnt[1])) r.params[`n_${cnt[2].replace(/s$/, '')}`] = num(cnt[1]);
  const spd = t.match(/(\d+(?:[.,]\d+)?)\s*(m\/s|km\/h)/); if (spd) r.params.speed = parseFloat(spd[1].replace(',', '.')) / (spd[2] === 'km/h' ? 3.6 : 1);
  for (const [k, re] of [['entrepôt', /entrepot/], ['extérieur', /exterieur|tout-terrain/], ['milieu marin', /mer|marin|ocean/], ['milieu médical', /hopital|medical/]] as [string, RegExp][]) if (re.test(t)) r.context.push(k);
  if (r.intent === 'comparer') { if (masses.length >= 2) { r.params.massA = masses[0]; r.params.massB = masses[1]; r.notes.push(`Comparaison : deux configurations (masses ${masses[0]} kg et ${masses[1]} kg).`); } else r.notes.push('Comparaison : deux configurations seront préparées (A et B) ; précisez la grandeur qui diffère.'); }
  if (!r.type) { r.missing.push('Type de robot non reconnu'); return r; }
  r.modules = r.type.armWorkspace ? ['arm', ...r.type.modules] : [...r.type.modules];
  if (!r.modules.length) r.notes.push(`Aucun module de simulation implémenté pour « ${r.type.name} » : ${r.type.notImplemented.join(' ; ')}.`);
  if (r.params.payloadMass != null && r.type.modules.includes('gripper')) r.notes.push(`La masse ${r.params.payloadMass} kg sera transmise comme charge utile et masse d'objet (préhension).`);
  for (const id of r.type.modules) { const m = ALL_MODULES[id]; m.params.filter((p) => p.required && p.demo == null).forEach((p) => r.missing.push(`${p.label} (${m.title})`)); }
  if (r.type.armWorkspace) r.missing.push('Matériaux des segments', 'Moteur de l\'axe 5', 'Trajectoire souhaitée (poses)');
  r.notes.push('Toutes les autres valeurs proviennent de valeurs de démonstration étiquetées et doivent être remplacées par des données réelles.');
  return r;
}
