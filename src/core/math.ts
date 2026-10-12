// Mathématiques vectorielles minimales — aucune dépendance à Three.js.
export type Vec3 = [number, number, number];
export type Mat3 = number[]; // ligne-major 3x3
export interface Frame { R: Mat3; p: Vec3 }
export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const norm = (a: Vec3) => Math.sqrt(dot(a, a));
export const normalize = (a: Vec3): Vec3 => { const n = norm(a); return n > 0 ? scale(a, 1 / n) : [0, 0, 1]; };
export const I3: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
export function matMul(A: Mat3, B: Mat3): Mat3 {
  const C = new Array(9).fill(0);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) C[i * 3 + j] += A[i * 3 + k] * B[k * 3 + j];
  return C;
}
export const matVec = (A: Mat3, v: Vec3): Vec3 => [A[0] * v[0] + A[1] * v[1] + A[2] * v[2], A[3] * v[0] + A[4] * v[1] + A[5] * v[2], A[6] * v[0] + A[7] * v[1] + A[8] * v[2]];
/** Rotation de Rodrigues autour d'un axe unitaire. */
export function axisAngle(axis: Vec3, q: number): Mat3 {
  const [x, y, z] = normalize(axis); const c = Math.cos(q), s = Math.sin(q), t = 1 - c;
  return [t * x * x + c, t * x * y - s * z, t * x * z + s * y, t * x * y + s * z, t * y * y + c, t * y * z - s * x, t * x * z - s * y, t * y * z + s * x, t * z * z + c];
}
export const deg = (r: number) => (r * 180) / Math.PI;
export const rad = (d: number) => (d * Math.PI) / 180;
