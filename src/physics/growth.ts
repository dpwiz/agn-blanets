import { bondiGasCoefficient, gasBondiHillMass, hillGasRatio } from "./accretion";
import { HYDROGEN_BURNING_MASS } from "./constants";
import type { RadialState } from "./model";

export const GAS_HYDROGEN_FRACTION = 0.7;
export const MIN_STELLAR_HYDROGEN = GAS_HYDROGEN_FRACTION * HYDROGEN_BURNING_MASS;

const BISECTION_STEPS = 80;

export interface GrowthLimits {
  dustLeftPerBody: number;
  thermalMass: number;
  bondiCoefficient: number;
  bondiHillMass: number;
  hillRatio: number;
}

const limitsCache = new WeakMap<RadialState, GrowthLimits>();

export function growthLimits(state: RadialState): GrowthLimits {
  const hit = limitsCache.get(state);
  if (hit) return hit;
  const limits = {
    dustLeftPerBody: Math.max(state.dustPerBody - state.planetesimalMass, 0),
    thermalMass: state.thermalMass,
    bondiCoefficient: bondiGasCoefficient(state.disk),
    bondiHillMass: gasBondiHillMass(state.disk),
    hillRatio: hillGasRatio(state.disk),
  };
  limitsCache.set(state, limits);
  return limits;
}

export function gasGathered(from: number, to: number, limits: GrowthLimits): number {
  if (!(to > from)) return 0;
  let gas = 0;
  const switchMass = limits.bondiHillMass;
  if (from < switchMass) {
    const k = Math.sqrt(limits.bondiCoefficient);
    const top = Math.min(to, switchMass);
    gas += Math.max(top - from - (Math.atan(k * top) - Math.atan(k * from)) / k, 0);
  }
  if (to > switchMass) gas += (limits.hillRatio / (1 + limits.hillRatio)) * (to - Math.max(from, switchMass));
  return gas;
}

function dustEaten(from: number, to: number, limits: GrowthLimits): number {
  return to - from - gasGathered(from, to, limits);
}

function bisectMass(from: number, to: number, below: (m: number) => boolean): number {
  let lo = from;
  let hi = to;
  for (let i = 0; i < BISECTION_STEPS; i++) {
    const mid = 0.5 * (lo + hi);
    if (below(mid)) lo = mid;
    else hi = mid;
  }
  return 0.5 * (lo + hi);
}

export function supplyMass(birthMass: number, limits: GrowthLimits): number {
  if (!(limits.dustLeftPerBody > 0)) return birthMass;
  const richestGasRatio = Math.max(limits.hillRatio, limits.bondiCoefficient * limits.bondiHillMass ** 2);
  const highest = birthMass + limits.dustLeftPerBody * (1 + richestGasRatio);
  return bisectMass(birthMass, highest, (m) => dustEaten(birthMass, m, limits) < limits.dustLeftPerBody);
}

export function grownMass(birthMass: number, efoldings: number, supply: number, ceiling: number): number {
  if (!(supply > birthMass) || !(efoldings > 0)) return birthMass;
  const rate = supply / (supply - birthMass);
  const mass = supply / (1 + (supply / birthMass - 1) * Math.exp(-Math.min(efoldings * rate, 700)));
  return Math.min(mass, Math.max(ceiling, birthMass));
}

export function efoldingsToReach(birthMass: number, target: number, supply: number): number {
  if (target <= birthMass) return 0;
  if (!(target < supply)) return Infinity;
  return ((supply - birthMass) / supply) * Math.log((supply / birthMass - 1) / (supply / target - 1));
}

export function hydrogenMass(birthMass: number, mass: number, limits: GrowthLimits): number {
  return GAS_HYDROGEN_FRACTION * gasGathered(birthMass, mass, limits);
}

export function burnsHydrogen(birthMass: number, mass: number, limits: GrowthLimits): boolean {
  return hydrogenMass(birthMass, mass, limits) >= MIN_STELLAR_HYDROGEN;
}

export function ignitionMass(birthMass: number, reachable: number, limits: GrowthLimits): number | null {
  if (!burnsHydrogen(birthMass, reachable, limits)) return null;
  return bisectMass(birthMass, reachable, (m) => !burnsHydrogen(birthMass, m, limits));
}
