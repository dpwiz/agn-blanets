import { geometricRadius, hillRadius } from "./accretion";
import {
  gasComposition,
  gasWaterShare,
  grainComposition,
  grainWaterShare,
  groupShare,
  iceOnGrains,
  type ElementGroup,
} from "./chemistry";
import { C_LIGHT, M_H, YR } from "./constants";
import { diskAt } from "./disk";
import { accretionRateAt, agnShining, epochState, gasRemaining, growthTrack, livingConditions, type GrowthTrack, type Stage } from "./era";
import { GAS_HYDROGEN_FRACTION, gasGathered, growthLimits } from "./growth";
import { frostLine, type FrostLine } from "./ice";
import type { RadialState } from "./model";
import type { ModelParams } from "./params";
import type { PopulationSummary, RadialBin } from "./population";
import { brachistochrone } from "./torch";
import { hohmannTime } from "./transfer";

export const GLOWING_WORLD_POWER = 1e25;
export const MOON_ORBIT_MIN_BODY_RADII = 3;
export const HYDROGEN_WELL_FRACTION = 0.05;
export const TEMPERATE_MIN_K = 273;
export const TEMPERATE_MAX_K = 373;
export const SETTLING_YR = 1e3;
export const TORCH_ACCELERATION = 9.81;
export const CHEMICAL_EXHAUST_SPEED = 4.5e3;

export type Niche = "never" | "dustOnly" | "glowMoons" | "hydrogenWell" | "oven" | "temperate" | "frost" | "coldRock";
export type SpreadTech = "orbital" | "torch";

export interface Sky {
  ageYr: number;
  shining: boolean;
  gasFraction: number;
  frost: FrostLine;
}

export function skyAt(p: ModelParams, ageYr: number): Sky {
  const shining = agnShining(ageYr, p);
  const gasFraction = gasRemaining(ageYr, p);
  return { ageYr, shining, gasFraction, frost: frostLine(shining ? p : { ...p, irradiationLuminosity: 0 }, gasFraction) };
}

export function midplaneTemperature(state: RadialState, p: ModelParams, sky: Sky): number {
  return sky.shining ? state.disk.temperature : diskAt(state.disk.r, { ...p, irradiationLuminosity: 0 }).temperature;
}

export function frostHere(r: number, sky: Sky): boolean {
  const { frost } = sky;
  if (!(sky.gasFraction > 0)) return false;
  if (frost.everywhere) return true;
  if (frost.radius === null) return false;
  return frost.frostyInside ? r < frost.radius : r > frost.radius;
}

export interface BodyNow {
  stage: Stage;
  mass: number;
  radius: number;
  glow: number;
  earthLightDistance: number;
  hillRadius: number;
  gasMass: number;
  hydrogenFraction: number;
}

export function bodyNow(state: RadialState, track: GrowthTrack, p: ModelParams, ageYr: number): BodyNow {
  const e = epochState(track, ageYr);
  const radius = geometricRadius(e.mass, p);
  const live = livingConditions(state, e.mass, radius, accretionRateAt(track, ageYr), p);
  const gasMass = gasGathered(track.birthMass, e.mass, growthLimits(state));
  return {
    stage: e.stage,
    mass: e.mass,
    radius,
    glow: live.glowLuminosity,
    earthLightDistance: live.earthLightDistance,
    hillRadius: hillRadius(e.mass, state.disk),
    gasMass,
    hydrogenFraction: (GAS_HYDROGEN_FRACTION * gasMass) / e.mass,
  };
}

export function lightsItsMoons(glow: number, earthLightDistance: number, radius: number, hill: number): boolean {
  return glow >= GLOWING_WORLD_POWER && earthLightDistance > MOON_ORBIT_MIN_BODY_RADII * radius && earthLightDistance < hill;
}

const trackCache = new WeakMap<RadialState, { p: ModelParams; track: GrowthTrack }>();

export function ringTrack(state: RadialState, p: ModelParams): GrowthTrack {
  const hit = trackCache.get(state);
  if (hit && hit.p === p) return hit.track;
  const track = growthTrack(state, state.planetesimalMass, state.accretion.doublingTime, p);
  trackCache.set(state, { p, track });
  return track;
}

export function nicheAt(bin: RadialBin, p: ModelParams, sky: Sky): Niche {
  const state = bin.state;
  const track = ringTrack(state, p);
  if (!Number.isFinite(track.bornYr)) return "never";
  if (sky.ageYr < track.bornYr) return "dustOnly";
  const body = bodyNow(state, track, p, sky.ageYr);
  if (lightsItsMoons(body.glow, body.earthLightDistance, body.radius, body.hillRadius)) return "glowMoons";
  if (body.hydrogenFraction >= HYDROGEN_WELL_FRACTION) return "hydrogenWell";
  const T = midplaneTemperature(state, p, sky);
  if (sky.shining && T > TEMPERATE_MAX_K) return "oven";
  if (sky.shining && T >= TEMPERATE_MIN_K) return "temperate";
  if (!sky.shining && frostHere(state.disk.r, sky)) return "frost";
  return "coldRock";
}

