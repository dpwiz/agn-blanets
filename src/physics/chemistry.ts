import { frostPoint } from "./ice";

export const ELEMENTS = ["H", "He", "C", "N", "O", "Mg", "Si", "S", "Fe"] as const;
export type Element = (typeof ELEMENTS)[number];
export type Composition = Record<Element, number>;

export const SOLAR: Composition = { H: 0.7154, He: 0.2703, C: 2.4e-3, N: 7e-4, O: 5.7e-3, Mg: 7e-4, Si: 6.7e-4, S: 3.1e-4, Fe: 1.3e-3 };

export const SULFIDE_FRONT_K = 700;
export const ORGANICS_FRONT_K = 500;
const SULFIDE_WIDTH_K = 20;
const ORGANICS_WIDTH_K = 25;
const WATER_SHARE_OF_OXYGEN = 0.45;
const ROCK_SHARE_OF_OXYGEN = 0.23;
const ORGANIC_SHARE_OF_CARBON = 0.5;
const ORGANIC_SHARE_OF_NITROGEN = 0.1;
const HYDROGEN_PER_OXYGEN_IN_WATER = 2.016 / 15.999;
const WATER_PER_OXYGEN = 18.015 / 15.999;

export type ElementGroup = "hydrogen" | "water" | "carbon" | "sulfur" | "metals";
export const ELEMENT_GROUPS: ElementGroup[] = ["hydrogen", "water", "carbon", "sulfur", "metals"];
export const GROUP_LABEL: Record<ElementGroup, string> = {
  hydrogen: "Hydrogen",
  water: "Water",
  carbon: "Carbon",
  sulfur: "Sulfur",
  metals: "Iron and metals",
};

const below = (temperature: number, front: number, width: number) => 1 / (1 + Math.exp((temperature - front) / width));

export function iceOnGrains(temperature: number, gasParticlesPerM3: number): number {
  return gasParticlesPerM3 > 0 && temperature < frostPoint(gasParticlesPerM3) ? 1 : 0;
}

function condensedShare(el: Element, temperature: number, ice: number): number {
  const organics = below(temperature, ORGANICS_FRONT_K, ORGANICS_WIDTH_K);
  switch (el) {
    case "H":
    case "He":
      return 0;
    case "C":
      return ORGANIC_SHARE_OF_CARBON * organics;
    case "N":
      return ORGANIC_SHARE_OF_NITROGEN * organics;
    case "O":
      return ROCK_SHARE_OF_OXYGEN + WATER_SHARE_OF_OXYGEN * ice;
    case "S":
      return below(temperature, SULFIDE_FRONT_K, SULFIDE_WIDTH_K);
    default:
      return 1;
  }
}

const total = (c: Composition) => ELEMENTS.reduce((a, el) => a + c[el], 0);

function normalised(c: Composition): Composition {
  const sum = total(c);
  const out = {} as Composition;
  for (const el of ELEMENTS) out[el] = c[el] / sum;
  return out;
}

const waterOxygen = (ice: number) => SOLAR.O * WATER_SHARE_OF_OXYGEN * ice;

function rawGrains(temperature: number, ice: number): Composition {
  const out = {} as Composition;
  for (const el of ELEMENTS) out[el] = SOLAR[el] * condensedShare(el, temperature, ice);
  out.H = waterOxygen(ice) * HYDROGEN_PER_OXYGEN_IN_WATER;
  return out;
}

function rawGas(temperature: number, ice: number): Composition {
  const out = {} as Composition;
  for (const el of ELEMENTS) out[el] = SOLAR[el] * (1 - condensedShare(el, temperature, ice));
  out.H = SOLAR.H - waterOxygen(ice) * HYDROGEN_PER_OXYGEN_IN_WATER;
  return out;
}

export function grainComposition(temperature: number, ice: number): Composition {
  return normalised(rawGrains(temperature, ice));
}

export function gasComposition(temperature: number, ice: number): Composition {
  return normalised(rawGas(temperature, ice));
}

export function grainWaterShare(temperature: number, ice: number): number {
  return (waterOxygen(ice) * WATER_PER_OXYGEN) / total(rawGrains(temperature, ice));
}

export function gasWaterShare(temperature: number, ice: number): number {
  return (waterOxygen(1 - ice) * WATER_PER_OXYGEN) / total(rawGas(temperature, ice));
}

export function groupShare(group: ElementGroup, mix: Composition, water: number): number {
  switch (group) {
    case "hydrogen":
      return mix.H;
    case "water":
      return water;
    case "carbon":
      return mix.C;
    case "sulfur":
      return mix.S;
    case "metals":
      return mix.Fe;
  }
}
