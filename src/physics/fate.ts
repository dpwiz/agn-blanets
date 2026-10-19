import { HYDROGEN_BURNING_MASS, M_JUP, M_SUN, YR } from "./constants";
import type { PebbleRegime } from "./accretion";
import { grownMass, hydrogenMass, MIN_STELLAR_HYDROGEN, supplyMass, type GrowthLimits } from "./growth";

export type ObjectClass = "planet" | "browndwarf" | "duststar";
export type ObjectFate = "frozen" | "growing" | "unlit" | "star" | "bhProgenitor" | "imbhProgenitor";

export interface FateInput {
  mass: number;
  doublingTime: number;
  limits: GrowthLimits;
  regime: PebbleRegime;
  agnLifetimeYr: number;
}

export interface FateSummary {
  objectClass: ObjectClass;
  fate: ObjectFate;
  efoldings: number;
  projectedMass: number;
  hydrogenMass: number;
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
    return { objectClass: cls, fate: "frozen", efoldings, projectedMass: input.mass, hydrogenMass: 0 };
  }
  const projectedMass = grownMass(input.mass, efoldings, supplyMass(input.mass, input.limits), input.limits.thermalMass);
  const hydrogen = hydrogenMass(input.mass, projectedMass, input.limits);
  return { objectClass: cls, fate: fateFor(projectedMass, hydrogen), efoldings, projectedMass, hydrogenMass: hydrogen };
}

function fateFor(mass: number, hydrogen: number): ObjectFate {
  if (hydrogen < MIN_STELLAR_HYDROGEN) return mass >= HYDROGEN_BURNING_MASS ? "unlit" : "growing";
  if (mass >= IMBH_DIRECT_COLLAPSE_MASS) return "imbhProgenitor";
  if (mass >= BH_PROGENITOR_MASS) return "bhProgenitor";
  return "star";
}

export const CLASS_LABEL: Record<ObjectClass, string> = {
  planet: "Planet, under 13 Jupiter masses",
  browndwarf: "Brown-dwarf mass, 13–79 Jupiter masses",
  duststar: "Stellar-mass pure-dust body",
};

export const FATE_LABEL: Record<ObjectFate, string> = {
  frozen: "Keeps its birth mass",
  growing: "Grows, stays sub-stellar",
  unlit: "Grows to stellar mass, too little hydrogen to shine",
  star: "Core-accretion star",
  bhProgenitor: "Massive star → black hole",
  imbhProgenitor: "Direct-collapse IMBH candidate",
};
