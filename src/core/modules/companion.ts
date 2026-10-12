// Robots compagnons (bureau / poche / mobile) : couples statiques des micro-servos, basculement sur bureau, autonomie. Pur TS.
export const G0 = 9.81;
/** Couple gravitaire statique max de la tête autour de l'axe de tilt (CdM à distance d du pivot, inclinaison max θ par rapport à la verticale). */
export const headTiltTorque = (m: number, d: number, tiltMaxDeg: number) => m * G0 * d * Math.sin(Math.min(Math.abs(tiltMaxDeg), 90) * Math.PI / 180);
/** Bras horizontal (pire cas) : CdM à L/2, éventuelle charge en bout. */
export const armTorque = (m: number, L: number, tip = 0) => G0 * (m * L / 2 + tip * L);
export interface TipInput { bodyMass: number; bodyComH: number; headMass: number; headPivotH: number; headD: number; tiltDeg: number; armMass: number; armL: number; baseR: number }
/** CdM global (plan sagittal x avant, z haut) tête inclinée vers l'avant et bras tendus vers l'avant (pire cas statique). */
export function companionCoM(i: TipInput) {
  const t = (i.tiltDeg * Math.PI) / 180; const parts = [{ m: i.bodyMass, x: 0, z: i.bodyComH }, { m: i.headMass, x: i.headD * Math.sin(t), z: i.headPivotH + i.headD * Math.cos(t) }, { m: 2 * i.armMass, x: i.armL / 2, z: i.headPivotH * 0.8 }];
  const M = parts.reduce((s, p) => s + p.m, 0); const x = parts.reduce((s, p) => s + p.m * p.x, 0) / M; const z = parts.reduce((s, p) => s + p.m * p.z, 0) / M;
  return { M, x, z, margin: i.baseR - Math.abs(x), tipAngleDeg: (Math.atan2(i.baseR - Math.abs(x), z) * 180) / Math.PI };
}
export const autonomyH = (Wh: number, P: number) => Wh / P;
