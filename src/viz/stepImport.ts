// Import STEP dans le navigateur via occt-import-js (OpenCascade compilé en WebAssembly), chargé à la demande.
import * as THREE from 'three';
import { meshVolume, meshBBox, isClosed, type MeshData } from '../core/meshGeom';
let occtP: Promise<any> | null = null;
async function occt() { if (!occtP) occtP = (async () => { const [{ default: init }, { default: wasmUrl }] = await Promise.all([import('occt-import-js'), import('occt-import-js/dist/occt-import-js.wasm?url')]); return init({ locateFile: () => wasmUrl }); })(); return occtP; }
export interface StepInfo { group: THREE.Group; meshes: number; volume: number | null; closed: boolean; bbox: { size: number[] }; unitNote: string; warnings: string[] }
/** Lit un fichier STEP ; unités : occt-import-js renvoie les coordonnées en millimètres (convention STEP la plus courante) → converties en mètres. */
export async function importStep(buf: ArrayBuffer): Promise<StepInfo> {
  const o = await occt(); const r = o.ReadStepFile(new Uint8Array(buf), { linearUnit: 'millimeter', linearDeflectionType: 'bounding_box_ratio', linearDeflection: 0.001, angularDeflection: 0.5 });
  if (!r.success) throw new Error('Lecture STEP impossible (fichier invalide ou non pris en charge).');
  const g = new THREE.Group(); const md: MeshData[] = [];
  for (const m of r.meshes) { const pos = new Float32Array(m.attributes.position.array.map((v: number) => v / 1000)); const idx = Uint32Array.from(m.index.array); md.push({ positions: pos, indices: idx });
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setIndex(new THREE.BufferAttribute(idx, 1)); geo.computeVertexNormals();
    const c = m.color ? new THREE.Color(m.color[0], m.color[1], m.color[2]) : new THREE.Color(0x9fb6da); g.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: c, metalness: 0.3, roughness: 0.5, side: THREE.DoubleSide }))); }
  const closed = isClosed(md); const warnings = ['Le fichier STEP ne contient ni masse ni matériau exploitable ici : la masse n\'est calculée que si vous fournissez une masse volumique.'];
  if (!closed) warnings.push('Maillage non fermé (surfaces ouvertes ou tessellation non étanche) : volume non calculé.');
  return { group: g, meshes: r.meshes.length, volume: closed ? meshVolume(md) : null, closed, bbox: meshBBox(md), unitNote: 'Coordonnées converties en mètres (lecture en millimètres).', warnings };
}
