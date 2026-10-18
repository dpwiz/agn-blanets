export const G = 6.6743e-11;
export const C_LIGHT = 2.99792458e8;
export const K_B = 1.380649e-23;
export const M_H = 1.6726e-27;
export const SIGMA_SB = 5.670374e-8;

export const M_SUN = 1.98847e30;
export const M_JUP = 1.89813e27;
export const M_EARTH = 5.9722e24;
export const L_SUN = 3.828e26;

export const PC = 3.0857e16;
export const AU = 1.495978707e11;
export const LY = 9.4607e15;
export const YR = 3.15576e7;
export const MYR = 1e6 * YR;
export const DAY = 86400;

export const HYDROGEN_BURNING_MASS = 0.075 * M_SUN;
export const EDDINGTON_LUMINOSITY_PER_MSUN = 1.26e31;

export const pc = (x: number) => x * PC;
export const toPc = (meters: number) => meters / PC;
export const msun = (x: number) => x * M_SUN;
export const toMjup = (kg: number) => kg / M_JUP;
export const toMsun = (kg: number) => kg / M_SUN;
export const toYr = (s: number) => s / YR;
export const toMyr = (s: number) => s / MYR;
