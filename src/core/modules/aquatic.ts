export const RHO_FRESH = 1000, RHO_SEA = 1025, G = 9.81;
export const buoyancy = (volumeM3: number, rho = RHO_SEA) => rho * G * volumeM3;
/** Flottabilité nette (N) : >0 remonte, <0 coule. */
export const netBuoyancy = (mass: number, volume: number, rho = RHO_SEA) => buoyancy(volume, rho) - mass * G;
/** Vitesse limite sous traînée quadratique : F = ½ρ·Cd·A·v² → v = √(2F/(ρ·Cd·A)). Cd fourni par l'utilisateur. */
export const terminalSpeed = (force: number, cd: number, area: number, rho = RHO_SEA) => Math.sqrt((2 * Math.abs(force)) / (rho * cd * area));
export const dragForce = (v: number, cd: number, area: number, rho = RHO_SEA) => 0.5 * rho * cd * area * v * v;
