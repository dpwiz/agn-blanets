import { K_B, M_H } from "./constants";
import { diskAt } from "./disk";
import { bisectLog } from "./math";
import type { ModelParams } from "./params";
import { PC } from "./constants";

export const SOLAR_OXYGEN_PER_HYDROGEN = 4.9e-4;
export const WATER_SHARE_OF_OXYGEN = 0.45;
export const GAS_PARTICLES_PER_HYDROGEN = 0.585;
export const WATER_PER_GAS_PARTICLE = (SOLAR_OXYGEN_PER_HYDROGEN * WATER_SHARE_OF_OXYGEN) / GAS_PARTICLES_PER_HYDROGEN;

const COLDEST_FROST_K = 20;
const WARMEST_FROST_K = 400;

export function iceVapourPressure(temperature: number): number {
  return Math.exp(9.550426 - 5723.265 / temperature + 3.53068 * Math.log(temperature) - 0.00728332 * temperature);
}

export function frostPoint(gasParticlesPerM3: number): number {
  const excess = (t: number) => iceVapourPressure(t) - WATER_PER_GAS_PARTICLE * gasParticlesPerM3 * K_B * t;
  return bisectLog(excess, COLDEST_FROST_K, WARMEST_FROST_K, 80) ?? COLDEST_FROST_K;
}

export interface FrostLine {
  radius: number | null;
  frostyInside: boolean;
  everywhere: boolean;
}

export function frostLine(p: ModelParams, gasFraction: number): FrostLine {
  const margin = (r: number) => {
    const d = diskAt(r, p);
    return frostPoint((gasFraction * d.rho) / (p.meanMolecularWeight * M_H)) - d.temperature;
  };
  const inner = p.rMinPc * PC;
  const outer = p.rMaxPc * PC;
  const frostyInside = margin(inner) > 0;
  const radius = gasFraction > 0 ? bisectLog(margin, inner, outer, 80) : null;
  return { radius, frostyInside, everywhere: radius === null && frostyInside && gasFraction > 0 };
}
