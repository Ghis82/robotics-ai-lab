import type { Vec3 } from './math';
/** Origine d'une valeur : jamais d'invention silencieuse. */
export type Provenance = 'démo' | 'utilisateur' | 'URDF' | 'manquant' | 'proposé';
export interface Motor { model: string; maxTorque: number /* N·m */; maxSpeed?: number /* rad/s */ }
export interface JointSpec {
  name: string; type: 'revolute';
  axis: Vec3;              // axe dans le repère local
  min: number; max: number; // rad
  motor: Motor | null;      // null = non déclaré
}
export interface LinkSpec {
  name: string;
  length: number;   // m (le long de +Z local)
  mass: number | null; // kg, null = inconnu
  radius: number;   // m, rayon de la capsule de collision
  material: string | null; // null = non renseigné
  dir?: Vec3;       // direction du segment dans le repère de l'articulation (défaut +Z)
}
export interface RobotModel {
  name: string;
  baseHeight: number;               // m (socle fixe)
  baseMass: number | null;          // kg
  baseFootprintRadius: number | null; // m, rayon du polygone d'appui (approx. disque)
  joints: JointSpec[];              // joint i entraîne link i
  links: LinkSpec[];
  payload: { mass: number; label: string };
  obstacles: { name: string; center: Vec3; radius: number }[];
  provenance: Record<string, Provenance>;
  /** Seuils déclarés par l'utilisateur pour un cobot (aucune valeur normative implicite). */
  cobotLimits?: { tcpSpeed: number | null; contactForce: number | null };
  kind?: 'arm' | 'scara' | 'cobot';
}
const r = (d: number) => (d * Math.PI) / 180;
/** Bras 5 axes de démonstration. TOUTES les valeurs sont des valeurs de démonstration. */
export function demoArm(): RobotModel {
  const m = (name: string, maxTorque: number) => ({ model: name, maxTorque, maxSpeed: r(120) });
  const model: RobotModel = {
    name: 'Bras de démonstration 5 axes',
    baseHeight: 0.12, baseMass: 4.0, baseFootprintRadius: 0.12,
    joints: [
      { name: 'Axe 1 (base, lacet)', type: 'revolute', axis: [0, 0, 1], min: r(-180), max: r(180), motor: m('Servo démo A', 20) },
      { name: 'Axe 2 (épaule)', type: 'revolute', axis: [0, 1, 0], min: r(-90), max: r(90), motor: m('Servo démo B', 25) },
      { name: 'Axe 3 (coude)', type: 'revolute', axis: [0, 1, 0], min: r(-135), max: r(135), motor: m('Servo démo B', 12) },
      { name: 'Axe 4 (poignet, tangage)', type: 'revolute', axis: [0, 1, 0], min: r(-110), max: r(110), motor: m('Servo démo C', 4) },
      { name: 'Axe 5 (poignet, roulis)', type: 'revolute', axis: [0, 0, 1], min: r(-170), max: r(170), motor: null },
    ],
    links: [
      { name: 'Colonne', length: 0.10, mass: 1.2, radius: 0.06, material: null },
      { name: 'Bras', length: 0.30, mass: 1.5, radius: 0.045, material: null },
      { name: 'Avant-bras', length: 0.25, mass: 0.9, radius: 0.04, material: null },
      { name: 'Poignet', length: 0.08, mass: 0.3, radius: 0.035, material: null },
      { name: 'Effecteur (pince)', length: 0.10, mass: 0.4, radius: 0.03, material: null },
    ],
    payload: { mass: 0.5, label: 'Charge' },
    obstacles: [{ name: 'Obstacle (sphère)', center: [0.35, 0.25, 0.15], radius: 0.08 }],
    provenance: {},
  };
  model.provenance = Object.fromEntries(provenanceKeys(model).map((k) => [k, 'démo' as Provenance]));
  for (const k of provenanceKeys(model)) if (getPath(model, k) == null) model.provenance[k] = 'manquant';
  return model;
}
export function provenanceKeys(m: RobotModel): string[] {
  const k = ['baseHeight', 'baseMass', 'baseFootprintRadius', 'payload.mass'];
  m.links.forEach((_, i) => k.push(`links.${i}.length`, `links.${i}.mass`, `links.${i}.radius`, `links.${i}.material`));
  m.joints.forEach((_, i) => k.push(`joints.${i}.min`, `joints.${i}.max`, `joints.${i}.motor`));
  return k;
}
export function getPath(o: any, path: string): any { return path.split('.').reduce((a, p) => (a == null ? a : a[p]), o); }
export function setPath(o: any, path: string, v: any) {
  const ps = path.split('.'); let a = o; for (let i = 0; i < ps.length - 1; i++) a = a[ps[i]]; a[ps[ps.length - 1]] = v;
}
export function setUserValue(m: RobotModel, path: string, v: any) {
  setPath(m, path, v); m.provenance[path] = v == null || v === '' ? 'manquant' : 'utilisateur';
}
export interface MissingItem { path: string; label: string; impact: string }
/** Liste explicite des données manquantes. */
export function missingData(m: RobotModel): MissingItem[] {
  const out: MissingItem[] = [];
  m.links.forEach((l, i) => {
    if (l.mass == null) out.push({ path: `links.${i}.mass`, label: `Masse de « ${l.name} »`, impact: 'Couples gravitaires et centre de masse incalculables.' });
    if (!l.material) out.push({ path: `links.${i}.material`, label: `Matériau de « ${l.name} »`, impact: 'Aucune vérification de résistance/flexion possible.' });
  });
  m.joints.forEach((j, i) => { if (!j.motor) out.push({ path: `joints.${i}.motor`, label: `Moteur de « ${j.name} »`, impact: 'Couple requis non comparable à un couple disponible.' }); });
  if (m.baseMass == null) out.push({ path: 'baseMass', label: 'Masse du socle', impact: 'Test de basculement incomplet.' });
  if (m.baseFootprintRadius == null) out.push({ path: 'baseFootprintRadius', label: 'Empreinte du socle', impact: 'Test de basculement impossible.' });
  out.push({ path: 'inertia', label: 'Tenseurs d\'inertie des segments', impact: 'Couples dynamiques estimés en masses ponctuelles uniquement.' });
  out.push({ path: 'friction', label: 'Frottements / rendement des réducteurs', impact: 'Couples réels sous-estimés.' });
  out.push({ path: 'stiffness', label: 'Rigidité des segments et des transmissions', impact: 'Déformations et vibrations non évaluées.' });
  return out;
}

