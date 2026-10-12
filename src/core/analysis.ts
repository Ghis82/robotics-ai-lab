import { deg } from './math';
import { missingData, type RobotModel } from './model';
import type { SimResult } from './simulation';
export type Nature = 'calculé' | 'estimé' | 'à valider';
export type Severity = 'critique' | 'avertissement' | 'info';
export interface Anomaly { id: string; severity: Severity; nature: Nature; title: string; detail: string; t?: number; suggestion?: string }
export interface Analysis { anomalies: Anomaly[]; summary: string[]; assumptions: string[]; peaks: { joint: string; static: number; dynamic: number; motor: number | null }[] }
export const ASSUMPTIONS = [
  'Chaîne série d\'articulations rotoïdes idéales (sans jeu, sans frottement, sans élasticité).',
  'Chaque segment est modélisé comme une tige homogène : masse ponctuelle au milieu du segment.',
  'La charge utile est une masse ponctuelle à l\'extrémité de l\'effecteur.',
  'Couple statique : τ = Σ (r × m·(−g))·z sur les masses en aval, g = 9,81 m/s².',
  'Couple dynamique ESTIMÉ : accélérations cartésiennes des masses ponctuelles par différences finies ; inerties propres de rotation des segments et masses des moteurs ignorées.',
  'Collisions : segments approximés par des capsules (segment + rayon), obstacles par des sphères, sol = plan z = 0. Segments adjacents non testés entre eux.',
  'Basculement : test statique, projection du centre de masse dans un disque d\'appui ; socle supposé posé (non boulonné).',
  'Trajectoire : interpolation quintique articulaire repos-à-repos entre poses ; échantillonnage discret (une collision brève entre deux échantillons peut être manquée).',
];
/** Assistant d'analyse déterministe : n'interprète QUE des données calculées par le moteur. */
export function analyze(m: RobotModel, sim: SimResult): Analysis {
  const A: Anomaly[] = []; const F = sim.frames;
  // Limites articulaires
  m.joints.forEach((j, i) => {
    const bad = F.find((f) => f.limits.some((l) => l.joint === i));
    if (bad) A.push({ id: `lim-${i}`, severity: 'critique', nature: 'calculé', t: bad.t, title: `Limite dépassée : ${j.name}`,
      detail: `Consigne ${deg(bad.q[i]).toFixed(1)}° hors de [${deg(j.min).toFixed(0)}°, ${deg(j.max).toFixed(0)}°] à t = ${bad.t.toFixed(2)} s.`, suggestion: 'Modifier la pose cible ou élargir la butée si la mécanique le permet.' });
    const vmax = Math.max(...F.map((f) => Math.abs(f.dq[i])));
    if (j.motor?.maxSpeed && vmax > j.motor.maxSpeed) A.push({ id: `vel-${i}`, severity: 'avertissement', nature: 'calculé', title: `Vitesse excessive : ${j.name}`,
      detail: `Vitesse requise ${deg(vmax).toFixed(0)}°/s > vitesse déclarée ${deg(j.motor.maxSpeed).toFixed(0)}°/s.`, suggestion: 'Allonger la durée du mouvement.' });
  });
  // Collisions
  const seen = new Set<string>();
  F.forEach((f) => f.contacts.forEach((c) => {
    const key = `${c.kind}-${c.a}-${c.b}`; if (seen.has(key)) return; seen.add(key);
    const worst = Math.min(...F.flatMap((g) => g.contacts.filter((d) => `${d.kind}-${d.a}-${d.b}` === key).map((d) => d.clearance)));
    const other = typeof c.b === 'number' ? `« ${m.links[c.b].name} »` : c.b === 'sol' ? 'le sol' : `« ${c.b} »`;
    A.push({ id: `col-${key}`, severity: 'critique', nature: 'calculé', t: f.t, title: `Collision : « ${m.links[c.a].name} » / ${other}`,
      detail: `Première détection à t = ${f.t.toFixed(2)} s, interpénétration max des capsules ${(Math.abs(worst) * 1000).toFixed(0)} mm (géométrie approximée).`,
      suggestion: 'Modifier la trajectoire (point de passage intermédiaire) ou les longueurs de segment.' });
  }));
  // Couples
  const peaks = m.joints.map((j, i) => ({ joint: j.name, static: Math.max(...F.map((f) => Math.abs(f.tauStatic[i]))), dynamic: Math.max(...F.map((f) => Math.abs(f.tauDynamic[i]))), motor: j.motor?.maxTorque ?? null }));
  if (sim.massesComplete) peaks.forEach((p, i) => {
    if (p.motor == null) return;
    if (p.static > p.motor) A.push({ id: `tq-s-${i}`, severity: 'critique', nature: 'calculé', title: `Couple statique insuffisant : ${p.joint}`,
      detail: `Couple gravitaire max ${p.static.toFixed(2)} N·m > couple moteur déclaré ${p.motor.toFixed(2)} N·m.`, suggestion: 'Moteur/réducteur plus puissant, segments plus légers ou plus courts, charge réduite.' });
    else if (p.dynamic > p.motor) A.push({ id: `tq-d-${i}`, severity: 'avertissement', nature: 'estimé', title: `Couple dynamique estimé insuffisant : ${p.joint}`,
      detail: `Couple estimé max ${p.dynamic.toFixed(2)} N·m > ${p.motor.toFixed(2)} N·m (masses ponctuelles, sans frottement).`, suggestion: 'Ralentir le mouvement ou choisir un moteur plus puissant.' });
    else if (p.dynamic > 0.8 * p.motor) A.push({ id: `tq-m-${i}`, severity: 'avertissement', nature: 'estimé', title: `Marge de couple faible : ${p.joint}`,
      detail: `Couple estimé max ${p.dynamic.toFixed(2)} N·m = ${(100 * p.dynamic / p.motor).toFixed(0)} % du couple déclaré. Frottements et inerties non modélisés peuvent consommer cette marge.`, suggestion: 'Prévoir une marge (souvent ≥ 30 %, à confirmer selon l\'application).' });
  });
  // Basculement
  const tip = F.filter((f) => f.tipMargin != null);
  if (tip.length) { const w = tip.reduce((a, b) => (b.tipMargin! < a.tipMargin! ? b : a));
    if (w.tipMargin! < 0) A.push({ id: 'tip', severity: 'critique', nature: 'calculé', t: w.t, title: 'Risque de basculement (statique)',
      detail: `Le centre de masse sort de l'empreinte du socle de ${(-w.tipMargin! * 1000).toFixed(0)} mm à t = ${w.t.toFixed(2)} s.`, suggestion: 'Fixer le socle, l\'alourdir ou élargir son empreinte.' }); }
  // Cobot : vitesse TCP et effort transmissible estimé, comparés aux seuils DÉCLARÉS par l'utilisateur (aucune valeur normative implicite)
  if (m.kind === 'cobot' || m.cobotLimits) {
    const cc = cobotChecks(m, sim);
    const lim = m.cobotLimits ?? { tcpSpeed: null, contactForce: null };
    if (lim.tcpSpeed == null) A.push({ id: 'cobot-v-miss', severity: 'info', nature: 'à valider', title: 'Seuil de vitesse TCP non déclaré', detail: `Vitesse TCP max calculée : ${cc.vmax.toFixed(3)} m/s ; aucun seuil fourni pour comparaison.` });
    else if (cc.vmax > lim.tcpSpeed) A.push({ id: 'cobot-v', severity: 'critique', nature: 'calculé', t: cc.tV, title: 'Vitesse TCP supérieure au seuil déclaré', detail: `${cc.vmax.toFixed(3)} m/s > ${lim.tcpSpeed} m/s à t = ${cc.tV.toFixed(2)} s.`, suggestion: 'Allonger la durée des segments de trajectoire.' });
    if (lim.contactForce == null) A.push({ id: 'cobot-f-miss', severity: 'info', nature: 'à valider', title: 'Seuil d\'effort de contact non déclaré', detail: `Effort quasi-statique max transmissible au TCP (estimé) : ${cc.fmax.toFixed(0)} N.` });
    else if (cc.fmax > lim.contactForce) A.push({ id: 'cobot-f', severity: 'avertissement', nature: 'estimé', title: 'Effort transmissible supérieur au seuil déclaré', detail: `Estimation quasi-statique ${cc.fmax.toFixed(0)} N > ${lim.contactForce} N dans la direction du mouvement : une limitation logicielle d'effort serait nécessaire.`, suggestion: 'Réduire les couples max ou ajouter une surveillance d\'effort.' });
    A.push({ id: 'cobot-norm', severity: 'info', nature: 'à valider', title: 'Aucune conformité normative évaluée', detail: 'Ces vérifications comparent seulement à des seuils déclarés ; elles ne constituent pas une évaluation de conformité ISO 10218 / ISO/TS 15066 (analyse de risques, mesures de forces/pressions réelles requises).' });
  }
  // Données manquantes
  missingData(m).forEach((d) => A.push({ id: `miss-${d.path}`, severity: 'info', nature: 'à valider', title: `Donnée manquante : ${d.label}`, detail: d.impact }));
  A.push({ id: 'val-struct', severity: 'info', nature: 'à valider', title: 'Résistance structurelle non évaluée', detail: 'Aucun calcul de contraintes/flexion (nécessite matériaux, sections et un outil éléments finis).' });
  const crit = A.filter((a) => a.severity === 'critique').length, warn = A.filter((a) => a.severity === 'avertissement').length;
  const summary = [
    `${F.length} échantillons simulés sur ${F[F.length - 1].t.toFixed(2)} s.`,
    `${crit} problème(s) critique(s) calculé(s), ${warn} avertissement(s), ${A.filter((a) => a.nature === 'à valider').length} point(s) à valider.`,
    sim.massesComplete ? 'Toutes les masses de segments sont renseignées : couples calculables.' : 'Masses incomplètes : les couples affichés ignorent les segments sans masse et sont donc sous-estimés.',
    crit === 0 ? 'Aucun problème critique détecté DANS LE CADRE DES HYPOTHÈSES ; cela ne valide pas le robot pour une fabrication réelle.' : 'Des problèmes critiques doivent être corrigés avant toute suite.',
  ];
  return { anomalies: A, summary, assumptions: ASSUMPTIONS, peaks };
}
/** Comparaison de deux configurations à partir de leurs résultats calculés. */
export function compare(a: Analysis, b: Analysis): string[] {
  const c = (x: Analysis) => x.anomalies.filter((y) => y.severity === 'critique').length;
  const lines = [`Critiques : A = ${c(a)}, B = ${c(b)}.`];
  a.peaks.forEach((p, i) => { const q = b.peaks[i]; if (q) lines.push(`${p.joint} : couple estimé max ${p.dynamic.toFixed(2)} → ${q.dynamic.toFixed(2)} N·m.`); });
  return lines;
}

