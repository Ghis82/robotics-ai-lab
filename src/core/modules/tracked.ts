/** Cinématique « skid-steer » (chenilles) avec facteur de glissement χ ≥ 1 (hypothèse : modèle empirique, χ fourni par l'utilisateur).
 *  v = (vl + vr)/2 ; ω = (vr − vl)/(χ·B). χ = 1 → pas de glissement (cas idéal, irréaliste pour des chenilles). */
export function skidSteer(vl: number, vr: number, track: number, chi = 1) {
  if (chi < 1) throw new Error('χ doit être ≥ 1');
  const v = (vl + vr) / 2, w = (vr - vl) / (chi * track); return { v, w, radius: Math.abs(w) < 1e-12 ? Infinity : v / w };
}
/** Intégration de la pose (x, y, θ) à vitesses constantes. */
export function integratePose(v: number, w: number, T: number, dt = 0.01) {
  let x = 0, y = 0, th = 0; const xs = [0], ys = [0];
  for (let t = 0; t < T - 1e-12; t += dt) { x += v * Math.cos(th) * dt; y += v * Math.sin(th) * dt; th += w * dt; xs.push(x); ys.push(y); }
  return { x, y, th, xs, ys };
}
/** Couple de rotation sur place (ordre de grandeur) : M ≈ μ_lat·m·g·L/4 (pression uniforme, modèle de Bekker simplifié). */
export const pivotResistMoment = (muLat: number, mass: number, contactL: number, g = 9.81) => (muLat * mass * g * contactL) / 4;
