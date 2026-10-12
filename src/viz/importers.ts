// Import de géométries : visualisation uniquement. Un maillage STL/OBJ ne contient ni masse, ni inertie, ni articulations.
import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import URDFLoader from 'urdf-loader';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
export interface ImportInfo { object: THREE.Object3D | null; lines: string[]; warnings: string[]; stepVolume?: number | null; urdfJoints?: { name: string; type: string; lower?: number; upper?: number; set: (v: number) => void }[] }
const unitHint = (s: THREE.Vector3) => Math.max(s.x, s.y, s.z) > 10 ? 'Dimensions > 10 unités : le fichier est probablement en millimètres (les maillages n\'ont pas d\'unité déclarée). Mise à l\'échelle ×0,001 appliquée à l\'affichage.' : null;
function fit(obj: THREE.Object3D, info: ImportInfo) {
  const box = new THREE.Box3().setFromObject(obj); const s = box.getSize(new THREE.Vector3());
  const h = unitHint(s); if (h) { obj.scale.setScalar(0.001); info.warnings.push(h); box.setFromObject(obj); box.getSize(s); }
  info.lines.push(`Boîte englobante : ${(s.x * 1000).toFixed(0)} × ${(s.y * 1000).toFixed(0)} × ${(s.z * 1000).toFixed(0)} mm (en supposant des unités en mètres).`);
  obj.position.z -= box.min.z;
}
export async function importFiles(files: File[]): Promise<ImportInfo> {
  const info: ImportInfo = { object: null, lines: [], warnings: [] };
  const main = files.find((f) => /\.urdf$/i.test(f.name)) ?? files[0]; const ext = main.name.split('.').pop()!.toLowerCase();
  const mat = new THREE.MeshStandardMaterial({ color: 0xb8c4d6, metalness: 0.3, roughness: 0.5 });
  if (ext === 'stl') {
    const g = new STLLoader().parse(await main.arrayBuffer()); g.computeVertexNormals(); const mesh = new THREE.Mesh(g, mat);
    info.object = mesh; info.lines.push(`STL : ${g.attributes.position.count / 3} triangles.`);
  } else if (ext === 'glb' || ext === 'gltf') {
    if (ext === 'gltf' && files.length === 1) info.warnings.push('Fichier .gltf seul : les ressources externes (.bin, textures) doivent être déposées avec lui ou préférer .glb.');
    const urls = new Map(files.map((f) => [f.name, URL.createObjectURL(f)]));
    const mgr = new THREE.LoadingManager(); mgr.setURLModifier((u) => urls.get(u.split('/').pop()!) ?? u);
    const gl = await new GLTFLoader(mgr).loadAsync(urls.get(main.name)!);
    const o = gl.scene; o.rotation.x = Math.PI / 2; info.object = o; info.lines.push(`glTF : ${gl.scene.children.length} nœud(s) racine, ${gl.animations.length} animation(s). glTF est Y-up : rotation de 90° appliquée.`);
  } else if (ext === 'obj') {
    const o = new OBJLoader().parse(await main.text()); o.traverse((c) => { if ((c as THREE.Mesh).isMesh) (c as THREE.Mesh).material = mat; }); info.object = o; info.lines.push(`OBJ : ${o.children.length} objet(s).`);
  } else if (ext === 'urdf') {
    const xml = await main.text(); const urls = new Map(files.map((f) => [f.name.toLowerCase(), URL.createObjectURL(f)]));
    const loader = new URDFLoader(); const missingMeshes: string[] = [];
    loader.loadMeshCb = (path: string, _m: any, _mat: any, done: (o: THREE.Object3D) => void) => {
      const name = path.split('/').pop()!.toLowerCase(); const url = urls.get(name);
      if (!url) { missingMeshes.push(name); done(new THREE.Object3D()); return; }
      if (name.endsWith('.stl')) new STLLoader().load(url, (g) => done(new THREE.Mesh(g, mat)));
      else if (name.endsWith('.obj')) new OBJLoader().load(url, (o) => done(o));
      else { missingMeshes.push(name + ' (format non pris en charge)'); done(new THREE.Object3D()); }
    };
    const robot: any = loader.parse(xml); robot.rotation.set(0, 0, 0); info.object = robot;
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    const links = [...doc.querySelectorAll('robot > link')];
    const noMass = links.filter((l) => !l.querySelector('inertial > mass')).map((l) => l.getAttribute('name'));
    const noInertia = links.filter((l) => !l.querySelector('inertial > inertia')).map((l) => l.getAttribute('name'));
    const joints = [...doc.querySelectorAll('robot > joint')];
    info.lines.push(`URDF « ${robot.robotName ?? '?'} » : ${links.length} segment(s), ${joints.length} articulation(s).`);
    joints.forEach((j) => { const lim = j.querySelector('limit'); info.lines.push(`• ${j.getAttribute('name')} [${j.getAttribute('type')}] limites ${lim?.getAttribute('lower') ?? '—'} / ${lim?.getAttribute('upper') ?? '—'} rad, effort ${lim?.getAttribute('effort') ?? 'NON DÉCLARÉ'} N·m`); });
    if (noMass.length) info.warnings.push(`Masse absente dans le URDF pour : ${noMass.join(', ')}.`);
    if (noInertia.length) info.warnings.push(`Inertie absente dans le URDF pour : ${noInertia.join(', ')}.`);
    if (joints.some((j) => !j.querySelector('limit')?.getAttribute('effort'))) info.warnings.push('Certaines articulations n\'ont pas d\'effort (couple) maximal déclaré.');
    setTimeout(() => { if (missingMeshes.length) info.warnings.push(`Maillages non fournis : ${missingMeshes.join(', ')} (déposez-les avec le fichier URDF).`); }, 0);
    info.urdfJoints = Object.values(robot.joints as Record<string, any>).filter((j) => j.jointType !== 'fixed').map((j) => ({ name: j.name, type: j.jointType, lower: j.limit?.lower, upper: j.limit?.upper, set: (val: number) => j.setJointValue(val) }));
    info.warnings.push('Le URDF importé est affiché et manipulable ; le moteur d\'analyse de ce prototype ne traite pour l\'instant que le bras de démonstration paramétrique.');
    return info;
  } else if (ext === 'step' || ext === 'stp') {
    const { importStep } = await import('./stepImport'); const st = await importStep(await main.arrayBuffer());
    info.object = st.group; info.stepVolume = st.volume; info.lines.push(`STEP (OpenCascade/WebAssembly) : ${st.meshes} solide(s)/maillage(s). ${st.unitNote}`);
    info.lines.push(`Boîte englobante : ${st.bbox.size.map((v) => (v * 1000).toFixed(1)).join(' × ')} mm.`, st.volume != null ? `Volume calculé (maillage tessellé, fermé) : ${(st.volume * 1e6).toFixed(2)} cm³ — précision liée à la tessellation.` : 'Volume : non calculé (maillage non fermé).');
    info.warnings.push(...st.warnings); const box = new THREE.Box3().setFromObject(st.group); st.group.position.z -= box.min.z; return info;
  } else { info.warnings.push(`Format .${ext} non pris en charge (formats acceptés : URDF, GLB/glTF, STL, OBJ, STEP).`); return info; }
  fit(info.object!, info);
  info.warnings.push('Ce maillage ne contient AUCUNE information de masse, d\'inertie, de matériau ni d\'articulation. Il est affiché pour examen géométrique seulement.');
  return info;
}