import { forwardKinematics as _fk } from './kinematics';
import { cross as _cross, sub as _sub, dot as _dot } from './math';
/** Vitesse TCP (différences finies, calculée) et effort quasi-statique max transmissible au TCP dans la direction du mouvement :
 *  F = min_j τmax_j / |(Jᵀu)_j| (estimation, couples gravitaires non retranchés, transmissions idéales). */
export function cobotChecks(m: RobotModel, sim: SimResult) {
  const F = sim.frames; let vmax = 0, tV = 0, fmax = 0;
  for (let i = 1; i < F.length; i++) { const d = _sub(F[i].fk.tip, F[i - 1].fk.tip); const v = Math.hypot(...d) / (F[i].t - F[i - 1].t); if (v > vmax) { vmax = v; tV = F[i].t; }
    if (v < 1e-4) continue; const u = d.map((x) => x / Math.hypot(...d)) as [number, number, number]; const fk = F[i].fk;
    let f = Infinity; m.joints.forEach((j, k) => { if (!j.motor) return; const jt = _dot(_cross(fk.jointAxes[k], _sub(fk.tip, fk.jointOrigins[k])), u); if (Math.abs(jt) > 1e-6) f = Math.min(f, j.motor.maxTorque / Math.abs(jt)); });
    if (Number.isFinite(f)) fmax = Math.max(fmax, f); }
  void _fk; return { vmax, tV, fmax };
}