const finish = (model: RobotModel) => { model.provenance = Object.fromEntries(provenanceKeys(model).map((k) => [k, (getPath(model, k) == null ? 'manquant' : 'démo') as Provenance])); return model; };
/** SCARA de démonstration (2 rotoïdes plans + rotation outil ; l'axe Z prismatique n'est PAS modélisé dans ce pipeline). */
export function demoScara(): RobotModel {
  const mt = (n: string, t: number) => ({ model: n, maxTorque: t, maxSpeed: r(300) });
  return finish({ name: 'SCARA de démonstration (3 axes rotoïdes)', kind: 'scara', baseHeight: 0.4, baseMass: 8, baseFootprintRadius: 0.15,
    joints: [{ name: 'Axe 1 (épaule)', type: 'revolute', axis: [0, 0, 1], min: r(-130), max: r(130), motor: mt('Servo démo S1', 15) }, { name: 'Axe 2 (coude)', type: 'revolute', axis: [0, 0, 1], min: r(-145), max: r(145), motor: mt('Servo démo S2', 6) }, { name: 'Axe 3 (rotation outil)', type: 'revolute', axis: [0, 0, 1], min: r(-360), max: r(360), motor: mt('Servo démo S3', 1) }],
    links: [{ name: 'Bras 1', length: 0.25, mass: 2.0, radius: 0.04, material: null, dir: [1, 0, 0] }, { name: 'Bras 2', length: 0.2, mass: 1.2, radius: 0.035, material: null, dir: [1, 0, 0] }, { name: 'Tige outil', length: 0.15, mass: 0.3, radius: 0.015, material: null, dir: [0, 0, -1] }],
    payload: { mass: 0.5, label: 'Charge' }, obstacles: [{ name: 'Obstacle (sphère)', center: [0.3, 0.25, 0.3], radius: 0.06 }], provenance: {} });
}
/** Cobot 6 axes de démonstration (géométrie simplifiée, segments colinéaires au repère local). */
export function demoCobot(): RobotModel {
  const mt = (n: string, t: number) => ({ model: n, maxTorque: t, maxSpeed: r(180) });
  return finish({ name: 'Cobot de démonstration 6 axes', kind: 'cobot', baseHeight: 0.1, baseMass: 6, baseFootprintRadius: 0.12,
    joints: [{ name: 'Axe 1 (base)', type: 'revolute', axis: [0, 0, 1], min: r(-360), max: r(360), motor: mt('Démo C1', 28) }, { name: 'Axe 2 (épaule)', type: 'revolute', axis: [0, 1, 0], min: r(-180), max: r(180), motor: mt('Démo C2', 28) },
      { name: 'Axe 3 (coude)', type: 'revolute', axis: [0, 1, 0], min: r(-160), max: r(160), motor: mt('Démo C3', 28) }, { name: 'Axe 4 (poignet 1)', type: 'revolute', axis: [0, 1, 0], min: r(-180), max: r(180), motor: mt('Démo C4', 9) },
      { name: 'Axe 5 (poignet 2)', type: 'revolute', axis: [0, 0, 1], min: r(-180), max: r(180), motor: mt('Démo C5', 9) }, { name: 'Axe 6 (poignet 3)', type: 'revolute', axis: [0, 1, 0], min: r(-180), max: r(180), motor: mt('Démo C6', 9) }],
    links: [{ name: 'Base tournante', length: 0.09, mass: 1.5, radius: 0.05, material: null }, { name: 'Bras', length: 0.42, mass: 3.4, radius: 0.045, material: null }, { name: 'Avant-bras', length: 0.39, mass: 1.4, radius: 0.035, material: null },
      { name: 'Poignet 1', length: 0.1, mass: 0.6, radius: 0.03, material: null }, { name: 'Poignet 2', length: 0.1, mass: 0.6, radius: 0.03, material: null }, { name: 'Bride outil', length: 0.08, mass: 0.3, radius: 0.03, material: null }],
    payload: { mass: 1.0, label: 'Charge' }, obstacles: [{ name: 'Obstacle (sphère)', center: [0.45, 0.2, 0.3], radius: 0.07 }], provenance: {}, cobotLimits: { tcpSpeed: null, contactForce: null } });
}
