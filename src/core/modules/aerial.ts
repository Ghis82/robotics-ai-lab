const G = 9.81;
export const thrustToWeight = (totalThrustN: number, massKg: number) => totalThrustN / (massKg * G);
/** Gaz en vol stationnaire, hypothèse poussée ∝ commande (linéaire) — hypothèse simplificatrice explicite. */
export const hoverThrottle = (totalThrustN: number, massKg: number) => (massKg * G) / totalThrustN;
/** Dynamique verticale 1D d'une masse ponctuelle : m·z'' = T − m·g, sans aérodynamique, intégration semi-implicite. */
export function verticalClimb(mass: number, thrust: number, duration: number, dt = 0.01) {
  const t: number[] = [], z: number[] = [], v: number[] = []; let zz = 0, vv = 0;
  for (let k = 0; k * dt <= duration + 1e-9; k++) { t.push(k * dt); z.push(zz); v.push(vv); const a = thrust / mass - G; vv += a * dt; zz += vv * dt; if (zz < 0) { zz = 0; vv = Math.max(0, vv); } }
  return { t, z, v };
}
export const enduranceEstimate = (batteryWh: number, hoverPowerW: number) => (batteryWh / hoverPowerW) * 60; // min
