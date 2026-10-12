# Robotics AI Lab — prototype v0.9 (plateforme multi-robots)

Application Web de conception et de **validation virtuelle préliminaire** de robots.
Stack : Vite + TypeScript + Three.js (+ urdf-loader). Aucun service payant, aucune clé API.

> ⚠️ Ce prototype ne certifie en aucun cas qu'un robot est apte à être fabriqué ou utilisé dans le monde réel. Les valeurs par défaut sont des **valeurs de démonstration** étiquetées comme telles ; les données absentes sont signalées **manquantes**.

## Démarrage
```bash
npm install
npm test                          # 111 tests unitaires (vitest)
npm run build && npm run preview  # http://localhost:4173
```
Routes : `#/` accueil · `#/bibliotheque` · `#/comparateur` · `#/planificateur` · `#/robot/<id>` fiche · `#/atelier/arm` atelier bras complet · `#/atelier/<id>` atelier générique.


## Nouveautés v0.9
- **Analyse de photo** (`#/photo`, `src/core/photo.ts`) : photo (redimensionnée à 1024 px), modèle de vision **optionnel** avec **votre** clé (compatible OpenAI `chat/completions` ou Google Gemini), stockée seulement sur l'appareil (session par défaut, localStorage si « mémoriser »), envoyée directement au fournisseur (pas de serveur intermédiaire). Réponse JSON **validée strictement** : clés exactes (famille, type, confiance, articulations visibles, configuration, observations), bornes, cohérence famille/type ; **rejet** de toute dimension, masse, moteur, couple, vitesse ou matériau (clé ou valeur chiffrée dans le texte). Tout est marqué **« proposé — à vérifier (issu de la photo) »**.
- L'atelier proposé s'ouvre avec la photo en référence ; **aucun verdict de faisabilité** tant que l'utilisateur n'a pas confirmé avoir saisi lui-même dimensions, masses et moteurs ; les verdicts ne viennent que des calculs. Le nombre d'articulations proposé ne modifie jamais la structure (simple avertissement).
- **Mode manuel sans clé** : choix famille/type, photo affichée à côté de la vue 3D.
- Tests : 165/165 (9 nouveaux dans `tests/v9.test.ts`, réponses de fournisseurs simulées).

