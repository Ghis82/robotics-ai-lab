// Modèles 3D procéduraux génériques par famille — illustratifs, NON validés, sans données mécaniques.
import * as THREE from 'three';
const M = (c: number, o = 1) => new THREE.MeshStandardMaterial({ color: c, metalness: 0.4, roughness: 0.4, transparent: o < 1, opacity: o });
const GREY = 0xc9d3e0, DARK = 0x334155, BLUE = 0x3b82f6;
function box(w: number, d: number, h: number, c = GREY, x = 0, y = 0, z = 0) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, d, h), M(c)); m.position.set(x, y, z); return m; }
function cyl(r: number, h: number, c = GREY, x = 0, y = 0, z = 0, axis: 'x' | 'y' | 'z' = 'z') { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 24), M(c)); if (axis === 'z') m.rotation.x = Math.PI / 2; if (axis === 'x') m.rotation.z = Math.PI / 2; m.position.set(x, y, z); return m; }
function sph(r: number, c = GREY, x = 0, y = 0, z = 0) { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), M(c)); m.position.set(x, y, z); return m; }
function rod(a: THREE.Vector3, b: THREE.Vector3, r: number, c = GREY) { const d = b.clone().sub(a); const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, d.length(), 6, 16), M(c)); m.position.copy(a.clone().add(b).multiplyScalar(0.5)); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); return m; }
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
export function buildProcedural(shape: string): THREE.Group {
  const g = new THREE.Group();
  switch (shape) {
    case 'arm': g.add(cyl(0.1, 0.1, DARK, 0, 0, 0.05), rod(V(0, 0, 0.1), V(0, 0, 0.25), 0.05), rod(V(0, 0, 0.25), V(0.2, 0, 0.45), 0.045), rod(V(0.2, 0, 0.45), V(0.4, 0, 0.35), 0.04), rod(V(0.4, 0, 0.35), V(0.45, 0, 0.25), 0.03, BLUE)); break;
    case 'scara': g.add(cyl(0.08, 0.3, DARK, 0, 0, 0.15), box(0.3, 0.08, 0.05, GREY, 0.12, 0, 0.32), box(0.25, 0.07, 0.05, GREY, 0.35, 0.05, 0.36), cyl(0.015, 0.25, BLUE, 0.45, 0.08, 0.25)); break;
    case 'delta': g.add(cyl(0.2, 0.03, DARK, 0, 0, 0.6), cyl(0.06, 0.02, BLUE, 0, 0, 0.2)); for (let k = 0; k < 3; k++) { const a = (k * 2 * Math.PI) / 3; const p = V(0.18 * Math.cos(a), 0.18 * Math.sin(a), 0.6), e = V(0.28 * Math.cos(a), 0.28 * Math.sin(a), 0.45), q = V(0.05 * Math.cos(a), 0.05 * Math.sin(a), 0.2); g.add(rod(p, e, 0.015), rod(e, q, 0.01)); } break;
    case 'gantry': [[-0.4, -0.3], [0.4, -0.3], [-0.4, 0.3], [0.4, 0.3]].forEach(([x, y]) => g.add(box(0.04, 0.04, 0.6, DARK, x, y, 0.3))); g.add(box(0.84, 0.04, 0.04, GREY, 0, -0.3, 0.6), box(0.84, 0.04, 0.04, GREY, 0, 0.3, 0.6), box(0.05, 0.64, 0.05, GREY, 0.1, 0, 0.63), box(0.04, 0.04, 0.3, BLUE, 0.1, 0.05, 0.47)); break;
    case 'humanoid': g.add(box(0.25, 0.14, 0.32, GREY, 0, 0, 0.95), sph(0.09, GREY, 0, 0, 1.22), rod(V(-0.08, 0, 0.78), V(-0.08, 0, 0.08), 0.045), rod(V(0.08, 0, 0.78), V(0.08, 0, 0.08), 0.045), box(0.1, 0.22, 0.04, DARK, -0.08, 0.04, 0.02), box(0.1, 0.22, 0.04, DARK, 0.08, 0.04, 0.02), rod(V(-0.17, 0, 1.08), V(-0.2, 0, 0.75), 0.035), rod(V(0.17, 0, 1.08), V(0.2, 0, 0.75), 0.035)); break;
    case 'hand': g.add(box(0.1, 0.03, 0.1, GREY, 0, 0, 0.05)); for (let k = 0; k < 4; k++) g.add(rod(V(-0.036 + k * 0.024, 0, 0.1), V(-0.036 + k * 0.024, 0, 0.19), 0.009, BLUE)); g.add(rod(V(0.05, 0, 0.04), V(0.09, 0, 0.1), 0.01, BLUE)); break;
    case 'wheeled': g.add(box(0.5, 0.35, 0.12, GREY, 0, 0, 0.14), box(0.12, 0.12, 0.12, DARK, 0.15, 0, 0.26), cyl(0.08, 0.04, DARK, 0, 0.2, 0.08, 'y'), cyl(0.08, 0.04, DARK, 0, -0.2, 0.08, 'y'), sph(0.03, BLUE, 0.22, 0, 0.03), sph(0.03, BLUE, -0.22, 0, 0.03)); break;
    case 'tracked': g.add(box(0.5, 0.3, 0.12, GREY, 0, 0, 0.18), box(0.6, 0.08, 0.14, DARK, 0, 0.2, 0.07), box(0.6, 0.08, 0.14, DARK, 0, -0.2, 0.07)); break;
    case 'quadruped': g.add(box(0.5, 0.22, 0.12, GREY, 0, 0, 0.4), box(0.1, 0.12, 0.08, BLUE, 0.3, 0, 0.42)); [[0.2, 0.12], [0.2, -0.12], [-0.2, 0.12], [-0.2, -0.12]].forEach(([x, y]) => g.add(rod(V(x, y, 0.38), V(x + 0.05, y, 0.2), 0.025), rod(V(x + 0.05, y, 0.2), V(x, y, 0.02), 0.02, DARK))); break;
    case 'drone': g.add(box(0.12, 0.12, 0.05, GREY, 0, 0, 0.2)); [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(([x, y]) => { g.add(rod(V(0, 0, 0.2), V(0.17 * x, 0.17 * y, 0.2), 0.012, DARK)); const p = cyl(0.09, 0.005, BLUE, 0.17 * x, 0.17 * y, 0.23); (p.material as THREE.MeshStandardMaterial).opacity = 0.5; (p.material as THREE.MeshStandardMaterial).transparent = true; g.add(p); }); break;
    case 'plane': g.add(rod(V(-0.4, 0, 0.3), V(0.4, 0, 0.3), 0.05), box(0.15, 1.0, 0.015, BLUE, 0.05, 0, 0.3), box(0.08, 0.3, 0.01, GREY, -0.38, 0, 0.3), box(0.08, 0.01, 0.12, GREY, -0.38, 0, 0.36)); break;
    case 'sub': g.add(rod(V(-0.35, 0, 0.3), V(0.35, 0, 0.3), 0.1, 0xf59e0b), cyl(0.04, 0.06, DARK, -0.5, 0, 0.3, 'x'), box(0.02, 0.2, 0.01, GREY, -0.4, 0, 0.3)); break;
    case 'boat': g.add(box(0.8, 0.3, 0.12, GREY, 0, 0, 0.08), box(0.2, 0.2, 0.15, BLUE, -0.1, 0, 0.22)); break;
    case 'soft': for (let k = 0; k < 6; k++) g.add(sph(0.06 - k * 0.006, 0xf472b6, Math.sin(k * 0.5) * 0.05 * k, 0, 0.06 + k * 0.09)); break;
    case 'modular': for (let k = 0; k < 5; k++) g.add(box(0.1, 0.1, 0.1, k % 2 ? BLUE : GREY, (k % 3) * 0.11, Math.floor(k / 3) * 0.11, 0.05 + (k === 4 ? 0.11 : 0))); break;
    case 'swarm': for (let k = 0; k < 12; k++) g.add(sph(0.04, k % 3 ? GREY : BLUE, Math.cos(k * 2.4) * 0.05 * k, Math.sin(k * 2.4) * 0.05 * k, 0.05)); break;
    case 'companion': case 'companion-pocket': case 'companion-mobile': {
      const k = shape === 'companion-pocket' ? 0.6 : 1; const z0 = shape === 'companion-mobile' ? 0.06 : 0;
      if (shape === 'companion-mobile') g.add(box(0.16, 0.12, 0.04, DARK, 0, 0, 0.04), cyl(0.03, 0.015, DARK, 0, 0.07, 0.03, 'y'), cyl(0.03, 0.015, DARK, 0, -0.07, 0.03, 'y'));
      else if (shape === 'companion') g.add(cyl(0.05, 0.02, DARK, 0, 0, 0.01));
      g.add(box(0.07 * k, 0.07 * k, 0.05 * k, 0xf1f5f9, 0, 0, z0 + 0.045 * k)); // corps
      const hz = z0 + 0.11 * k; g.add(box(0.1 * k, 0.085 * k, 0.075 * k, 0xf8fafc, 0, 0, hz), box(0.008, 0.07 * k, 0.055 * k, 0x0f172a, 0.05 * k, 0, hz)); // tête + écran
      g.add(sph(0.009 * k, 0x38bdf8, 0.055 * k, 0.018 * k, hz + 0.006 * k), sph(0.009 * k, 0x38bdf8, 0.055 * k, -0.018 * k, hz + 0.006 * k), box(0.003, 0.016 * k, 0.003, 0x38bdf8, 0.055 * k, 0, hz - 0.014 * k)); // yeux + bouche
      g.add(rod(V(0, 0.04 * k, z0 + 0.06 * k), V(0.03 * k, 0.06 * k, z0 + 0.03 * k), 0.008 * k, BLUE), rod(V(0, -0.04 * k, z0 + 0.06 * k), V(0.03 * k, -0.06 * k, z0 + 0.03 * k), 0.008 * k, BLUE)); // bras
      if (shape === 'companion-pocket') g.add(rod(V(0, 0, hz + 0.04 * k), V(0, 0, hz + 0.07 * k), 0.003, DARK));
      break; }
    default: g.add(box(0.2, 0.2, 0.2, GREY, 0, 0, 0.1));
  }
  g.userData.label = 'modèle générique non validé';
  return g;
}
let thumbR: THREE.WebGLRenderer | null = null; const cache = new Map<string, string>();
/** Vignette procédurale (rendu hors-écran). */
export function thumbnail(shape: string): string {
  if (cache.has(shape)) return cache.get(shape)!;
  try {
    if (!thumbR) { thumbR = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: true }); thumbR.setSize(220, 150); }
    const sc = new THREE.Scene(); sc.add(new THREE.HemisphereLight(0xbfd9ff, 0x101820, 1.4)); const dl = new THREE.DirectionalLight(0xffffff, 1.5); dl.position.set(2, -2, 3); sc.add(dl);
    const o = buildProcedural(shape); sc.add(o); const b = new THREE.Box3().setFromObject(o); const c = b.getCenter(new THREE.Vector3()); const s = b.getSize(new THREE.Vector3()).length();
    const cam = new THREE.PerspectiveCamera(35, 220 / 150, 0.01, 50); cam.up.set(0, 0, 1); cam.position.set(c.x + s * 1.1, c.y - s * 1.3, c.z + s * 0.7); cam.lookAt(c);
    thumbR.render(sc, cam); const url = thumbR.domElement.toDataURL(); cache.set(shape, url); return url;
  } catch { return ''; }
}
