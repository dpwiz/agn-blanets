import { fateOf, objectClass, type FateSummary, type ObjectClass } from "./fate";
import { meanMotion, type CircularOrbit } from "./kepler";
import { gaussian, mulberry32 } from "./math";
import { accretionContext, radialState, type RadialState } from "./model";
import { accretionAt, geometricRadius, type AccretionState } from "./accretion";
import type { ModelParams } from "./params";
import type { PopulationSummary, RadialBin } from "./population";
import { growthTrack, type GrowthTrack } from "./era";

export interface Blanet {
  id: number;
  name: string;
  orbit: CircularOrbit;
  mass: number;
  radius: number;
  objectClass: ObjectClass;
  kind: "landmark" | "local";
}

export interface BlanetDetails {
  local: RadialState;
  accretion: AccretionState;
  fate: FateSummary;
}

export const MASS_SCATTER_DEX = 0.25;
export const LANDMARK_ID_BASE = 1e12;

const SYLLABLES = [
  "ka", "lo", "mi", "ra", "ve", "su", "tor", "an", "el", "is", "or", "un", "zan", "qui", "dra", "nox",
  "pha", "rel", "sy", "thu", "ve", "wen", "xi", "yor", "bel", "cor", "dun", "eth", "fal", "gry",
];

export function blanetName(id: number): string {
  const rand = mulberry32(id * 7919 + 17);
  const parts = 2 + Math.floor(rand() * 2);
  let name = "";
  for (let i = 0; i < parts; i++) name += SYLLABLES[Math.floor(rand() * SYLLABLES.length)];
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function pickBin(pop: PopulationSummary, u: number): RadialBin | null {
  const total = pop.totalPlanets;
  if (!(total > 0)) return null;
  const target = u * total;
  let lo = 0;
  let hi = pop.bins.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (pop.bins[mid].cumulativePlanets < target) lo = mid + 1;
    else hi = mid;
  }
  return pop.bins[lo];
}

export function radiusInBin(bin: RadialBin, u: number): number {
  return bin.rInner * (bin.rOuter / bin.rInner) ** u;
}

function makeOrbit(radius: number, dustHeight: number, rand: () => number): CircularOrbit {
  return {
    radius,
    inclination: Math.abs(gaussian(rand)) * (dustHeight / radius),
    node: rand() * 2 * Math.PI,
    phase0: rand() * 2 * Math.PI,
  };
}

function scatterMass(mass: number, rand: () => number): number {
  return mass * 10 ** (MASS_SCATTER_DEX * gaussian(rand));
}

export const IMPOSTOR_STRIDE = 4;

export function sampleImpostorCloud(pop: PopulationSummary, count: number, seed: number): Float32Array {
  const rand = mulberry32(seed);
  const out = new Float32Array(count * IMPOSTOR_STRIDE);
  for (let i = 0; i < count; i++) {
    const bin = pickBin(pop, rand());
    if (!bin) return out.subarray(0, i * IMPOSTOR_STRIDE);
    const o = i * IMPOSTOR_STRIDE;
    out[o] = radiusInBin(bin, rand());
    out[o + 1] = rand() * 2 * Math.PI;
    out[o + 2] = gaussian(rand) * bin.state.dust.dustScaleHeight;
    out[o + 3] = scatterMass(bin.state.planetesimalMass, rand);
  }
  return out;
}

export function sampleLandmarks(pop: PopulationSummary, count: number, seed: number): Blanet[] {
  const rand = mulberry32(seed);
  const out: Blanet[] = [];
  for (let i = 0; i < count; i++) {
    const bin = pickBin(pop, (i + rand()) / count);
    if (!bin) break;
    out.push(makeBlanet(LANDMARK_ID_BASE + i, radiusInBin(bin, rand()), bin, rand, "landmark"));
  }
  return out;
}

function makeBlanet(id: number, radius: number, bin: RadialBin, rand: () => number, kind: Blanet["kind"]): Blanet {
  const mass = scatterMass(bin.state.planetesimalMass, rand);
  return {
    id,
    name: blanetName(id),
    orbit: makeOrbit(radius, bin.state.dust.dustScaleHeight, rand),
    mass,
    radius: 0,
    objectClass: objectClass(mass),
    kind,
  };
}

export function surfaceDensityAt(pop: PopulationSummary, r: number): number {
  const bin = pop.bins.find((b) => b.rOuter >= r);
  if (!bin) return 0;
  return bin.planets / (Math.PI * (bin.rOuter ** 2 - bin.rInner ** 2));
}

export function sampleFocusCloud(
  pop: PopulationSummary,
  focusRadius: number,
  focusPhase: number,
  count: number,
  seed: number,
  tSeconds = 0,
  mSmbh = 0,
): { blanets: Blanet[]; patchRadius: number } {
  const rand = mulberry32(seed);
  const sigmaN = surfaceDensityAt(pop, focusRadius);
  const patchRadius = sigmaN > 0 ? Math.min(Math.sqrt(count / (Math.PI * sigmaN)), 0.5 * focusRadius) : 0.05 * focusRadius;
  const cx = focusRadius * Math.cos(focusPhase);
  const cy = focusRadius * Math.sin(focusPhase);
  const blanets: Blanet[] = [];
  for (let i = 0; i < count; i++) {
    const rr = patchRadius * Math.sqrt(rand());
    const th = rand() * 2 * Math.PI;
    const x = cx + rr * Math.cos(th);
    const y = cy + rr * Math.sin(th);
    const R = Math.hypot(x, y);
    const bin = pop.bins.find((b) => b.rOuter >= R) ?? pop.bins[pop.bins.length - 1];
    const b = makeBlanet(seed * 10_000 + i, R, bin, rand, "local");
    const n = mSmbh > 0 ? meanMotion(R, mSmbh) : 0;
    b.orbit.phase0 = Math.atan2(y, x) - b.orbit.node - n * tSeconds;
    blanets.push(b);
  }
  return { blanets, patchRadius };
}

export function finalizeBlanets(blanets: Blanet[], p: ModelParams): Blanet[] {
  for (const b of blanets) b.radius = geometricRadius(b.mass, p);
  return blanets;
}

export function blanetDetails(b: Blanet, p: ModelParams): BlanetDetails {
  const local = radialState(b.orbit.radius, p);
  const ctx = accretionContext(local.disk, local.eta, local.dust, p);
  const accretion = accretionAt(b.mass, ctx);
  const fate = fateOf({
    mass: b.mass,
    doublingTime: accretion.doublingTime,
    thermalMass: local.thermalMass,
    regime: accretion.regime,
    agnLifetimeYr: p.agnLifetimeYr,
  });
  return { local, accretion, fate };
}

const trackCache = new WeakMap<Blanet, { params: ModelParams; track: GrowthTrack }>();

export function blanetTrack(b: Blanet, p: ModelParams): GrowthTrack {
  const hit = trackCache.get(b);
  if (hit && hit.params === p) return hit.track;
  const d = blanetDetails(b, p);
  const track = growthTrack(d.local, b.mass, d.accretion.doublingTime, p);
  trackCache.set(b, { params: p, track });
  return track;
}
