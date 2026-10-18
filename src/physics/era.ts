import { G, HYDROGEN_BURNING_MASS, M_JUP, M_SUN, PC, SIGMA_SB, YR } from "./constants";
import { dustOpacity } from "./comms";
import { diskAt } from "./disk";
import { DEUTERIUM_BURNING_MASS } from "./fate";
import { bisectLog } from "./math";
import type { RadialState } from "./model";
import type { ModelParams } from "./params";

export type Stage = "dust" | "never" | "planet" | "browndwarf" | "dustStar" | "star" | "massiveStar" | "remnant";

export const MASSIVE_STAR_MASS = 8 * M_SUN;
export const SUN_LIFETIME_YR = 1e10;
export const STELLAR_LIFETIME_SLOPE = 2.5;
export const SHORTEST_STELLAR_LIFETIME_YR = 3e6;
export const GAS_CLEARING_FRACTION = 0.2;
export const EPOCH_MIN_YR = 1e3;
export const EPOCH_MAX_YR = 1e10;
export const SOLAR_CONSTANT = 1361;
export const VISIBLE_WAVELENGTH = 0.55e-6;

export interface GrowthTrack {
  birthMass: number;
  bornYr: number;
  efoldingTimeYr: number;
  ceilingMass: number;
  growthEndsYr: number;
}

export interface EpochState {
  stage: Stage;
  mass: number;
  ignitedYr: number | null;
  diesYr: number | null;
}

export function formsDuringAgn(state: RadialState): boolean {
  return state.streamingAllowed && state.grainsGrowInTime;
}

export function growthTrack(state: RadialState, birthMass: number, efoldingTime: number, p: ModelParams): GrowthTrack {
  return {
    birthMass,
    bornYr: formsDuringAgn(state) ? state.dust.tSI / YR : Infinity,
    efoldingTimeYr: efoldingTime / YR,
    ceilingMass: Math.max(state.thermalMass, birthMass),
    growthEndsYr: p.agnLifetimeYr,
  };
}

export function massAtAge(track: GrowthTrack, ageYr: number): number {
  if (!(ageYr > track.bornYr)) return track.birthMass;
  const grown = Math.max(Math.min(ageYr, track.growthEndsYr) - track.bornYr, 0);
  const exponent = Math.min(grown / track.efoldingTimeYr, 700);
  return Math.min(track.birthMass * Math.exp(exponent), track.ceilingMass);
}

export function stellarLifetimeYr(mass: number): number {
  return Math.max(SUN_LIFETIME_YR * (mass / M_SUN) ** -STELLAR_LIFETIME_SLOPE, SHORTEST_STELLAR_LIFETIME_YR);
}

export function ignitionMass(birthMass: number): number {
  return birthMass < HYDROGEN_BURNING_MASS ? HYDROGEN_BURNING_MASS : birthMass * Math.E;
}

export function ignitionYr(track: GrowthTrack): number | null {
  if (!Number.isFinite(track.bornYr)) return null;
  const threshold = ignitionMass(track.birthMass);
  if (track.ceilingMass < threshold) return null;
  const t = track.bornYr + track.efoldingTimeYr * Math.log(threshold / track.birthMass);
  return t <= track.growthEndsYr ? t : null;
}

export function epochState(track: GrowthTrack, ageYr: number): EpochState {
  if (!Number.isFinite(track.bornYr)) return { stage: "never", mass: track.birthMass, ignitedYr: null, diesYr: null };
  if (ageYr < track.bornYr) return { stage: "dust", mass: track.birthMass, ignitedYr: null, diesYr: null };
  const mass = massAtAge(track, ageYr);
  if (mass < DEUTERIUM_BURNING_MASS) return { stage: "planet", mass, ignitedYr: null, diesYr: null };
  const ignited = ignitionYr(track);
  if (ignited === null || ageYr < ignited) {
    return { stage: mass < HYDROGEN_BURNING_MASS ? "browndwarf" : "dustStar", mass, ignitedYr: ignited, diesYr: null };
  }
  const diesYr = ignited + stellarLifetimeYr(mass);
  if (ageYr >= diesYr) return { stage: "remnant", mass, ignitedYr: ignited, diesYr };
  return { stage: mass >= MASSIVE_STAR_MASS ? "massiveStar" : "star", mass, ignitedYr: ignited, diesYr };
}

export function agnShining(ageYr: number, p: ModelParams): boolean {
  return ageYr < p.agnLifetimeYr;
}

export function gasRemaining(ageYr: number, p: ModelParams): number {
  const end = p.agnLifetimeYr;
  if (ageYr <= end) return 1;
  return Math.max(1 - (ageYr - end) / (GAS_CLEARING_FRACTION * end), 0);
}

export function radiusWhereTemperature(temperature: number, p: ModelParams): number | null {
  return bisectLog((r) => diskAt(r, p).temperature - temperature, p.rMinPc * PC, p.rMaxPc * PC, 80);
}

export interface LivingConditions {
  glowLuminosity: number;
  glowTemperature: number;
  earthLightDistance: number;
  skyOpticalDepth: number;
  surfaceHeight: number;
  climbSpeed: number;
  agnFlux: number;
}

export function livingConditions(state: RadialState, mass: number, radius: number, accretionRate: number, p: ModelParams): LivingConditions {
  const glowLuminosity = (G * mass * accretionRate) / radius;
  const surfaceHeight = p.photosphereHeightOverH * state.disk.H;
  return {
    glowLuminosity,
    glowTemperature: (glowLuminosity / (4 * Math.PI * radius * radius * SIGMA_SB)) ** 0.25,
    earthLightDistance: Math.sqrt(glowLuminosity / (4 * Math.PI * SOLAR_CONSTANT)),
    skyOpticalDepth: 0.5 * state.disk.sigma * p.metallicity * dustOpacity(state.dust.aMax, VISIBLE_WAVELENGTH, p.grainDensity),
    surfaceHeight,
    climbSpeed: state.disk.omega * surfaceHeight,
    agnFlux: p.irradiationLuminosity / (4 * Math.PI * state.disk.r * state.disk.r),
  };
}

export const LOG_HYDROGEN_BURNING_MJUP = Math.log10(HYDROGEN_BURNING_MASS / M_JUP);
export const LOG_DEUTERIUM_BURNING_MJUP = Math.log10(DEUTERIUM_BURNING_MASS / M_JUP);
export const LOG_MASSIVE_STAR_MJUP = Math.log10(MASSIVE_STAR_MASS / M_JUP);