## Nouveautés v0.8
- **Dynamique multicorps rigide** (`src/core/dynamics.ts`) : RNEA (Newton-Euler récursif) avec tenseurs d'inertie des segments (cylindre plein du rayon de capsule, tube/rectangle déclaré, ou tenseurs URDF avec fusion des liaisons fixes), matrice de masse par CRBA colonne par colonne, dynamique directe q̈ = M⁻¹(τ − h) + RK4. ABA (Featherstone) non implémenté : la CRBA O(n³) suffit pour n ≤ 7. Validé : RNEA statique = couples gravitaires analytiques, aller-retour FD/ID, conservation de l'énergie, URDF, accord Rapier (< 5 % de l'amplitude sur 0,15 s ; divergence ensuite, système chaotique). Atelier : tableau des couples RNEA et contrôle **couple-vitesse** (modèle CC linéaire — hypothèse).
- **Résistance simplifiée** (`strength.ts`, page `#/resistance`) : flexion/torsion à la base de chaque segment (rond plein, tube, rectangle — torsion rectangulaire selon Roark), von Mises, coefficient de sécurité, flèche au TCP (majorant, articulations rigides). Matériau obligatoire ; bibliothèque de **valeurs typiques sourcées** (6061-T6, 7075-T6, S235, 304, PLA, ABS, PA12). **Estimation, pas un calcul par éléments finis.**
- **Import STEP dans le navigateur** via `occt-import-js` (OpenCascade WebAssembly, ≈ 7,6 Mo, chargé à la demande) : affichage, boîte englobante, volume (si maillage fermé) ; masse seulement si l'utilisateur saisit la masse volumique.
- **Suite de validation** (`#/validation`) : pendule composé, double pendule (énergie), couple statique, accélération angulaire initiale, poutre console (flèche, contrainte), Rapier vs RNEA, seuil de glissement de la pince dans Rapier — calculé vs référence, erreur, tolérance.
- **Mobile** : barre d'onglets inférieure, panneaux repliables (toucher le titre), vue 3D à 55 % de la hauteur, commandes agrandies.
- Tests : 156/156 (15 nouveaux dans `tests/v8.test.ts`). Fichier de test `tests/fixtures/cube.step` issu du dépôt occt-import-js (LGPL-2.1).

## Nouveautés v0.7
- **7e famille « Robots compagnons »** : robot de bureau à tête articulée, robot de poche/pendentif, compagnon mobile sur roues (modèles 3D procéduraux « modèle générique non validé » : tête à écran-visage, petits bras, socle). Des produits comme Eilik, Emo ou Aibi Pocket sont cités uniquement comme exemples de catégorie : **aucune spécification de ces produits n'est utilisée**.
- **Module `companion`** (testé) : couple gravitaire statique du tilt de tête (m·g·d·sin θmax) et des bras (pire cas horizontal) comparé au **couple de blocage déclaré (obligatoire)**, alerte > 50 % (règle empirique, « à valider ») ; CdM global tête inclinée + bras tendus vs demi-largeur d'appui (marge, inclinaison de bureau tolérée) ; autonomie = Wh / W (**estimé**, si fournis). Personnalité, expressions, interaction IA : **À développer**.
- Assistant : « robot compagnon », « robot de compagnie », « robot de bureau », « pendentif/poche », « compagnon mobile ».
- Mobile : barre de navigation compacte défilante, panneaux empilés, tableaux défilants ; **guide de première visite** (fermable, mémorisé, rouvrable via « ❓ Guide »).
- Tests : 141/141 (7 nouveaux dans `tests/v7.test.ts`).

## Nouveautés v0.6
- **Pince dans Rapier (expérimental)** — `src/physics/rapierGripper.ts` : paume cinématique, 2 doigts dynamiques sur glissières dont le moteur est **borné à l'effort déclaré**, frottement de Coulomb μ utilisateur, levée à accélération constante. Détection tenue/glissement (glissement relatif boîte/paume). Comparaison à F ≥ m(g+a)/(nμ) : sur le cas test (1 kg, μ = 0,5, a = 2 m/s²) la transition tenue/glissement se situe entre 0,9× et 1,1× la valeur analytique. Bouton dans l'atelier « Préhension » (2 doigts uniquement, boîte 60×60×100 mm).
- **Essaim avec mission** — `swarmMission.ts` : obstacles circulaires, mission rendez-vous ou couverture (balayage en bandes), métriques (séparation min, collisions agent/agent et agent/obstacle, durée d'accomplissement, couverture), comparaison automatique N/2, N, 2N. Agents ponctuels sans contrainte dure : les interpénétrations sont **détectées et comptées**, pas empêchées.
- **SCARA et cobot dans le pipeline bras** (cinématique, couples, collisions, Rapier avec limites de couple et contacts) : segments orientables (`dir`), modèles `demoScara()` (3 rotoïdes ; l'axe Z prismatique n'est pas modélisé dans ce pipeline) et `demoCobot()` (6 axes). Sélecteur de modèle dans l'atelier (`#/atelier/arm?modele=scara|cobot`).
- **Cobot : seuils déclarés** — vitesse TCP max (calculée par différences finies) et effort quasi-statique transmissible au TCP F = min τmax/|(Jᵀu)| (**estimé**), comparés aux seuils saisis par l'utilisateur. **Aucune évaluation de conformité ISO 10218 / ISO/TS 15066** : ces normes exigent une analyse de risques, des mesures de forces/pressions réelles par zone corporelle, etc.
- **Assistant élargi** : nombres en lettres (« vingt-cinq », « deux cents », « un virgule cinq », « deux et demi »), unités mm/cm/m, g/kg, N, N·m/Nm, m/s, km/h, synonymes (AGV/AMR, quadricoptère/UAV, manipulateur, engin sous-marin…), comparaisons remplissant deux configurations A/B (ex. « Compare un drone de 1,2 kg et un drone de 2 kg » → tableau), missions essaim (rendez-vous/couverture) et trajets planificateur « de (1 ; 1) à (8 ; 5) ».
- **Projet sauvegarde/chargement** (`src/core/project.ts`, boutons dans la barre supérieure) : bras (modèle + poses), valeurs de tous les modules avec provenance, carte du planificateur, historique. Schéma `robotics-ai-lab/projet` **version 2**, migration v1→v2, validation (schéma, version future refusée, butées, longueurs, valeurs non numériques, provenances, indices de carte) ; corrections signalées (valeur nulle → « manquant »).

## Nouveautés v0.5
### ROV/AUV — dynamique plane (`modules/underwater.ts`, module `rov-dyn`)
Plan vertical à 3 DDL (cavalement, pilonnement, tangage), corps rigide : flottabilité ρgV appliquée au centre de carène situé à BG au-dessus du CdM (moment de redressement −ρgV·BG·sin θ), traînée quadratique **par axe avec Cd·A obligatoires** (aucune valeur par défaut), traînée en tangage k|q|q, 4 propulseurs (matrice d'allocation, pseudo-inverse, saturation ±Tmax détectée), PID de profondeur + PD d'assiette. Non modélisé : masses ajoutées, couplages hydrodynamiques, courants, 6 DDL. Badges ROV/AUV : cinématique Expérimental.
Tests : flottabilité neutre, moment de redressement, allocation exacte / saturation, **période d'oscillation 2π√(I/(ρgV·BG))**, **vitesse limite √(2F/(ρCdA))**, maintien de profondeur à 0,2 m.

### Robot mobile — carte, A*, poursuite pure (`modules/planning.ts`, module `nav-grid`, page `#/planificateur`)
Grille d'occupation éditable à la souris (obstacles, gomme, départ, arrivée), gonflement par empreinte (disque) + marge, A* 8-connexe sans coupe de coin, poursuite pure pour robot différentiel avec limites de vitesse, d'accélération (min(a_max, μg)), d'accélération latérale (μg) et de vitesse roue, contrôle de collision de l'empreinte sur la carte **non gonflée**. Export de la carte en JSON.
Constat honnête (testé) : sans marge, la poursuite pure coupe les virages et l'empreinte touche les rayonnages ; la marge de 0,15 m l'évite sur la carte de démo.

### Assistant de bout en bout (`src/core/assistant.ts`, page d'accueil)
Requête en français → interprétation structurée → choix du module → validation → exécution **uniquement si toutes les données obligatoires sont présentes** → explication à règles (calculé / estimé / à valider). Sinon, liste des champs manquants avec un formulaire. Les valeurs extraites du texte ou saisies sont « utilisateur » ; les valeurs de démonstration ne sont utilisées **que si l'utilisateur coche explicitement l'option**, et restent étiquetées. Aucun LLM.

### Rapport global de session (`src/core/globalReport.ts`)
Agrège l'historique (ateliers, assistant, planificateur, atelier bras) en un rapport HTML / Markdown / JSON, sections **calculé / estimé / à valider**, hypothèses par exécution, avertissement. Boutons sur la page d'accueil.

### Tests v0.5 (23 nouveaux, total 111/111)
ROV (6), planification et suivi (9 dont collision sans marge), assistant (5 phrases), rapport global (2), registre (1).

## Nouveautés v0.4
### Rapier (toujours Expérimental)
- **Couples moteurs bornés** aux valeurs déclarées (`setMotorMaxForce` : le solveur limite l'impulsion à couple × dt). Moteur non déclaré → articulation **non motorisée**, signalée (aucun couple inventé). Butées optionnelles (`enforceJointLimits`).
- **Obstacle sphérique** inclus (collider fixe) et **rapport des contacts** par paires nommées (segment/segment, segment/sol, segment/obstacle), contacts effectifs (distance ≤ 0).
- **Relecture des couples gravitaires** à partir des masses et centres de masse stockés dans Rapier (`gravityTorquesFromEngine`), comparée à l'analytique (test : égalité à 10⁻³ N·m). Le couple réellement appliqué par le moteur PD n'est toujours pas lisible de façon fiable.
- Tests : moteur d'épaule à 2 N·m (< couple gravitaire requis) → affaissement > 15° et > 5× celui à 25 N·m ; contact avec l'obstacle rapporté.

### IK 6D (`src/core/ik6.ts`)
DLS pondéré (w_pos, w_ori), jacobien géométrique, erreur d'orientation ½ Σ Rᵢ × R_dᵢ. Le bras de démo n'a que 5 axes : une orientation arbitraire n'est pas toujours atteignable → compromis signalé. UI : case « Imposer l'orientation » (roulis/tangage/lacet).

### Robots à pattes (`modules/legged.ts`)
- Jambe 3 DDL (abduction, hanche, genou) FK/IK analytique ; 2 DDL avec d = 0.
- Quadrupède : allure rampante statique (4 phases, une patte levée), marge du CdM vis-à-vis du trépied d'appui par phase. Cinématique : Disponible.
- Bipède : ZMP latéral par **pendule inverse linéaire (LIPM) — estimation** (masse ponctuelle à hauteur constante, balancement sinusoïdal imposé, double appui non modélisé), marge vs pied d'appui, amplitude conseillée. Cinématique : Expérimental.

### Quadrirotor 3D (`modules/quadrotor.ts`)
Corps rigide 6 DDL (configuration « + »), moments à partir de la longueur de bras et de **k_m/k_f et des inerties fournis (obligatoires, sans valeur par défaut)**, poussées bornées [0, Tmax] avec **détection de saturation**, PID en cascade (position → attitude) avec anti-emballement, traînée quadratique uniquement si Cd·A fourni. Pas de dynamique moteur, flux induit ni effet de sol. Tests : mélangeur exact, chute libre, stationnaire, ω̇ = τ/I, atteinte du point de passage (< 0,1 m), saturation.

### Comparateur multi-configurations (`src/core/compare.ts`, page `#/comparateur`)
N configurations d'un même module (tous modules de la plateforme), tableau des paramètres (avec provenance) et des résultats, problèmes critiques, données manquantes ; export CSV (séparateur ;) et JSON. Une configuration incomplète n'est pas calculée.

### Tests v0.4 (19 nouveaux, total 88/88)
Rapier (relecture gravité, borne de couple, moteur non déclaré, obstacle), IK 6D (atteinte, erreur d'orientation, compromis 5 axes), jambes (IK↔FK, cas à la main, allure, ZMP LIPM analytique), quadrirotor (6 tests), comparateur (tableau + CSV), registre.

## Nouveautés v0.3
### URDF branché au moteur (`src/core/urdf.ts`, pur TS, fast-xml-parser)
- Analyse : articulations revolute / continuous / prismatic / fixed, origines (xyz, rpy), axes, limites, effort, vitesse ; `<inertial>` (masse, centre de masse, inertie).
- Signalement : masse absente (segment exclu des couples), inertie absente, effort non déclaré, limites absentes, type non pris en charge, arbre à plusieurs racines.
- Calculs : FK sur l'arbre, limites, couple (rotoïde) / force (prismatique) gravitaires statiques comparés à l'effort déclaré, collisions par capsules **estimées** (origines des articulations + géométrie de collision ; rayon par défaut 20 mm si absente ; paires adjacentes et à deux niveaux ignorées).
- UI : onglet Importer → « Charger l'exemple URDF » (`public/samples/sample_arm.urdf`, valeurs fictives) ; le tableau se met à jour en manipulant les curseurs.
- Limite : couples dynamiques URDF non calculés (statique seulement) ; maillages non utilisés pour les collisions.

### IK numérique du bras (`src/core/ik.ts`)
Moindres carrés amortis (λ = 0,05, pas borné à 0,2 rad, butées appliquées à chaque itération), position seule (pas d'orientation). Le rapport indique : atteinte, erreur, itérations, axes en butée, « hors portée géométrique » ou « non atteint (butées ou minimum local) ». UI : panneau « Cinématique inverse » + « Ajouter comme pose ».

### Nouvelles cinématiques (badges relevés après tests)
- **Delta** (`modules/delta.ts`) : FK/IK (formulation de Clavel), espace de travail échantillonné dans les butées. Cinématique : Disponible.
- **Portique cartésien** (`modules/gantry.ts`) : courses, volume, temps trapézoïdal par axe, mouvement synchronisé, trajectoire échantillonnée. Cinématique : Disponible.
- **Chenilles** (`modules/tracked.ts`) : skid-steer v = (vl+vr)/2, ω = (vr−vl)/(χ·B), **χ (glissement) obligatoire, sans valeur par défaut**, intégration de pose, moment de pivotement estimé. Cinématique : Expérimental.

### Rapier — dynamique de corps rigides (`src/physics/rapierArm.ts`) — Expérimental
- Dépendance : `@dimforge/rapier3d-compat` 0.21 (Apache-2.0, WASM embarqué, ~2 Mo, chargé à la demande).
- Modèle : segments = corps rigides capsules (masse renseignée, inertie de tige homogène, charge intégrée au dernier segment), liaisons rotoïdes (contacts entre segments adjacents désactivés), sol, gravité ; moteurs de position PD du solveur.
- Validation croisée (test) : appliquer les **couples statiques analytiques** maintient le bras immobile (dérive ≈ 0,3° en 0,3 s, due à l'équilibre instable et aux erreurs numériques) alors que 80 % ou 120 % de ces couples provoquent une dérive de 16 à 22°. Un second test vérifie la chute du bras sans moteurs.
- Limites : les gains PD sont des paramètres numériques (le couple moteur n'est pas mesurable directement de façon fiable) ; pas de saturation de couple, de frottement, de modèle électrique ; obstacle sphérique non inclus ; dépendance au pas de temps. Ne remplace pas MuJoCo/Drake ni des essais.

### Tests v0.3 (19 nouveaux, total 69/69)
URDF (structure, avertissements, FK, couples à la main 2·0,15 + 1·0,425 → 7,11 N·m, prismatique m·g, limites, collision sol), IK (convergence, hors portée, butées), Delta (IK→FK, symétrie, hors portée, espace de travail), portique (volume, temps 1,4 s / 1 s, synchronisation), chenilles (χ, cercle fermé), badges, Rapier vs analytique.

## Architecture
| Dossier | Rôle | Dépend de Three.js ? |
|---|---|---|
| `src/core/math, model, kinematics, trajectory, collision, mechanics, simulation` | Moteur du bras articulé (v0.1) | non |
| `src/core/analysis.ts`, `report.ts` | Assistant d'analyse à règles déterministe, rapports JSON/MD/HTML | non |
| `src/core/registry.ts` | **Registre data-driven** des familles/types, capacités et statuts | non |
| `src/core/modules/types.ts` | **Interface commune** `SimModule` (paramètres + provenance, `runModule` qui refuse de calculer si une donnée requise manque) | non |
| `src/core/modules/{scara,mobile,balance,aerial,aquatic,gripper,swarm}.ts` | Calculs par domaine | non |
| `src/core/modules/catalog.ts` | Modules exposés (hypothèses, anomalies, nature calculé/estimé/à valider) | non |
| `src/core/nlp.ts` | Analyseur de requêtes en français à règles (aucun LLM, aucun résultat produit) | non |
| `src/viz/` | Scène Three.js, modèles procéduraux, importeurs | oui |
| `src/ui/` | Pages, routeur, graphiques canvas | — |

Ajouter un type de robot = une entrée dans `registry.ts` (+ éventuellement un `SimModule` dans `catalog.ts`). Aucun changement d'architecture.

## Familles ajoutées (33 types)
- **Industriels (6)** : bras articulé, SCARA, Delta, cartésien/portique, cobot, soudage/assemblage
- **Humanoïdes & biomécanique (5)** : bipède, torse + bras, exosquelette, main/doigts, biomimétique
- **Mobiles terrestres (6)** : roues (différentiel), omnidirectionnel, chenilles, quadrupède, rover, inspection autonome
- **Aériens (4)** : multirotor, voilure fixe, hybride VTOL, expérimental
- **Aquatiques (4)** : ROV, AUV, nageur biomimétique, engin de surface
- **Spécialisés (8)** : médical, souple, modulaire, micro, essaim, transformable, préhension, exploration

Chaque type déclare des capacités (visualisation, configuration, cinématique, physique) avec badge **Disponible / Expérimental / À développer**, et une liste « non implémenté ». Le bouton d'atelier n'est actif que si un module réellement implémenté et testé existe.

## Modèles 3D
Tous les modèles de la bibliothèque sont **procéduraux et génériques** (« modèle générique non validé »), sans données mécaniques. Seul le bras de démonstration possède un modèle paramétrique relié aux calculs.

## Simulations opérationnelles (testées)
| Module | Calculs |
|---|---|
| Atelier bras (v0.1) | FK, trajectoires quintiques, butées, vitesses, collisions capsules (auto/sol/obstacle), couple statique calculé, couple dynamique estimé (masses ponctuelles), CdM, basculement |
| SCARA | FK, IK analytique (2 solutions), espace de travail |
| Robot à roues différentiel | v, ω, rayon de braquage, couple roue, limite d'adhérence μ·g (si μ donné), profil trapézoïdal, collisions disque/obstacles sur trajet 2D |
| Équilibre bipède / quadrupède | enveloppe convexe des appuis, marge de stabilité statique du CdM |
| Multirotor | poussée/poids, commande de stationnaire (hyp. linéaire), dynamique verticale point-masse sans traînée |
| Aquatique | flottabilité nette, vitesse limite en traînée quadratique (**Cd obligatoire, aucune valeur par défaut**) |
| Préhension | F ≥ m(g+a)/(n·μ) (**μ obligatoire**) |
| Essaim | agents ponctuels, flocking (Reynolds), séparation minimale, contacts, graine fixe |

## Modules expérimentaux / à développer
- Robot souple : **À développer** — volontairement non simulé (une approximation par articulations rigides serait trompeuse ; nécessite SOFA/éléments finis).
- Delta, portique, omnidirectionnel, chenilles, voilure fixe, VTOL, nageur, médical, modulaire, micro, transformable : visualisation seulement.
- Contrôle complet de la marche, aérodynamique (hors traînée simple), hydrodynamique 6 DDL, masses ajoutées : non implémentés.

## Autres fonctions
Accueil (familles, requête en langage naturel, historique localStorage), bibliothèque (recherche, filtres famille/statut, vignettes), fiches détaillées, ateliers (sélecteur de scénario/module, provenance des paramètres, export/import de configuration JSON, rapport Markdown/JSON, comparaison A/B), import 3D.

## Formats d'import et limites
- **URDF** (urdf-loader ; maillages STL/OBJ déposés ensemble) : masses/inerties/efforts absents signalés. Branché au moteur depuis v0.3 (statique).
- **GLB/glTF** (GLTFLoader ; .gltf avec ressources externes à déposer ensemble), **STL**, **OBJ** : géométrie seule, aucune masse/inertie/matériau ; détection probable des millimètres.
- **STEP** : non lisible par le navigateur → conversion serveur requise (OpenCascade/pythonOCC, FreeCAD CLI, ou opencascade.js). Non implémenté.

## Tests
**v0.6 : `npm test` → 134/134 réussis** (111 antérieurs sans régression + 23 nouveaux dans `tests/v6.test.ts` : pince Rapier vs analytique, μ, SCARA FK/couples nuls/Rapier limite de couple/contact, cobot maintien Rapier par couples analytiques, vitesse TCP vs formule quintique 1,875·Δθ/T, seuils cobot, missions essaim, comparaison de N, nombres en lettres, unités, synonymes, comparaison A/B, missions, sauvegarde/validation/migration de projet). `npm run build` réussi.

Historique : `npm test` → **50/50 réussis** (23 bras v0.1 sans régression + 27 plateforme) : SCARA IK/FK, cinématique différentielle et inverse, trapèze, adhérence, collisions trajet, enveloppe convexe et marges, poussée/poids, montée verticale (T = mg et T = 2mg vs g t²/2), flottabilité, vitesse limite, effort de serrage, essaim (déterminisme, séparation), interface commune (refus de calcul si donnée requise manquante), registre (6 familles, 33 types, modules existants, pas de faux module souple), analyseur de requêtes (3 phrases de référence, unités g/kg). `npm run build` réussi.

## Calculs nécessitant un outil spécialisé
Dynamique multicorps et contacts : MuJoCo, PyBullet, Drake, Pinocchio · Structure : FEA (CalculiX, Code_Aster) · Aéro/hydro : CFD, essais · Robots souples : SOFA · STEP : OpenCascade.

## Étapes suivantes
1. Couples dynamiques sur URDF (Newton-Euler récursif avec les inerties fournies) ; collisions sur maillages convexes.
2. Newton-Euler récursif avec inerties ; validation croisée avec Pinocchio/Drake.
3. Cinématique Delta et mecanum ; IK du bras.
4. Service optionnel (Python) MuJoCo/PyBullet + conversion STEP.
5. Bibliothèque de matériaux sourcée, pré-dimensionnement, FEA.
6. Hook LLM optionnel pour l'analyseur de requêtes (non requis).

## Dépendances
three, urdf-loader, fast-xml-parser, @dimforge/rapier3d-compat (exécution) ; vite, typescript, vitest, @types/three (dév.). Captures : `scripts-screenshots.mjs` (playwright-core + Chrome, optionnel).
