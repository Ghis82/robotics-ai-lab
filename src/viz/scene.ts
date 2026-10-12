// Module de VISUALISATION uniquement : il affiche les résultats du moteur, il ne calcule aucune physique.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { RobotModel } from '../core/model';
import type { FKResult } from '../core/kinematics';
import type { Contact } from '../core/collision';
import type { Vec3 } from '../core/math';
const v = (a: Vec3) => new THREE.Vector3(a[0], a[1], a[2]);
export class Viewer {
  renderer: THREE.WebGLRenderer; scene = new THREE.Scene(); camera: THREE.PerspectiveCamera; controls: OrbitControls;
  robot = new THREE.Group(); imported = new THREE.Group(); links: THREE.Mesh[] = []; axes: THREE.ArrowHelper[] = [];
  obstacles: THREE.Mesh[] = []; base?: THREE.Mesh; com = new THREE.Mesh(new THREE.SphereGeometry(0.015), new THREE.MeshBasicMaterial({ color: 0xffcc00 }));
  footprint?: THREE.Mesh; trail = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x3fa9ff }));
  showAxes = true; showCapsules = true;
  constructor(private el: HTMLElement) {
    THREE.Object3D.DEFAULT_UP.set(0, 0, 1);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); el.appendChild(this.renderer.domElement);
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.01, 50); this.camera.up.set(0, 0, 1); this.resetView();
    this.controls = new OrbitControls(this.camera, this.renderer.domElement); this.controls.target.set(0, 0, 0.35); this.controls.enableDamping = true;
    this.scene.background = new THREE.Color(0x0b1220);
    this.scene.add(new THREE.HemisphereLight(0xbfd9ff, 0x101820, 1.2));
    const d = new THREE.DirectionalLight(0xffffff, 1.5); d.position.set(2, -2, 4); this.scene.add(d);
    const grid = new THREE.GridHelper(2, 20, 0x2a6fdb, 0x1c2a44); grid.rotation.x = Math.PI / 2; this.scene.add(grid);
    this.scene.add(new THREE.AxesHelper(0.2), this.robot, this.imported, this.com, this.trail);
    new ResizeObserver(() => this.resize()).observe(el); this.resize();
    const loop = () => { requestAnimationFrame(loop); this.controls.update(); this.renderer.render(this.scene, this.camera); }; loop();
  }
  resetView() { this.camera.position.set(1.3, -1.3, 1.0); this.controls?.target.set(0, 0, 0.35); }
  resize() { const w = this.el.clientWidth, h = this.el.clientHeight || 1; this.renderer.setSize(w, h); this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }
  build(m: RobotModel) {
    this.robot.clear(); this.links = []; this.axes = []; this.obstacles = [];
    this.base = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, m.baseHeight, 32), new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.5, roughness: 0.4 }));
    this.base.rotation.x = Math.PI / 2; this.base.position.z = m.baseHeight / 2; this.robot.add(this.base);
    if (m.baseFootprintRadius) { this.footprint = new THREE.Mesh(new THREE.RingGeometry(m.baseFootprintRadius - 0.004, m.baseFootprintRadius, 64), new THREE.MeshBasicMaterial({ color: 0x3fa9ff, side: THREE.DoubleSide })); this.footprint.position.z = 0.001; this.robot.add(this.footprint); }
    m.links.forEach((l, i) => {
      const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(l.radius, Math.max(l.length, 1e-4), 8, 24), new THREE.MeshStandardMaterial({ color: i % 2 ? 0xd7dee8 : 0x9aa7b8, metalness: 0.4, roughness: 0.35, transparent: true, opacity: 0.95 }));
      this.links.push(mesh); this.robot.add(mesh);
      const ar = new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(), 0.12, 0x3fa9ff, 0.03, 0.02); this.axes.push(ar); this.robot.add(ar);
    });
    m.obstacles.forEach((o) => { const s = new THREE.Mesh(new THREE.SphereGeometry(o.radius, 32, 16), new THREE.MeshStandardMaterial({ color: 0xe11d48, transparent: true, opacity: 0.35 })); s.position.copy(v(o.center)); this.obstacles.push(s); this.robot.add(s); });
  }
  update(m: RobotModel, fk: FKResult, contacts: Contact[], com: Vec3 | null) {
    const hit = new Set<number>(); contacts.forEach((c) => { hit.add(c.a); if (typeof c.b === 'number') hit.add(c.b); });
    fk.segments.forEach(([a, b], i) => {
      const mesh = this.links[i]; if (!mesh) return; const A = v(a), B = v(b); const dir = B.clone().sub(A);
      mesh.position.copy(A.clone().add(B).multiplyScalar(0.5));
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.lengthSq() > 0 ? dir.normalize() : new THREE.Vector3(0, 0, 1));
      (mesh.material as THREE.MeshStandardMaterial).emissive.set(hit.has(i) ? 0xff0000 : 0x000000);
      mesh.visible = this.showCapsules;
      const ar = this.axes[i]; ar.position.copy(v(fk.jointOrigins[i])); ar.setDirection(v(fk.jointAxes[i]).normalize()); ar.visible = this.showAxes;
    });
    const obsHit = new Set(contacts.filter((c) => c.kind === 'obstacle').map((c) => c.b));
    this.obstacles.forEach((o, i) => ((o.material as THREE.MeshStandardMaterial).opacity = obsHit.has(m.obstacles[i].name) ? 0.8 : 0.35));
    this.com.visible = !!com; if (com) this.com.position.set(com[0], com[1], 0.003);
  }
  setTrail(points: Vec3[]) { this.trail.geometry.dispose(); this.trail.geometry = new THREE.BufferGeometry().setFromPoints(points.map(v)); }
  showImported(obj: THREE.Object3D | null) { this.imported.clear(); this.robot.visible = !obj; this.trail.visible = this.com.visible = !obj; if (obj) this.imported.add(obj); }
}
