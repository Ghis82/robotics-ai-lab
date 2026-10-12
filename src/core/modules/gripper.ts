/** Effort de serrage minimal (préhension par frottement) : F ≥ m·(g + a)/(n·μ). */
export const requiredGripForce = (mass: number, mu: number, nContacts: number, accel = 0, g = 9.81) => (mass * (g + accel)) / (nContacts * mu);
