import { HYDROGEN_BURNING_MASS, M_JUP, M_SUN, YR } from "./constants";
import type { PebbleRegime } from "./accretion";

export type ObjectClass = "planet" | "browndwarf" | "duststar";
export type ObjectFate = "frozen" | "growing" | "star" | "bhProgenitor" | "imbhProgenitor";

export interface FateInput {
  mass: number;
  doublingTime: number;
  thermalMass: number;
  regime: PebbleRegime;
  agnLifetimeYr: number;
}

export interface FateSummary {
  objectClass: ObjectClass;
  fate: ObjectFate;
  efoldings: number;
  projectedMass: number;
}

export const DEUTERIUM_BURNING_MASS = 13 * M_JUP;
export const BH_PROGENITOR_MASS = 30 * M_SUN;
export const IMBH_DIRECT_COLLAPSE_MASS = 300 * M_SUN;

export function objectClass(mass: number): ObjectClass {
  if (mass < DEUTERIUM_BURNING_MASS) return "planet";
  if (mass < HYDROGEN_BURNING_MASS) return "browndwarf";
  return "duststar";
}

export function fateOf(input: FateInput): FateSummary {
  const efoldings = (input.agnLifetimeYr * YR) / input.doublingTime;
  const cls = objectClass(input.mass);
  if (!(efoldings >= 1)) {
    return { objectClass: cls, fate: "frozen", efoldings, projectedMass: input.mass };
  }
  const ceiling = Math.max(input.thermalMass, input.mass);
  const projectedMass = Math.min(input.mass * Math.exp(Math.min(efoldings, 700)), ceiling);
  let fate: ObjectFate = "growing";
  if (projectedMass >= IMBH_DIRECT_COLLAPSE_MASS) fate = "imbhProgenitor";
  else if (projectedMass >= BH_PROGENITOR_MASS) fate = "bhProgenitor";
  else if (projectedMass >= HYDROGEN_BURNING_MASS) fate = "star";
  return { objectClass: cls, fate, efoldings, projectedMass };
}

export const CLASS_LABEL: Record<ObjectClass, string> = {
  planet: "Planet, under 13 Jupiter masses",
  browndwarf: "Brown-dwarf mass, 13–79 Jupiter masses",
  duststar: "Stellar-mass pure-dust body",
};

export const FATE_LABEL: Record<ObjectFate, string> = {
  frozen: "Keeps its birth mass",
  growing: "Grows, stays sub-stellar",
  star: "Core-accretion star",
  bhProgenitor: "Massive star → black hole",
  imbhProgenitor: "Direct-collapse IMBH candidate",
};