export interface ResourceStock {
  inBodies: number;
  onGrains: number;
  inGas: number;
}

export function resourceAt(bin: RadialBin, p: ModelParams, sky: Sky, group: ElementGroup): ResourceStock {
  const state = bin.state;
  const area = Math.PI * (bin.rOuter ** 2 - bin.rInner ** 2);
  const bodiesPerArea = bin.planets / area;
  const particles = state.disk.rho / (p.meanMolecularWeight * M_H);
  const birthT = state.disk.temperature;
  const birthIce = iceOnGrains(birthT, particles);
  const track = ringTrack(state, p);
  let inBodies = 0;
  let rockPerArea = 0;
  if (Number.isFinite(track.bornYr) && sky.ageYr >= track.bornYr) {
    const body = bodyNow(state, track, p, sky.ageYr);
    const rock = body.mass - body.gasMass;
    rockPerArea = bodiesPerArea * rock;
    const fromRock = rock * groupShare(group, grainComposition(birthT, birthIce), grainWaterShare(birthT, birthIce));
    const fromGas = body.gasMass * groupShare(group, gasComposition(birthT, birthIce), gasWaterShare(birthT, birthIce));
    inBodies = bodiesPerArea * (fromRock + fromGas);
  }
  const T = midplaneTemperature(state, p, sky);
  const ice = iceOnGrains(T, particles * sky.gasFraction);
  const freeDust = Math.max(state.disk.sigma * p.metallicity - rockPerArea, 0) * sky.gasFraction;
  const gas = state.disk.sigma * sky.gasFraction;
  return {
    inBodies,
    onGrains: freeDust * groupShare(group, grainComposition(T, ice), grainWaterShare(T, ice)),
    inGas: gas * groupShare(group, gasComposition(T, ice), gasWaterShare(T, ice)),
  };
}

export interface Seed {
  radius: number;
  yr: number;
}

function hopYears(r1: number, r2: number, mSmbh: number, tech: SpreadTech): number {
  const travel = tech === "orbital" ? hohmannTime(r1, r2, mSmbh) : brachistochrone(Math.abs(r2 - r1), TORCH_ACCELERATION).coordinateTime;
  return travel / YR + SETTLING_YR;
}

export function settlementTimes(pop: PopulationSummary, p: ModelParams, seed: Seed, tech: SpreadTech): number[] {
  const bins = pop.bins;
  const mSmbh = bins[0].state.disk.mSmbh;
  const born = bins.map((b) => ringTrack(b.state, p).bornYr);
  const arrival = bins.map(() => Infinity);
  const found = bins.findIndex((b) => b.rOuter >= seed.radius);
  const start = found < 0 ? bins.length - 1 : found;
  if (!Number.isFinite(born[start])) return arrival;
  arrival[start] = Math.max(seed.yr, born[start]);
  for (const step of [1, -1]) {
    let t = arrival[start];
    for (let i = start + step; i >= 0 && i < bins.length; i += step) {
      t += hopYears(bins[i - step].rMid, bins[i].rMid, mSmbh, tech);
      if (!Number.isFinite(born[i])) continue;
      t = Math.max(t, born[i]);
      arrival[i] = t;
    }
  }
  return arrival;
}

export function lightReach(seed: Seed, ageYr: number): number {
  return Math.max(ageYr - seed.yr, 0) * YR * C_LIGHT;
}

export function kardashev(watts: number): number {
  return (Math.log10(watts) - 6) / 10;
}

export interface NicheZone {
  key: string;
  inner: number;
  outer: number;
}

export interface CivRoute {
  name: string;
  from: number;
  to: number;
}

const zoneCentre = (z: NicheZone) => Math.sqrt(z.inner * z.outer);
const widest = (zones: NicheZone[]) => zones.reduce<NicheZone | null>((best, z) => (!best || z.outer / z.inner > best.outer / best.inner ? z : best), null);

export function nicheRoutes(zones: NicheZone[]): CivRoute[] {
  const living = zones.filter((z) => z.key !== "never" && z.key !== "dustOnly");
  const routes: CivRoute[] = [];
  const well = widest(living.filter((z) => z.key === "hydrogenWell"));
  const beyondWell = well && living.find((z) => z.inner >= well.outer);
  if (well && beyondWell) routes.push({ name: "Hydrogen route", from: zoneCentre(well), to: zoneCentre(beyondWell) });
  const band = widest(living.filter((z) => z.key === "temperate"));
  const cold = band && living.find((z) => z.key === "coldRock" && z.inner >= band.outer);
  if (band && cold) routes.push({ name: "Out to the cold realm", from: zoneCentre(band), to: zoneCentre(cold) });
  return routes;
}
