// Modules de simulation exposés via l'interface commune SimModule.
import type { SimModule, ModuleResult, ModuleIssue } from './types';
import { scaraFK, scaraIK, scaraWorkspace } from './scara';
import { diffDrive, frictionAccelLimit, wheelTorqueRequired, trapezoid, pathCollisions, pathLength, type P2 } from './mobile';
import { stabilityMargin, comOf } from './balance';
import { thrustToWeight, hoverThrottle, verticalClimb } from './aerial';
import { netBuoyancy, terminalSpeed, RHO_SEA, RHO_FRESH } from './aquatic';
import { requiredGripForce } from './gripper';
import { initSwarm, step, minSeparation, collisions } from './swarm';
const R = (ok = true): ModuleResult => ({ ok, results: [], issues: [], missing: [], assumptions: [] });
const deg = (r: number) => (r * 180) / Math.PI;
const I = (severity: ModuleIssue['severity'], nature: ModuleIssue['nature'], text: string): ModuleIssue => ({ severity, nature, text });

export const scaraModule: SimModule = {
  id: 'scara', title: 'SCARA : cinématique directe et inverse', description: 'Bras plan 2R + axe vertical : position de l\'outil, solutions IK, espace de travail.',
  params: [
    { key: 'l1', label: 'Longueur bras 1', unit: 'm', demo: 0.25, required: true }, { key: 'l2', label: 'Longueur bras 2', unit: 'm', demo: 0.2, required: true },
    { key: 'x', label: 'Cible X', unit: 'm', demo: 0.3, required: true }, { key: 'y', label: 'Cible Y', unit: 'm', demo: 0.15, required: true },
    { key: 'zstroke', label: 'Course axe Z', unit: 'm', demo: null, required: false },
  ],
  assumptions: ['Segments rigides, articulations idéales, axes parallèles verticaux.', 'Butées articulaires non prises en compte dans l\'IK.'],
  run(v) {
    const r = R(); const ws = scaraWorkspace(v.l1!, v.l2!); const sols = scaraIK(v.l1!, v.l2!, v.x!, v.y!);
    r.results.push({ label: 'Rayon de travail min', value: ws.rMin.toFixed(3), unit: 'm', nature: 'calculé' }, { label: 'Rayon de travail max', value: ws.rMax.toFixed(3), unit: 'm', nature: 'calculé' });
    if (!sols.length) { r.ok = false; r.issues.push(I('critique', 'calculé', `Cible hors de l'espace de travail (distance ${Math.hypot(v.x!, v.y!).toFixed(3)} m).`)); }
    sols.forEach((s, i) => { const f = scaraFK(v.l1!, v.l2!, s.t1, s.t2); r.results.push({ label: `Solution IK ${i + 1} (θ1, θ2)`, value: `${deg(s.t1).toFixed(1)}°, ${deg(s.t2).toFixed(1)}°`, nature: 'calculé' }, { label: `Vérification FK ${i + 1}`, value: `${f.x.toFixed(4)}, ${f.y.toFixed(4)}`, unit: 'm', nature: 'calculé' }); });
    return r;
  },
};
export const mobileModule: SimModule = {
  id: 'mobile-diff', title: 'Robot à roues différentiel : cinématique et trajet', description: 'Vitesse, rayon de braquage, limite d\'adhérence, durée et collisions sur un trajet 2D.',
  params: [
    { key: 'mass', label: 'Masse', unit: 'kg', demo: 25, required: true }, { key: 'track', label: 'Voie (entraxe roues)', unit: 'm', demo: 0.45, required: true },
    { key: 'wheelR', label: 'Rayon de roue', unit: 'm', demo: 0.08, required: true }, { key: 'vl', label: 'Vitesse roue gauche', unit: 'm/s', demo: 0.8, required: true },
    { key: 'vr', label: 'Vitesse roue droite', unit: 'm/s', demo: 1.0, required: true }, { key: 'vmax', label: 'Vitesse max', unit: 'm/s', demo: 1.2, required: true },
    { key: 'amax', label: 'Accélération demandée', unit: 'm/s²', demo: 1.5, required: true }, { key: 'mu', label: 'Coefficient d\'adhérence μ', unit: '', demo: null, required: false },
    { key: 'motorTorque', label: 'Couple max par roue motrice', unit: 'N·m', demo: null, required: false }, { key: 'robotR', label: 'Rayon d\'encombrement', unit: 'm', demo: 0.3, required: true },
  ],
  assumptions: ['Roulement sans glissement, sol plan, pas de résistance au roulement ni de pente.', 'Trajet de démonstration : polyligne fixe dans un entrepôt de 10×6 m avec 3 obstacles circulaires (données de démonstration).', 'Robot assimilé à un disque pour les collisions.'],
  run(v) {
    const r = R(); const k = diffDrive(v.vl!, v.vr!, v.track!);
    r.results.push({ label: 'Vitesse linéaire', value: k.v.toFixed(3), unit: 'm/s', nature: 'calculé' }, { label: 'Vitesse angulaire', value: k.w.toFixed(3), unit: 'rad/s', nature: 'calculé' }, { label: 'Rayon de braquage', value: Number.isFinite(k.radius) ? k.radius.toFixed(3) : '∞ (ligne droite)', unit: 'm', nature: 'calculé' });
    let a = v.amax!;
    if (v.mu != null) { const lim = frictionAccelLimit(v.mu); r.results.push({ label: 'Accélération max par adhérence', value: lim.toFixed(2), unit: 'm/s²', nature: 'estimé' }); if (a > lim) { r.issues.push(I('critique', 'estimé', `Accélération demandée ${a} > limite d'adhérence ${lim.toFixed(2)} m/s² : patinage probable.`)); a = lim; } }
    else r.issues.push(I('info', 'à valider', 'μ non renseigné : limite d\'adhérence non vérifiée.'));
    const tq = wheelTorqueRequired(v.mass!, v.amax!, v.wheelR!, 2); r.results.push({ label: 'Couple requis par roue (2 motrices)', value: tq.toFixed(2), unit: 'N·m', nature: 'calculé' });
    if (v.motorTorque != null && tq > v.motorTorque) r.issues.push(I('critique', 'calculé', `Couple requis ${tq.toFixed(2)} N·m > couple déclaré ${v.motorTorque} N·m.`));
    const path: P2[] = [[0.5, 0.5], [4, 0.5], [4, 3], [8, 3], [9.5, 5.5]]; const obs = [{ c: [2, 1] as P2, r: 0.3 }, { c: [6, 3.2] as P2, r: 0.4 }, { c: [8.5, 1] as P2, r: 0.5 }];
    const L = pathLength(path); const tr = trapezoid(L, v.vmax!, a);
    r.results.push({ label: 'Longueur du trajet', value: L.toFixed(2), unit: 'm', nature: 'calculé' }, { label: 'Durée minimale (trapèze, sans arrêts aux virages)', value: tr.time.toFixed(1), unit: 's', nature: 'estimé' });
    const hits = pathCollisions(path, v.robotR!, obs); hits.forEach((h) => r.issues.push(I('critique', 'calculé', `Collision segment ${h.segment + 1} avec obstacle ${h.obstacle + 1} (interpénétration ${(-h.clearance * 100).toFixed(0)} cm).`)));
    if (!hits.length) r.issues.push(I('info', 'calculé', 'Aucune collision sur le trajet de démonstration.'));
    return r;
  },
};
export const balanceModule = (kind: 'biped' | 'quadruped'): SimModule => ({
  id: `balance-${kind}`, title: kind === 'biped' ? 'Équilibre statique bipède' : 'Équilibre statique quadrupède', description: 'Projection du centre de masse dans le polygone d\'appui (posture statique).',
  params: kind === 'biped' ? [
    { key: 'footL', label: 'Longueur du pied', unit: 'm', demo: 0.22, required: true }, { key: 'footW', label: 'Largeur du pied', unit: 'm', demo: 0.1, required: true },
    { key: 'stance', label: 'Écart entre pieds (centres)', unit: 'm', demo: 0.2, required: true }, { key: 'single', label: 'Appui unipodal (1 = oui, 0 = non)', unit: '', demo: 0, required: true },
    { key: 'comX', label: 'CdM X (avant)', unit: 'm', demo: 0.02, required: true }, { key: 'comY', label: 'CdM Y (latéral)', unit: 'm', demo: 0, required: true },
  ] : [
    { key: 'L', label: 'Empattement (avant-arrière)', unit: 'm', demo: 0.5, required: true }, { key: 'W', label: 'Voie (gauche-droite)', unit: 'm', demo: 0.3, required: true },
    { key: 'lift', label: 'Patte levée (0 = aucune, 1-4)', unit: '', demo: 1, required: true }, { key: 'comX', label: 'CdM X', unit: 'm', demo: 0.05, required: true }, { key: 'comY', label: 'CdM Y', unit: 'm', demo: 0.02, required: true },
  ],
  assumptions: ['Statique pure : pas de ZMP dynamique, pas de forces d\'inertie.', 'Contacts plans rigides sur sol horizontal.'],
  run(v) {
    const r = R(); let pts: [number, number][];
    if (kind === 'biped') { const f = (cy: number): [number, number][] => [[-v.footL! / 2, cy - v.footW! / 2], [v.footL! / 2, cy - v.footW! / 2], [v.footL! / 2, cy + v.footW! / 2], [-v.footL! / 2, cy + v.footW! / 2]]; pts = v.single ? f(v.stance! / 2) : [...f(v.stance! / 2), ...f(-v.stance! / 2)]; }
    else { pts = [[v.L! / 2, v.W! / 2], [v.L! / 2, -v.W! / 2], [-v.L! / 2, -v.W! / 2], [-v.L! / 2, v.W! / 2]]; if (v.lift! >= 1 && v.lift! <= 4) pts.splice(Math.round(v.lift!) - 1, 1); }
    const m = stabilityMargin([v.comX!, v.comY!], pts); void comOf;
    r.results.push({ label: 'Marge de stabilité statique', value: (m * 1000).toFixed(1), unit: 'mm', nature: 'calculé' }, { label: 'Points de contact', value: pts.length, nature: 'calculé' });
    if (m < 0) { r.ok = false; r.issues.push(I('critique', 'calculé', 'Le CdM projeté sort du polygone d\'appui : basculement statique.')); }
    else if (m < 0.01) r.issues.push(I('avertissement', 'calculé', 'Marge < 10 mm : très sensible aux perturbations.'));
    r.issues.push(I('info', 'à valider', 'Stabilité dynamique (marche) non évaluée : nécessite ZMP/simulation multicorps.'));
    return r;
  },
});
export const aerialModule: SimModule = {
  id: 'aerial', title: 'Multirotor : poussée, stationnaire, montée verticale', description: 'Rapport poussée/poids, gaz de stationnaire, dynamique verticale point-masse.',
  params: [
    { key: 'mass', label: 'Masse au décollage', unit: 'kg', demo: 1.6, required: true }, { key: 'nRotors', label: 'Nombre de rotors', unit: '', demo: 4, required: true },
    { key: 'thrustPer', label: 'Poussée max par rotor (banc)', unit: 'N', demo: 9, required: true }, { key: 'climbCmd', label: 'Commande de montée', unit: '% poussée max', demo: 70, required: true },
    { key: 'battWh', label: 'Énergie batterie', unit: 'Wh', demo: null, required: false },
  ],
  assumptions: ['Masse ponctuelle, axe vertical seulement : m·z\'\' = T − m·g.', 'Aucune traînée, effet de sol ni dynamique d\'hélice modélisés.', 'Poussée supposée proportionnelle à la commande (simplification ; en réalité ≈ quadratique en vitesse de rotation).'],
  run(v) {
    const r = R(); const T = v.nRotors! * v.thrustPer!; const tw = thrustToWeight(T, v.mass!); const hov = hoverThrottle(T, v.mass!);
    r.results.push({ label: 'Poussée totale max', value: T.toFixed(1), unit: 'N', nature: 'calculé' }, { label: 'Rapport poussée/poids', value: tw.toFixed(2), nature: 'calculé' }, { label: 'Commande de stationnaire', value: (hov * 100).toFixed(0), unit: '%', nature: 'estimé' });
    if (tw < 1) { r.ok = false; r.issues.push(I('critique', 'calculé', 'Poussée/poids < 1 : décollage impossible.')); } else if (tw < 2) r.issues.push(I('avertissement', 'calculé', 'Poussée/poids < 2 : faible marge de contrôle (ordre de grandeur usuel ≥ 2, à confirmer).'));
    const sim = verticalClimb(v.mass!, (T * v.climbCmd!) / 100, 3, 0.01);
    r.results.push({ label: 'Altitude après 3 s (sans traînée)', value: sim.z[sim.z.length - 1].toFixed(2), unit: 'm', nature: 'estimé' });
    r.series = [{ label: 'Altitude (modèle point-masse sans traînée)', x: sim.t, y: sim.z, xLabel: 't (s)', yLabel: 'z (m)' }];
    if (v.battWh == null) r.issues.push(I('info', 'à valider', 'Autonomie non calculée : énergie batterie et puissance de stationnaire mesurée requises.'));
    r.issues.push(I('info', 'à valider', 'Aérodynamique, stabilité d\'attitude et contrôle non simulés.'));
    return r;
  },
};
export const aquaticModule: SimModule = {
  id: 'aquatic', title: 'Engin sous-marin : flottabilité et vitesse limite', description: 'Flottabilité nette, vitesse limite sous traînée quadratique avec Cd fourni.',
  params: [
    { key: 'mass', label: 'Masse', unit: 'kg', demo: 12, required: true }, { key: 'volume', label: 'Volume déplacé', unit: 'm³', demo: 0.0121, required: true },
    { key: 'sea', label: 'Eau de mer (1) / douce (0)', unit: '', demo: 1, required: true }, { key: 'thrust', label: 'Poussée propulseurs (axe)', unit: 'N', demo: 40, required: true },
    { key: 'cd', label: 'Coefficient de traînée Cd', unit: '', demo: null, required: true, help: 'Aucune valeur par défaut : dépend de la forme, à mesurer ou estimer (CFD/bassin).' },
    { key: 'area', label: 'Surface frontale', unit: 'm²', demo: 0.06, required: true },
  ],
  assumptions: ['Fluide au repos, densité constante.', 'Traînée quadratique F = ½ρCdAv², Cd constant fourni par l\'utilisateur.', 'Masses ajoutées et couplages ignorés.'],
  run(v) {
    const r = R(); const rho = v.sea ? RHO_SEA : RHO_FRESH; const nb = netBuoyancy(v.mass!, v.volume!, rho);
    r.results.push({ label: 'Flottabilité nette', value: nb.toFixed(2), unit: 'N', nature: 'calculé' }, { label: 'Vitesse limite', value: terminalSpeed(v.thrust!, v.cd!, v.area!, rho).toFixed(2), unit: 'm/s', nature: 'estimé' });
    r.issues.push(I(Math.abs(nb) > 0.05 * v.mass! * 9.81 ? 'avertissement' : 'info', 'calculé', nb > 0 ? 'Flottabilité positive : l\'engin remonte sans propulsion.' : nb < 0 ? 'Flottabilité négative : l\'engin coule sans propulsion.' : 'Flottabilité neutre.'));
    return r;
  },
};
export const gripperModule: SimModule = {
  id: 'gripper', title: 'Préhension par frottement', description: 'Effort de serrage minimal F ≥ m·(g + a)/(n·μ).',
  params: [
    { key: 'mass', label: 'Masse de l\'objet', unit: 'kg', demo: 2, required: true }, { key: 'mu', label: 'Frottement μ doigt/objet', unit: '', demo: null, required: true, help: 'Dépend des matériaux en contact : à mesurer.' },
    { key: 'n', label: 'Nombre de surfaces de contact', unit: '', demo: 2, required: true }, { key: 'accel', label: 'Accélération verticale max', unit: 'm/s²', demo: 2, required: true },
    { key: 'fmax', label: 'Effort de serrage disponible', unit: 'N', demo: null, required: false },
  ],
  assumptions: ['Contacts ponctuels opposés, objet rigide, frottement de Coulomb, charge verticale.', 'Pas de coefficient de sécurité appliqué.'],
  run(v) {
    const r = R(); const F = requiredGripForce(v.mass!, v.mu!, v.n!, v.accel!);
    r.results.push({ label: 'Effort de serrage minimal', value: F.toFixed(1), unit: 'N', nature: 'calculé' });
    if (v.fmax != null && v.fmax < F) { r.ok = false; r.issues.push(I('critique', 'calculé', `Effort disponible ${v.fmax} N < requis ${F.toFixed(1)} N.`)); }
    return r;
  },
};
export const swarmModule: SimModule = {
  id: 'swarm', title: 'Essaim : agents ponctuels', description: 'Flocking (séparation/alignement/cohésion), séparation minimale et collisions.',
  params: [
    { key: 'n', label: 'Nombre d\'agents', unit: '', demo: 20, required: true }, { key: 'radius', label: 'Rayon d\'un agent', unit: 'm', demo: 0.1, required: true },
    { key: 'sep', label: 'Distance de séparation visée', unit: 'm', demo: 1, required: true }, { key: 'vmax', label: 'Vitesse max', unit: 'm/s', demo: 1, required: true },
    { key: 'steps', label: 'Pas de simulation (dt = 0,1 s)', unit: '', demo: 300, required: true },
  ],
  assumptions: ['Agents = points 2D, sans dynamique de véhicule, communication parfaite.', 'Graine aléatoire fixe (reproductible).'],
  run(v) {
    const r = R(); let a = initSwarm(Math.round(v.n!), 10, 42); const x: number[] = [], y: number[] = []; let col = 0;
    for (let k = 0; k < v.steps!; k++) { a = step(a, { sep: v.sep!, view: 3 * v.sep!, vmax: v.vmax!, dt: 0.1 }); col += collisions(a, v.radius!); if (k % 5 === 0) { x.push(k * 0.1); y.push(minSeparation(a)); } }
    r.results.push({ label: 'Séparation minimale finale', value: minSeparation(a).toFixed(3), unit: 'm', nature: 'calculé' }, { label: 'Contacts agent-agent cumulés', value: col, nature: 'calculé' });
    if (col) r.issues.push(I('avertissement', 'calculé', `${col} contacts détectés au cours de la simulation.`));
    r.series = [{ label: 'Séparation minimale', x, y, xLabel: 't (s)', yLabel: 'm' }];
    return r;
  },
};
export const ALL_MODULES: Record<string, SimModule> = Object.fromEntries([scaraModule, mobileModule, balanceModule('biped'), balanceModule('quadruped'), aerialModule, aquaticModule, gripperModule, swarmModule].map((m) => [m.id, m]));
import { deltaFK, deltaIK, deltaWorkspace } from './delta';
import { syncMove, inRange, workspaceVolume, sampleSync, type Axis } from './gantry';
import { skidSteer, integratePose, pivotResistMoment } from './tracked';
export const deltaModule: SimModule = {
  id: 'delta', title: 'Delta : cinématique directe/inverse et espace de travail', description: 'Robot parallèle 3 bras rotoïdes (formulation de Clavel).',
  params: [
    { key: 'f', label: 'Côté triangle de base f', unit: 'm', demo: 0.346, required: true }, { key: 'e', label: 'Côté triangle effecteur e', unit: 'm', demo: 0.115, required: true },
    { key: 'rf', label: 'Bras supérieur rf', unit: 'm', demo: 0.2, required: true }, { key: 're', label: 'Avant-bras re', unit: 'm', demo: 0.46, required: true },
    { key: 'x', label: 'Cible X', unit: 'm', demo: 0.05, required: true }, { key: 'y', label: 'Cible Y', unit: 'm', demo: 0.02, required: true }, { key: 'z', label: 'Cible Z (négatif, sous la base)', unit: 'm', demo: -0.35, required: true },
    { key: 'tmin', label: 'Butée bras min', unit: '°', demo: -40, required: true }, { key: 'tmax', label: 'Butée bras max', unit: '°', demo: 90, required: true },
  ],
  assumptions: ['Liaisons idéales, parallélogrammes sans jeu, géométrie symétrique.', 'Espace de travail obtenu par échantillonnage (13³ points) des angles dans les butées : approximation.', 'Aucune dynamique ni rigidité modélisée.'],
  run(v) {
    const r = R(); const g = { f: v.f!, e: v.e!, rf: v.rf!, re: v.re! }; const ik = deltaIK(g, v.x!, v.y!, v.z!);
    if (!ik) { r.ok = false; r.issues.push(I('critique', 'calculé', 'Cible hors de l\'espace de travail géométrique.')); }
    else { r.results.push({ label: 'Angles IK (θ1, θ2, θ3)', value: ik.map((a) => deg(a).toFixed(2) + '°').join(', '), nature: 'calculé' }); const fk = deltaFK(g, ...ik)!; r.results.push({ label: 'Vérification FK', value: fk.map((a) => a.toFixed(4)).join(', '), unit: 'm', nature: 'calculé' });
      ik.forEach((a, i) => { if (deg(a) < v.tmin! || deg(a) > v.tmax!) r.issues.push(I('critique', 'calculé', `Bras ${i + 1} hors butées (${deg(a).toFixed(1)}°).`)); }); }
    const w = deltaWorkspace(g, (v.tmin! * Math.PI) / 180, (v.tmax! * Math.PI) / 180);
    r.results.push({ label: 'Configurations valides', value: `${w.valid}/${w.samples}`, nature: 'calculé' }, { label: 'Plage Z atteinte', value: `${w.zmin.toFixed(3)} … ${w.zmax.toFixed(3)}`, unit: 'm', nature: 'estimé' }, { label: 'Rayon horizontal max atteint', value: w.rmax.toFixed(3), unit: 'm', nature: 'estimé' });
    return r;
  },
};
export const gantryModule: SimModule = {
  id: 'gantry', title: 'Portique cartésien : courses, volume et trajectoire synchronisée', description: '3 axes prismatiques indépendants, profils trapézoïdaux synchronisés.',
  params: [
    ...(['X', 'Y', 'Z'] as const).flatMap((a, i) => [
      { key: `${a}max`, label: `Course ${a}`, unit: 'm', demo: [1.0, 0.8, 0.4][i], required: true }, { key: `${a}v`, label: `Vitesse max ${a}`, unit: 'm/s', demo: [1.0, 1.0, 0.5][i], required: true }, { key: `${a}a`, label: `Accélération max ${a}`, unit: 'm/s²', demo: [2, 2, 1][i], required: true }]),
    { key: 'tx', label: 'Cible X', unit: 'm', demo: 0.9, required: true }, { key: 'ty', label: 'Cible Y', unit: 'm', demo: 0.3, required: true }, { key: 'tz', label: 'Cible Z', unit: 'm', demo: 0.35, required: true },
    { key: 'load', label: 'Masse mobile axe Z', unit: 'kg', demo: null, required: false },
  ],
  assumptions: ['Axes parfaitement orthogonaux et rigides, départ à l\'origine (0,0,0).', 'Profil trapézoïdal ; synchronisation par mise à l\'échelle sur l\'axe le plus lent (approximation : le profil commun est un profil à accélération constante par morceaux).', 'Courses de 0 à la valeur indiquée.'],
  run(v) {
    const r = R(); const axes: Axis[] = (['X', 'Y', 'Z']).map((a) => ({ min: 0, max: v[`${a}max`]!, vmax: v[`${a}v`]!, amax: v[`${a}a`]! }));
    const tgt = [v.tx!, v.ty!, v.tz!]; const ok = inRange(axes, tgt);
    r.results.push({ label: 'Volume de travail', value: workspaceVolume(axes).toFixed(3), unit: 'm³', nature: 'calculé' });
    ok.forEach((o, i) => { if (!o) { r.ok = false; r.issues.push(I('critique', 'calculé', `Cible hors course sur l'axe ${'XYZ'[i]}.`)); } });
    if (r.ok) { const s = syncMove(axes, [0, 0, 0], tgt); r.results.push({ label: 'Durée du mouvement synchronisé', value: s.T.toFixed(3), unit: 's', nature: 'calculé' }, { label: 'Axe limitant', value: 'XYZ'[s.limiting], nature: 'calculé' });
      const smp = sampleSync(axes, [0, 0, 0], tgt, 0.01); r.series = [{ label: 'Position X (m)', x: smp.map((p) => p.t), y: smp.map((p) => p.p[0]), xLabel: 't (s)', yLabel: 'm' }];
      if (v.load != null) r.results.push({ label: 'Force verticale statique axe Z', value: (v.load * 9.81).toFixed(1), unit: 'N', nature: 'calculé' }); }
    return r;
  },
};
export const trackedModule: SimModule = {
  id: 'tracked', title: 'Robot à chenilles : cinématique skid-steer', description: 'Vitesse, lacet, rayon de virage avec facteur de glissement χ, trajectoire intégrée.',
  params: [
    { key: 'vl', label: 'Vitesse chenille gauche', unit: 'm/s', demo: 0.5, required: true }, { key: 'vr', label: 'Vitesse chenille droite', unit: 'm/s', demo: 0.8, required: true },
    { key: 'B', label: 'Voie (entraxe chenilles)', unit: 'm', demo: 0.5, required: true },
    { key: 'chi', label: 'Facteur de glissement χ (≥ 1)', unit: '', demo: null, required: true, help: 'Dépend du sol et des chenilles : à identifier expérimentalement. 1 = sans glissement (idéal).' },
    { key: 'T', label: 'Durée', unit: 's', demo: 10, required: true }, { key: 'mass', label: 'Masse', unit: 'kg', demo: null, required: false }, { key: 'muLat', label: 'Frottement latéral μ', unit: '', demo: null, required: false }, { key: 'L', label: 'Longueur de contact', unit: 'm', demo: 0.6, required: false },
  ],
  assumptions: ['Modèle cinématique skid-steer à facteur de glissement unique χ (empirique), sol plan.', 'Pas de dynamique de chenille, pas de terramécanique.'],
  run(v) {
    const r = R(); if (v.chi! < 1) { r.ok = false; r.issues.push(I('critique', 'calculé', 'χ doit être ≥ 1.')); return r; }
    const k = skidSteer(v.vl!, v.vr!, v.B!, v.chi!); const p = integratePose(k.v, k.w, v.T!);
    r.results.push({ label: 'Vitesse linéaire', value: k.v.toFixed(3), unit: 'm/s', nature: 'calculé' }, { label: 'Vitesse de lacet', value: k.w.toFixed(3), unit: 'rad/s', nature: 'estimé' }, { label: 'Rayon de virage', value: Number.isFinite(k.radius) ? k.radius.toFixed(2) : '∞', unit: 'm', nature: 'estimé' }, { label: `Pose après ${v.T} s`, value: `${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${deg(p.th).toFixed(0)}°`, nature: 'estimé' });
    if (v.mass != null && v.muLat != null && v.L != null) r.results.push({ label: 'Moment de résistance au pivotement', value: pivotResistMoment(v.muLat, v.mass, v.L).toFixed(1), unit: 'N·m', nature: 'estimé' });
    r.series = [{ label: 'Trajectoire y(x)', x: p.xs, y: p.ys, xLabel: 'x (m)', yLabel: 'y (m)' }];
    return r;
  },
};
ALL_MODULES.delta = deltaModule; ALL_MODULES.gantry = gantryModule; ALL_MODULES.tracked = trackedModule;
import { legIK, legFK, crawlGait, bipedSwayZMP } from './legged';
import { simulateQuad, mix, G as GQ } from './quadrotor';
export const quadGaitModule: SimModule = {
  id: 'quad-gait', title: 'Quadrupède : jambe 3 DDL et allure statique', description: 'IK de la patte, séquence d\'allure rampante (une patte levée) et marge de stabilité par phase.',
  params: [
    { key: 'l1', label: 'Cuisse l1', unit: 'm', demo: 0.2, required: true }, { key: 'l2', label: 'Tibia l2', unit: 'm', demo: 0.2, required: true }, { key: 'd', label: 'Déport latéral hanche', unit: 'm', demo: 0.05, required: true },
    { key: 'h', label: 'Hauteur du corps', unit: 'm', demo: 0.3, required: true }, { key: 'L', label: 'Empattement', unit: 'm', demo: 0.5, required: true }, { key: 'W', label: 'Voie', unit: 'm', demo: 0.3, required: true },
    { key: 'stride', label: 'Longueur de foulée', unit: 'm', demo: 0.12, required: true }, { key: 'shift', label: 'Déplacement du CdM vers le trépied (0-1)', unit: '', demo: 0.8, required: true },
  ],
  assumptions: ['Allure statique quasi-statique (vitesse nulle), CdM au centre géométrique du corps hors déplacement volontaire.', 'Pieds ponctuels sans glissement, sol plan.', 'Ordre des pattes : AG, ArD, AD, ArG.'],
  run(v) {
    const r = R(); const reach = (dx: number) => legIK(v.l1!, v.l2!, v.d!, [dx, v.d!, -v.h!]);
    for (const dx of [-v.stride! / 2, 0, v.stride! / 2]) { const s = reach(dx); if (!s) { r.ok = false; r.issues.push(I('critique', 'calculé', `Pied hors de portée à Δx = ${dx.toFixed(3)} m.`)); } else { const f = legFK(v.l1!, v.l2!, v.d!, ...s); r.results.push({ label: `IK patte Δx=${dx.toFixed(2)} (abd, hanche, genou)`, value: s.map((a) => deg(a).toFixed(1) + '°').join(', '), nature: 'calculé' }, { label: `Vérif. FK Δx=${dx.toFixed(2)}`, value: f.map((x) => x.toFixed(3)).join(', '), unit: 'm', nature: 'calculé' }); } }
    const ph = crawlGait(v.L!, v.W!, v.stride!, v.shift!, [0, 3, 1, 2]); const names = ['AG', 'AD', 'ArG', 'ArD'];
    ph.forEach((p) => { r.results.push({ label: `Phase ${p.phase} (${names[p.swing!]} levée) : marge`, value: (p.margin * 1000).toFixed(1), unit: 'mm', nature: 'calculé' }); if (p.margin < 0) { r.ok = false; r.issues.push(I('critique', 'calculé', `Phase ${p.phase} : CdM hors du trépied d'appui.`)); } });
    r.issues.push(I('info', 'à valider', 'Allures dynamiques (trot, galop) non simulées.'));
    return r;
  },
};
export const bipedZmpModule: SimModule = {
  id: 'biped-zmp', title: 'Bipède : ZMP latéral (pendule inverse linéaire)', description: 'Balancement latéral sinusoïdal du CdM, ZMP par LIPM et marge vis-à-vis du pied d\'appui.',
  params: [
    { key: 'zc', label: 'Hauteur du CdM', unit: 'm', demo: 0.8, required: true }, { key: 'A', label: 'Amplitude de balancement', unit: 'm', demo: 0.06, required: true }, { key: 'Ts', label: 'Durée d\'un pas', unit: 's', demo: 0.6, required: true },
    { key: 'stance', label: 'Écart entre pieds', unit: 'm', demo: 0.2, required: true }, { key: 'footW', label: 'Largeur du pied', unit: 'm', demo: 0.1, required: true }, { key: 'footL', label: 'Longueur du pied', unit: 'm', demo: 0.22, required: true },
    { key: 'l1', label: 'Cuisse (IK jambe)', unit: 'm', demo: 0.4, required: true }, { key: 'l2', label: 'Tibia (IK jambe)', unit: 'm', demo: 0.4, required: true },
  ],
  assumptions: ['ESTIMATION : modèle de pendule inverse linéaire (masse ponctuelle à hauteur constante, pas de moment cinétique).', 'Balancement latéral sinusoïdal imposé ; double appui non modélisé (instants proches du changement d\'appui exclus).', 'Direction avant non analysée.'],
  run(v) {
    const r = R(); const z = bipedSwayZMP({ A: v.A!, Ts: v.Ts!, zc: v.zc!, stance: v.stance!, footW: v.footW!, footL: v.footL!, steps: 4 });
    const amp = v.A! * (1 + (v.zc! / GQ) * (Math.PI / v.Ts!) ** 2);
    r.results.push({ label: 'Amplitude du ZMP latéral', value: (amp * 1000).toFixed(1), unit: 'mm', nature: 'estimé' }, { label: 'Marge minimale ZMP / pied d\'appui', value: (z.minMargin * 1000).toFixed(1), unit: 'mm', nature: 'estimé' });
    const best = v.stance! / 2 / (1 + (v.zc! / GQ) * (Math.PI / v.Ts!) ** 2); r.results.push({ label: 'Amplitude plaçant le ZMP au centre du pied', value: (best * 1000).toFixed(1), unit: 'mm', nature: 'estimé' });
    if (z.minMargin < 0) { r.ok = false; r.issues.push(I('critique', 'estimé', 'Le ZMP sort du pied d\'appui : marche instable selon le modèle LIPM.')); }
    const ik = legIK(v.l1!, v.l2!, 0, [0, 0, -(v.zc! - 0.1)]); r.results.push({ label: 'IK jambe (hanche, genou) à hauteur CdM − 0,1 m', value: ik ? `${deg(ik[1]).toFixed(1)}°, ${deg(ik[2]).toFixed(1)}°` : 'hors portée', nature: 'calculé' });
    r.series = [{ label: 'ZMP latéral (m) — estimation LIPM', x: z.t, y: z.zmp, xLabel: 't (s)', yLabel: 'm' }];
    r.issues.push(I('info', 'à valider', 'Validation sur simulateur multicorps (contrôle complet de la marche) nécessaire.'));
    return r;
  },
};
export const quadrotorModule: SimModule = {
  id: 'quadrotor', title: 'Quadrirotor 3D : dynamique corps rigide et PID', description: 'Décollage, stationnaire et points de passage avec PID en cascade ; détection de saturation des moteurs.',
  params: [
    { key: 'mass', label: 'Masse', unit: 'kg', demo: 1.2, required: true }, { key: 'L', label: 'Longueur de bras (centre-rotor)', unit: 'm', demo: 0.2, required: true },
    { key: 'c', label: 'Coefficient k_m/k_f', unit: 'm', demo: null, required: true, help: 'Rapport couple de traînée / poussée de l\'hélice : à mesurer au banc.' },
    { key: 'Ixx', label: 'Inertie Ixx', unit: 'kg·m²', demo: null, required: true }, { key: 'Iyy', label: 'Inertie Iyy', unit: 'kg·m²', demo: null, required: true }, { key: 'Izz', label: 'Inertie Izz', unit: 'kg·m²', demo: null, required: true },
    { key: 'Tmax', label: 'Poussée max par rotor', unit: 'N', demo: 6, required: true }, { key: 'wx', label: 'Point de passage X', unit: 'm', demo: 2, required: true }, { key: 'wz', label: 'Altitude cible', unit: 'm', demo: 3, required: true },
    { key: 'cdA', label: 'Cd·A (traînée)', unit: 'm²', demo: null, required: false },
  ],
  assumptions: ['Corps rigide 6 DDL, poussée instantanée (pas de dynamique moteur), configuration « + ».', 'Aucune aérodynamique (effet de sol, flux induit, flapping) ; traînée quadratique uniquement si Cd·A fourni.', 'PID à gains fixes de démonstration ; sol plan.'],
  run(v) {
    const r = R(); const q = { mass: v.mass!, L: v.L!, c: v.c!, Ixx: v.Ixx!, Iyy: v.Iyy!, Izz: v.Izz!, Tmax: v.Tmax!, cdA: v.cdA };
    const hover = (v.mass! * GQ) / 4; r.results.push({ label: 'Poussée de stationnaire par rotor', value: hover.toFixed(2), unit: 'N', nature: 'calculé' }, { label: 'Commande de stationnaire', value: ((100 * hover) / v.Tmax!).toFixed(0), unit: '%', nature: 'calculé' });
    if (hover > v.Tmax!) { r.ok = false; r.issues.push(I('critique', 'calculé', 'Poussée max insuffisante pour le stationnaire.')); }
    const sim = simulateQuad(q, [{ p: [0, 0, v.wz!], t: 0 }, { p: [v.wx!, 0, v.wz!], t: 5 }], 12);
    const f = sim.final.p; r.results.push({ label: 'Position finale (x, y, z)', value: f.map((x) => x.toFixed(2)).join(', '), unit: 'm', nature: 'estimé' }, { label: 'Inclinaison max', value: Math.max(...sim.log.tilt).toFixed(1), unit: '°', nature: 'estimé' }, { label: 'Pas avec moteur saturé', value: (sim.saturationRatio * 100).toFixed(1), unit: '%', nature: 'calculé' });
    if (sim.saturationRatio > 0) r.issues.push(I(sim.saturationRatio > 0.05 ? 'critique' : 'avertissement', 'calculé', `Saturation des moteurs pendant ${(sim.saturationRatio * 100).toFixed(1)} % des pas (0 ou Tmax atteint).`));
    if (Math.hypot(f[0] - v.wx!, f[2] - v.wz!) > 0.1) r.issues.push(I('critique', 'estimé', 'Point de passage non atteint à 0,1 m près en fin de simulation.'));
    r.series = [{ label: 'Altitude z (m)', x: sim.log.t, y: sim.log.z, xLabel: 't (s)', yLabel: 'm' }]; void mix;
    return r;
  },
};
ALL_MODULES['quad-gait'] = quadGaitModule; ALL_MODULES['biped-zmp'] = bipedZmpModule; ALL_MODULES.quadrotor = quadrotorModule;
import { depthHold, netBuoyancyN, rightingMoment, allocate, type UWParams } from './underwater';
import { makeGrid, fillRect, inflate, astar, toWorld, purePursuit, pathLengthCells, type Grid, type Cell } from './planning';
export const rovModule: SimModule = {
  id: 'rov-dyn', title: 'ROV/AUV : dynamique plane, redressement, propulseurs et maintien de profondeur', description: 'Plan vertical (cavalement, pilonnement, tangage), flottabilité au centre de carène, traînée quadratique par axe, allocation des 4 propulseurs, PID de profondeur.',
  params: [
    { key: 'mass', label: 'Masse', unit: 'kg', demo: 30, required: true }, { key: 'volume', label: 'Volume déplacé', unit: 'm³', demo: 0.0295, required: true }, { key: 'sea', label: 'Eau de mer (1) / douce (0)', unit: '', demo: 1, required: true },
    { key: 'BG', label: 'Distance centre de carène – CdM (B au-dessus)', unit: 'm', demo: 0.05, required: true }, { key: 'Iyy', label: 'Inertie en tangage Iyy', unit: 'kg·m²', demo: null, required: true },
    { key: 'cdAx', label: 'Cd·A axe x (avant)', unit: 'm²', demo: null, required: true, help: 'Obligatoire : traînée dépend de la forme (essais/CFD).' }, { key: 'cdAz', label: 'Cd·A axe z (vertical)', unit: 'm²', demo: null, required: true },
    { key: 'kq', label: 'Coefficient de traînée en tangage', unit: 'N·m·s²', demo: null, required: true }, { key: 'tmax', label: 'Poussée max par propulseur', unit: 'N', demo: 40, required: true },
    { key: 'depth', label: 'Profondeur cible', unit: 'm', demo: 5, required: true }, { key: 'surge', label: 'Poussée de cavalement demandée', unit: 'N', demo: 20, required: true }, { key: 'T', label: 'Durée', unit: 's', demo: 60, required: true },
  ],
  assumptions: ['Dynamique plane (3 DDL) d\'un corps rigide ; masses ajoutées, couplages et courants ignorés.', 'Traînée quadratique découplée par axe avec Cd·A fournis ; traînée en tangage k·|q|·q.', '4 propulseurs de démonstration : 2 horizontaux (x = −0,3 m, z = ±0,05 m), 2 verticaux (x = ±0,25 m) ; allocation par pseudo-inverse puis saturation.', 'PID de profondeur à gains fixes, flottabilité nette supposée connue (compensée).'],
  run(v) {
    const r = R(); const rho = v.sea ? 1025 : 1000; const tm = v.tmax!;
    const p: UWParams = { mass: v.mass!, volume: v.volume!, rho, BG: v.BG!, Iyy: v.Iyy!, cdAx: v.cdAx!, cdAz: v.cdAz!, kq: v.kq!, thrusters: [{ x: -0.3, z: 0.05, angle: 0, tmax: tm }, { x: -0.3, z: -0.05, angle: 0, tmax: tm }, { x: 0.25, z: 0, angle: Math.PI / 2, tmax: tm }, { x: -0.25, z: 0, angle: Math.PI / 2, tmax: tm }] };
    const nb = netBuoyancyN(p); r.results.push({ label: 'Flottabilité nette', value: nb.toFixed(2), unit: 'N', nature: 'calculé' }, { label: 'Moment de redressement à 10°', value: Math.abs(rightingMoment(p, Math.PI / 18)).toFixed(2), unit: 'N·m', nature: 'calculé' });
    if (v.BG! <= 0) r.issues.push(I('critique', 'calculé', 'Centre de carène au niveau ou sous le CdM : pas de stabilité statique en tangage.'));
    const hold = allocate(p.thrusters, [0, -nb, 0]); if (hold.saturated) { r.ok = false; r.issues.push(I('critique', 'calculé', 'Propulseurs verticaux insuffisants pour compenser la flottabilité nette.')); }
    r.results.push({ label: 'Vitesse limite en cavalement (2 propulseurs à fond)', value: Math.sqrt((2 * 2 * tm) / (rho * v.cdAx!)).toFixed(2), unit: 'm/s', nature: 'estimé' });
    const sim = depthHold(p, { zTarget: -v.depth!, surge: v.surge!, T: v.T! }); const f = sim.final;
    r.results.push({ label: 'Profondeur finale', value: (-f.z).toFixed(2), unit: 'm', nature: 'estimé' }, { label: 'Distance parcourue', value: f.x.toFixed(1), unit: 'm', nature: 'estimé' }, { label: 'Assiette finale', value: deg(f.th).toFixed(1), unit: '°', nature: 'estimé' }, { label: 'Pas avec propulseur saturé', value: (sim.saturationRatio * 100).toFixed(1), unit: '%', nature: 'calculé' });
    if (Math.abs(-f.z - v.depth!) > 0.2) r.issues.push(I('critique', 'estimé', 'Profondeur cible non tenue à 0,2 m près en fin de simulation.'));
    if (sim.saturationRatio > 0) r.issues.push(I('avertissement', 'calculé', `Saturation des propulseurs pendant ${(sim.saturationRatio * 100).toFixed(1)} % des pas.`));
    r.series = [{ label: 'Profondeur (m)', x: sim.log.t, y: sim.log.z.map((z) => -z), xLabel: 't (s)', yLabel: 'm' }];
    r.issues.push(I('info', 'à valider', 'Masses ajoutées et hydrodynamique 6 DDL non modélisées : validation en bassin nécessaire.'));
    return r;
  },
};
/** Carte d'entrepôt de démonstration 10 m × 6 m (résolution 0,1 m) : rayonnages. */
export function demoWarehouse(): Grid { const g = makeGrid(100, 60, 0.1); fillRect(g, 20, 0, 23, 40); fillRect(g, 45, 20, 48, 59); fillRect(g, 70, 0, 73, 40); fillRect(g, 55, 8, 62, 12); return g; }
export function planAndFollow(g: Grid, start: Cell, goal: Cell, o: { robotR: number; vmax: number; amax: number; mu: number | null; track: number; lookahead: number; margin?: number }) {
  const inf = inflate(g, o.robotR + (o.margin ?? 0)); const path = astar(inf, start, goal); if (!path) return { path: null as Cell[] | null, inflated: inf };
  const pw = path.filter((_, i) => i % 3 === 0 || i === path.length - 1).map((c) => toWorld(g, c));
  return { path, inflated: inf, follow: purePursuit(g, pw, { ...o }), lengthM: pathLengthCells(path) * g.res };
}
export const navModule: SimModule = {
  id: 'nav-grid', title: 'Robot à roues : planification A* et suivi (pure pursuit)', description: 'Carte d\'entrepôt de démonstration (éditable dans le planificateur), A* avec empreinte gonflée, suivi différentiel avec limites.',
  params: [
    { key: 'robotR', label: 'Rayon d\'empreinte', unit: 'm', demo: 0.3, required: true }, { key: 'vmax', label: 'Vitesse max', unit: 'm/s', demo: 1.2, required: true }, { key: 'amax', label: 'Accélération max', unit: 'm/s²', demo: 1.0, required: true },
    { key: 'mu', label: 'Adhérence μ', unit: '', demo: null, required: false }, { key: 'track', label: 'Voie', unit: 'm', demo: 0.45, required: true }, { key: 'lookahead', label: 'Distance d\'anticipation', unit: 'm', demo: 0.5, required: true }, { key: 'margin', label: 'Marge de planification (en plus de l\'empreinte)', unit: 'm', demo: 0.15, required: true },
    { key: 'sx', label: 'Départ X', unit: 'm', demo: 0.5, required: false }, { key: 'sy', label: 'Départ Y', unit: 'm', demo: 0.5, required: false }, { key: 'gx', label: 'Arrivée X', unit: 'm', demo: 9.5, required: false }, { key: 'gy', label: 'Arrivée Y', unit: 'm', demo: 5.5, required: false },
  ],
  assumptions: ['Carte de démonstration 10 × 6 m, résolution 0,1 m ; départ/arrivée par défaut (0,5 ; 0,5) → (9,5 ; 5,5).', 'A* 8-connexe sans coupe de coin sur carte gonflée du rayon d\'empreinte + marge (robot = disque) ; la marge absorbe la coupe des virages par la poursuite pure.', 'Suivi cinématique (pas de dynamique de roue), sol plan ; vérification de collision avec la carte NON gonflée.'],
  run(v) {
    const r = R(); const c = (x: number | null, d: number) => Math.min(99, Math.max(0, Math.floor((x ?? d) / 0.1))); const cy = (y: number | null, d: number) => Math.min(59, Math.max(0, Math.floor((y ?? d) / 0.1)));
    const res = planAndFollow(demoWarehouse(), [c(v.sx, 0.5), cy(v.sy, 0.5)], [c(v.gx, 9.5), cy(v.gy, 5.5)], { robotR: v.robotR!, vmax: v.vmax!, amax: v.amax!, mu: v.mu, track: v.track!, lookahead: v.lookahead!, margin: v.margin! });
    if (!res.path) { r.ok = false; r.issues.push(I('critique', 'calculé', 'Aucun chemin : passages trop étroits pour l\'empreinte.')); return r; }
    const f = res.follow!; r.results.push({ label: 'Longueur du chemin A*', value: res.lengthM!.toFixed(2), unit: 'm', nature: 'calculé' }, { label: 'Durée de suivi', value: f.time.toFixed(1), unit: 's', nature: 'estimé' }, { label: 'Dégagement minimal (bord du robot)', value: (f.minClearance * 100).toFixed(1), unit: 'cm', nature: 'calculé' }, { label: 'Accélération max appliquée', value: f.maxAccel.toFixed(2), unit: 'm/s²', nature: 'calculé' });
    if (!f.reached) { r.ok = false; r.issues.push(I('critique', 'estimé', 'Objectif non atteint par le suivi.')); }
    if (f.collided) { r.ok = false; r.issues.push(I('critique', 'calculé', 'Collision de l\'empreinte pendant le suivi (le suivi coupe les virages).')); }
    if (v.mu == null) r.issues.push(I('info', 'à valider', 'μ non renseigné : limite d\'adhérence non appliquée.'));
    r.series = [{ label: 'Vitesse (m/s)', x: f.log.t, y: f.log.v, xLabel: 't (s)', yLabel: 'm/s' }];
    return r;
  },
};
ALL_MODULES['rov-dyn'] = rovModule; ALL_MODULES['nav-grid'] = navModule;
import { runMission, compareN } from './swarmMission';
export const swarmMissionModule: SimModule = {
  id: 'swarm-mission', title: 'Essaim : mission (rendez-vous / couverture) avec obstacles', description: 'Agents ponctuels, évitement mutuel et d\'obstacles, achèvement de mission, comparaison de tailles d\'essaim.',
  params: [
    { key: 'n', label: 'Nombre d\'agents', unit: '', demo: 10, required: true }, { key: 'mission', label: 'Mission (1 = rendez-vous, 2 = couverture)', unit: '', demo: 1, required: true },
    { key: 'size', label: 'Côté de la zone', unit: 'm', demo: 20, required: true }, { key: 'radius', label: 'Rayon d\'un agent', unit: 'm', demo: 0.2, required: true }, { key: 'sep', label: 'Distance de séparation', unit: 'm', demo: 1.0, required: true },
    { key: 'vmax', label: 'Vitesse max', unit: 'm/s', demo: 1.0, required: true }, { key: 'goalR', label: 'Rayon de rendez-vous', unit: 'm', demo: 2.5, required: true }, { key: 'cover', label: 'Couverture visée', unit: '%', demo: 80, required: true }, { key: 'Tmax', label: 'Durée max', unit: 's', demo: 200, required: true },
  ],
  assumptions: ['Agents ponctuels holonomes (disques pour les collisions), vitesse bornée, perception et communication parfaites.', 'Obstacles de démonstration : 2 disques (rayons 2 m et 1,5 m). Rendez-vous au centre de la zone.', 'Couverture : balayage en bandes déterministe, cellules de 1 m.', 'Graine aléatoire fixe : résultats reproductibles mais dépendants de la configuration initiale.'],
  run(v) {
    const r = R(); const base = { size: v.size!, radius: v.radius!, sep: v.sep!, vmax: v.vmax!, mission: (v.mission === 2 ? 'couverture' : 'rendezvous') as 'couverture' | 'rendezvous', goalR: v.goalR!, coverTarget: v.cover! / 100, obstacles: [{ x: v.size! * 0.55, y: v.size! * 0.3, r: 2 }, { x: v.size! * 0.3, y: v.size! * 0.65, r: 1.5 }], Tmax: v.Tmax! };
    const m = runMission({ ...base, n: Math.round(v.n!) });
    r.results.push({ label: 'Mission accomplie', value: m.completed ? 'oui' : 'non', nature: 'calculé' }, { label: 'Durée d\'accomplissement', value: m.time != null ? m.time.toFixed(1) : '—', unit: 's', nature: 'calculé' }, { label: 'Séparation minimale', value: m.minSep.toFixed(3), unit: 'm', nature: 'calculé' }, { label: 'Collisions agent-agent', value: m.agentCollisions, nature: 'calculé' }, { label: 'Collisions agent-obstacle', value: m.obstacleCollisions, nature: 'calculé' }, { label: 'Couverture atteinte', value: (m.coverage * 100).toFixed(0), unit: '%', nature: 'calculé' });
    if (!m.completed) r.issues.push(I('critique', 'calculé', 'Mission non accomplie dans la durée max.'));
    if (m.agentCollisions + m.obstacleCollisions) r.issues.push(I('avertissement', 'calculé', `${m.agentCollisions + m.obstacleCollisions} contact(s) détecté(s).`));
    const cmp = compareN(base, [Math.max(2, Math.round(v.n! / 2)), Math.round(v.n!), Math.round(v.n! * 2)]);
    cmp.forEach((c) => r.results.push({ label: `Comparaison N = ${c.n} : durée / collisions / sép. min`, value: `${c.time != null ? c.time.toFixed(1) + ' s' : 'non accomplie'} / ${c.agentCollisions + c.obstacleCollisions} / ${c.minSep.toFixed(2)} m`, nature: 'calculé' }));
    r.series = [{ label: base.mission === 'rendezvous' ? 'Distance max au point de rendez-vous (m)' : 'Couverture (fraction)', x: m.log.t, y: m.log.metric, xLabel: 't (s)', yLabel: '' }];
    return r;
  },
};
ALL_MODULES['swarm-mission'] = swarmMissionModule;
import { headTiltTorque, armTorque, companionCoM, autonomyH } from './companion';
export const companionModule: SimModule = {
  id: 'companion', title: 'Robot compagnon : servos, basculement, autonomie', description: 'Couples statiques tête (tilt) et bras vs couple de blocage déclaré, CdM vs empreinte du socle, autonomie estimée.',
  params: [
    { key: 'headMass', label: 'Masse de la tête', unit: 'kg', demo: 0.12, required: true }, { key: 'headD', label: 'Distance pivot de tilt → CdM tête', unit: 'm', demo: 0.02, required: true },
    { key: 'tiltMax', label: 'Inclinaison max de la tête', unit: '°', demo: 30, required: true }, { key: 'tiltStall', label: 'Couple de blocage servo de tilt', unit: 'N·m', demo: null, required: true, help: 'Fiche du servo (1 kg·cm ≈ 0,0981 N·m).' },
    { key: 'panStall', label: 'Couple de blocage servo de rotation (pan)', unit: 'N·m', demo: null, required: false },
    { key: 'armMass', label: 'Masse d\'un bras', unit: 'kg', demo: 0.015, required: true }, { key: 'armL', label: 'Longueur d\'un bras', unit: 'm', demo: 0.05, required: true }, { key: 'armStall', label: 'Couple de blocage servo de bras', unit: 'N·m', demo: null, required: true, help: 'Fiche du servo.' },
    { key: 'bodyMass', label: 'Masse corps + socle', unit: 'kg', demo: 0.25, required: true }, { key: 'bodyComH', label: 'Hauteur du CdM du corps', unit: 'm', demo: 0.03, required: true },
    { key: 'headPivotH', label: 'Hauteur du pivot de tête', unit: 'm', demo: 0.07, required: true }, { key: 'baseR', label: 'Demi-largeur d\'appui du socle (avant)', unit: 'm', demo: 0.04, required: true },
    { key: 'batWh', label: 'Capacité batterie', unit: 'Wh', demo: null, required: false }, { key: 'power', label: 'Puissance moyenne consommée', unit: 'W', demo: null, required: false },
  ],
  assumptions: ['Statique uniquement : pas d\'accélération, de frottement ni d\'inertie des servos ; l\'axe de rotation (pan) est vertical → couple gravitaire nul.', 'Pire cas : tête inclinée vers l\'avant au maximum, bras horizontaux tendus vers l\'avant, robot sur bureau horizontal.', 'Couple de blocage ≠ couple continu : au-delà de 50 % du couple de blocage, l\'échauffement et l\'usure sont à vérifier (règle empirique, à valider).', 'Autonomie = capacité / puissance moyenne : ignore rendement, vieillissement et profondeur de décharge.', 'Modèle générique non validé : aucune donnée de produit commercial n\'est utilisée.'],
  run(v) {
    const r = R(); const tH = headTiltTorque(v.headMass!, v.headD!, v.tiltMax!); const tA = armTorque(v.armMass!, v.armL!);
    const chk = (name: string, tau: number, stall: number) => { const k = tau / stall; r.results.push({ label: `${name} : couple statique requis`, value: tau.toFixed(4), unit: 'N·m', nature: 'calculé' }, { label: `${name} : taux d'utilisation du couple de blocage`, value: (k * 100).toFixed(0), unit: '%', nature: 'calculé' });
      if (k > 1) { r.ok = false; r.issues.push(I('critique', 'calculé', `${name} : couple requis ${tau.toFixed(4)} N·m > couple de blocage ${stall} N·m.`)); } else if (k > 0.5) r.issues.push(I('avertissement', 'à valider', `${name} : ${(k * 100).toFixed(0)} % du couple de blocage (> 50 %) — échauffement à vérifier.`)); };
    chk('Tête (tilt)', tH, v.tiltStall!); chk('Bras', tA, v.armStall!);
    r.results.push({ label: 'Tête (pan) : couple gravitaire', value: '0 (axe vertical)', nature: 'calculé' }); if (v.panStall == null) r.issues.push(I('info', 'à valider', 'Couple du servo de pan non renseigné : frottement et inertie non évalués.'));
    const c = companionCoM({ bodyMass: v.bodyMass!, bodyComH: v.bodyComH!, headMass: v.headMass!, headPivotH: v.headPivotH!, headD: v.headD!, tiltDeg: v.tiltMax!, armMass: v.armMass!, armL: v.armL!, baseR: v.baseR! });
    r.results.push({ label: 'Masse totale', value: c.M.toFixed(3), unit: 'kg', nature: 'calculé' }, { label: 'CdM : avance horizontale / hauteur', value: `${(c.x * 1000).toFixed(1)} / ${(c.z * 1000).toFixed(1)}`, unit: 'mm', nature: 'calculé' }, { label: 'Marge de basculement (avant)', value: (c.margin * 1000).toFixed(1), unit: 'mm', nature: 'calculé' }, { label: 'Inclinaison du bureau tolérée avant basculement', value: c.tipAngleDeg.toFixed(1), unit: '°', nature: 'estimé' });
    if (c.margin <= 0) { r.ok = false; r.issues.push(I('critique', 'calculé', 'Le CdM sort de l\'empreinte du socle en pire cas : le robot bascule.')); } else if (c.margin < 0.2 * v.baseR!) r.issues.push(I('avertissement', 'calculé', 'Marge de basculement < 20 % de la demi-largeur d\'appui.'));
    if (v.batWh != null && v.power != null) r.results.push({ label: 'Autonomie', value: autonomyH(v.batWh, v.power).toFixed(2), unit: 'h', nature: 'estimé' });
    else r.issues.push(I('info', 'à valider', 'Autonomie non estimée : capacité batterie et/ou puissance moyenne non renseignées.'));
    r.issues.push(I('info', 'à valider', 'Personnalité, expressions et interaction IA : à développer (non simulées).'));
    return r;
  },
};
ALL_MODULES.companion = companionModule;
