// Registre data-driven des familles et types de robots. Ajouter un type = ajouter une entrée ici.
export type Status = 'Disponible' | 'Expérimental' | 'À développer';
export interface Capabilities { visualisation: Status; configuration: Status; cinematique: Status; physique: Status }
export interface Family { id: string; name: string; icon: string; description: string }
export interface RobotType {
  id: string; family: string; name: string; description: string; keywords: string[];
  components: string[]; joints: string; params: string[]; importFormats: string[];
  modules: string[];          // ids de modules SimModule réellement implémentés et testés
  armWorkspace?: boolean;      // ouvre l'atelier bras complet (prototype v0.1)
  armModel?: 'arm' | 'scara' | 'cobot'; // modèle chargé dans l'atelier bras
  capabilities: Capabilities; notImplemented: string[]; shape: string;
}
export const FAMILIES: Family[] = [
  { id: 'industrial', name: 'Robots industriels', icon: '🦾', description: 'Bras, SCARA, Delta, portiques, cobots.' },
  { id: 'humanoid', name: 'Humanoïdes et biomécanique', icon: '🧍', description: 'Bipèdes, torses, exosquelettes, mains.' },
  { id: 'mobile', name: 'Robots mobiles terrestres', icon: '🚙', description: 'Roues, chenilles, quadrupèdes, rovers.' },
  { id: 'aerial', name: 'Robots aériens', icon: '🚁', description: 'Multirotors, voilure fixe, hybrides.' },
  { id: 'aquatic', name: 'Robots aquatiques', icon: '🌊', description: 'ROV, AUV, nageurs, engins de surface.' },
  { id: 'special', name: 'Robots spécialisés', icon: '🧪', description: 'Médical, souple, modulaire, essaim…' },
];
const A = 'Disponible', E = 'Expérimental', D = 'À développer';
const cap = (v: Status, c: Status, k: Status, p: Status): Capabilities => ({ visualisation: v, configuration: c, cinematique: k, physique: p });
const STD = ['URDF', 'GLB/glTF', 'STL', 'OBJ'];
const t = (id: string, family: string, name: string, description: string, o: Partial<RobotType> = {}): RobotType => ({
  id, family, name, description, keywords: [], components: [], joints: '—', params: [], importFormats: STD, modules: [],
  capabilities: cap(A, D, D, D), notImplemented: ['Simulation dédiée à développer'], shape: 'box', ...o,
});
export const ROBOT_TYPES: RobotType[] = [
  t('arm', 'industrial', 'Bras articulé', 'Bras série 5 axes rotoïdes : cinématique, collisions, couples, basculement.', { keywords: ['bras', 'articulé', 'manipulateur', 'déplace', 'objet', 'soulever'], components: ['Socle', 'Colonne', 'Bras', 'Avant-bras', 'Poignet', 'Effecteur'], joints: '5 rotoïdes', params: ['Longueurs', 'Masses', 'Butées', 'Moteurs', 'Charge'], modules: ['gripper'], armWorkspace: true, capabilities: cap(A, A, A, E), notImplemented: ['Dynamique complète', 'IK', 'FEA'], shape: 'arm' }),
  t('scara', 'industrial', 'SCARA', 'Bras plan 2R + axe vertical.', { keywords: ['scara', 'pick and place', 'assemblage plan'], components: ['Socle', 'Bras 1', 'Bras 2', 'Axe Z'], joints: '2 rotoïdes + 1 prismatique', params: ['L1', 'L2', 'Cible', 'Masses', 'Moteurs'], modules: ['scara', 'gripper'], armWorkspace: true, armModel: 'scara', capabilities: cap(A, A, A, E), notImplemented: ['Axe Z prismatique dans le pipeline dynamique'], shape: 'scara' }),
  t('delta', 'industrial', 'Delta', 'Robot parallèle à 3 bras.', { keywords: ['delta', 'parallèle'], components: ['Plateau fixe', '3 bras', 'Parallélogrammes', 'Nacelle'], joints: '3 rotoïdes actionnés + rotules', shape: 'delta', params: ['f, e, rf, re', 'Cible', 'Butées'], modules: ['delta'], capabilities: cap(A, A, A, D), notImplemented: ['Dynamique', 'Rigidité'] }),
  t('gantry', 'industrial', 'Cartésien / portique', 'Axes linéaires X-Y-Z.', { keywords: ['portique', 'cartésien', 'gantry'], components: ['Poutres', 'Chariots', 'Axe Z'], joints: '3 prismatiques', params: ['Courses', 'Vitesses', 'Accélérations'], modules: ['gantry'], capabilities: cap(A, A, A, D), shape: 'gantry', notImplemented: ['Flexion des poutres', 'Dynamique'] }),
  t('cobot', 'industrial', 'Cobot', 'Bras collaboratif.', { keywords: ['cobot', 'collaboratif'], components: ['Bras 6 axes', 'Capteurs d\'effort'], joints: '6 rotoïdes', modules: ['gripper'], armWorkspace: true, armModel: 'cobot', capabilities: cap(A, A, A, E), notImplemented: ['Évaluation de conformité ISO 10218 / ISO/TS 15066 (hors périmètre : seuls des seuils déclarés sont comparés)', 'Capteurs d\'effort réels'], shape: 'arm' }),
  t('welding', 'industrial', 'Soudage / assemblage', 'Bras équipé d\'un outil de procédé.', { keywords: ['soudage', 'soudure', 'assemblage'], joints: '6 rotoïdes', shape: 'arm', notImplemented: ['Procédé de soudage', 'Trajectoires outil'] }),
  t('biped', 'humanoid', 'Humanoïde bipède', 'Robot marchant sur deux jambes.', { keywords: ['humanoïde', 'bipède', 'marche'], components: ['Torse', 'Jambes', 'Pieds', 'Bras'], joints: '≈ 20-30 rotoïdes', params: ['Pieds', 'Écart', 'CdM'], modules: ['balance-biped', 'biped-zmp'], capabilities: cap(A, E, E, E), notImplemented: ['Contrôle complet de la marche, simulation multicorps', 'Cinématique corps entier'], shape: 'humanoid' }),
  t('torso', 'humanoid', 'Torse avec bras', 'Humanoïde fixe à deux bras.', { keywords: ['torse'], shape: 'humanoid', modules: ['gripper'] }),
  t('exo', 'humanoid', 'Exosquelette', 'Structure portée par l\'humain.', { keywords: ['exosquelette'], shape: 'humanoid', notImplemented: ['Modèle biomécanique humain', 'Interaction humain-robot'] }),
  t('hand', 'humanoid', 'Main / doigts robotiques', 'Préhenseur multi-doigts.', { keywords: ['main', 'doigts', 'préhension'], modules: ['gripper'], capabilities: cap(A, E, D, E), shape: 'hand' }),
  t('biomimetic', 'humanoid', 'Robot biomimétique', 'Inspiré du vivant.', { keywords: ['biomimétique'], shape: 'humanoid' }),
  t('wheeled', 'mobile', 'Robot à roues (différentiel)', 'Base mobile à deux roues motrices.', { keywords: ['roues', 'entrepôt', 'agv', 'amr', 'logistique', 'inspecter', 'inspection'], components: ['Châssis', '2 roues motrices', 'Roues folles', 'Capteurs'], joints: '2 roues', params: ['Masse', 'Voie', 'Rayon roue', 'μ', 'Vitesses'], modules: ['mobile-diff', 'nav-grid'], capabilities: cap(A, A, A, E), notImplemented: ['Localisation/SLAM', 'Dynamique de suspension', 'Obstacles mobiles'], shape: 'wheeled' }),
  t('omni', 'mobile', 'Omnidirectionnel', 'Roues mecanum / omni.', { keywords: ['omnidirectionnel', 'mecanum'], shape: 'wheeled', notImplemented: ['Cinématique mecanum'] }),
  t('tracked', 'mobile', 'À chenilles', 'Locomotion à chenilles.', { keywords: ['chenilles'], components: ['Châssis', '2 chenilles'], params: ['Voie', 'Vitesses', 'χ'], modules: ['tracked'], capabilities: cap(A, A, E, D), shape: 'tracked', notImplemented: ['Terramécanique, identification de χ'] }),
  t('quadruped', 'mobile', 'Quadrupède', 'Robot à quatre pattes.', { keywords: ['quadrupède', 'chien', 'pattes'], modules: ['balance-quadruped', 'quad-gait'], capabilities: cap(A, A, A, E), notImplemented: ['Allures dynamiques (trot, galop)', 'Contacts et glissements'], shape: 'quadruped' }),
  t('rover', 'mobile', 'Rover tout-terrain', 'Plateforme d\'exploration.', { keywords: ['rover', 'tout-terrain'], shape: 'wheeled', modules: ['mobile-diff'], capabilities: cap(A, E, E, E), notImplemented: ['Terramécanique, terrain irrégulier'] }),
  t('inspection', 'mobile', 'Inspection autonome', 'Robot de surveillance.', { keywords: ['surveillance', 'patrouille'], shape: 'wheeled', modules: ['mobile-diff', 'nav-grid'], capabilities: cap(A, E, E, E) }),
  t('multirotor', 'aerial', 'Drone multirotor', 'Quadri-, hexa-, octorotor.', { keywords: ['drone', 'multirotor', 'quadricoptère', 'quadrirotor'], components: ['Châssis', 'Rotors', 'Batterie', 'Contrôleur'], joints: '—', params: ['Masse', 'Poussée/rotor', 'Nombre de rotors'], modules: ['aerial', 'quadrotor'], capabilities: cap(A, A, A, E), notImplemented: ['Aérodynamique (flux induit, effet de sol)', 'Dynamique des moteurs/ESC', 'Autonomie mesurée'], shape: 'drone' }),
  t('fixedwing', 'aerial', 'Voilure fixe', 'Avion robotisé.', { keywords: ['avion', 'voilure fixe'], shape: 'plane', notImplemented: ['Portance/traînée (nécessite polaires)'] }),
  t('vtol', 'aerial', 'Hybride VTOL', 'Décollage vertical + vol de croisière.', { keywords: ['vtol', 'hybride'], shape: 'plane' }),
  t('expaerial', 'aerial', 'Aérien expérimental', 'Ornithoptères, dirigeables…', { keywords: ['ornithoptère', 'dirigeable'], shape: 'drone' }),
  t('rov', 'aquatic', 'ROV', 'Sous-marin téléopéré.', { keywords: ['rov', 'sous-marin', 'téléopéré'], components: ['Coque', 'Propulseurs', 'Ombilical', 'Flotteurs'], params: ['Masse', 'Volume', 'Cd·A par axe', 'BG', 'Iyy', 'Propulseurs'], modules: ['aquatic', 'rov-dyn'], capabilities: cap(A, A, E, E), notImplemented: ['Masses ajoutées', 'Hydrodynamique 6 DDL', 'Ombilical', 'Courants'], shape: 'sub' }),
  t('auv', 'aquatic', 'AUV', 'Sous-marin autonome.', { keywords: ['auv', 'autonome sous-marin'], modules: ['aquatic', 'rov-dyn'], capabilities: cap(A, A, E, E), shape: 'sub' }),
  t('swimmer', 'aquatic', 'Nageur biomimétique', 'Robot poisson.', { keywords: ['poisson', 'nageur'], shape: 'sub', notImplemented: ['Propulsion ondulatoire'] }),
  t('surface', 'aquatic', 'Engin de surface', 'Drone de surface.', { keywords: ['bateau', 'surface'], modules: ['aquatic'], capabilities: cap(A, E, D, E), shape: 'boat' }),
  t('medical', 'special', 'Robot médical', 'Assistance chirurgicale ou rééducation.', { keywords: ['médical', 'chirurgie'], shape: 'arm', notImplemented: ['Exigences réglementaires (IEC 60601, ISO 13485…)'] }),
  t('soft', 'special', 'Robot souple', 'Actionneurs déformables.', { keywords: ['souple', 'soft'], capabilities: cap(E, D, D, D), notImplemented: ['Mécanique des milieux continus / grandes déformations (SOFA, éléments finis) — volontairement NON simulé avec des articulations rigides'], shape: 'soft' }),
  t('modular', 'special', 'Robot modulaire', 'Modules reconfigurables.', { keywords: ['modulaire'], shape: 'modular' }),
  t('micro', 'special', 'Micro-robot', 'Échelle millimétrique.', { keywords: ['micro'], shape: 'box', notImplemented: ['Effets d\'échelle (adhésion, viscosité)'] }),
  t('swarm', 'special', 'Essaim robotique', 'Groupe d\'agents coordonnés.', { keywords: ['essaim', 'flotte', 'rendez-vous', 'couverture'], modules: ['swarm', 'swarm-mission'], capabilities: cap(A, A, E, E), notImplemented: ['Dynamique des véhicules', 'Communication'], shape: 'swarm' }),
  t('transform', 'special', 'Robot transformable', 'Change de morphologie.', { keywords: ['transformable'], shape: 'modular' }),
  t('gripper', 'special', 'Robot de préhension', 'Pince et préhenseur.', { keywords: ['pince', 'préhenseur', 'saisir'], modules: ['gripper'], capabilities: cap(A, A, D, A), shape: 'hand' }),
  t('explore', 'special', 'Robot d\'exploration', 'Environnements extrêmes.', { keywords: ['exploration', 'spatial'], shape: 'wheeled', modules: ['mobile-diff'], capabilities: cap(A, E, E, E) }),
];
export const typeById = (id: string) => ROBOT_TYPES.find((r) => r.id === id);
export function searchTypes(q: string, family?: string, status?: Status) {
  const s = q.trim().toLowerCase();
  return ROBOT_TYPES.filter((r) => (!family || r.family === family) && (!status || r.capabilities.physique === status || r.capabilities.cinematique === status)
    && (!s || [r.name, r.description, ...r.keywords].some((x) => x.toLowerCase().includes(s))));
}
