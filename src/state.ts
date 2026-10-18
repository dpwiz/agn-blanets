import { finalizeBlanets, sampleFocusCloud, sampleImpostorCloud, sampleLandmarks, type Blanet } from "./physics/bodies";
import type { BandId, CommsEnvironment, Transceiver } from "./physics/comms";
import { DEFAULT_RIG } from "./physics/comms";
import { smbhMass } from "./physics/disk";
import { buildDiskTable, type DiskTable } from "./physics/disktable";
import { PC, YR } from "./physics/constants";
import { meanMotion } from "./physics/kepler";
import type { NetworkGraph, Route } from "./physics/network";
import { DEFAULT_PARAMS, type ModelParams } from "./physics/params";
import { populationProfile, type PopulationSummary } from "./physics/population";
import type { Ship } from "./ship";
import type { Vec3 } from "./physics/vec";

export type ViewMode = "torus" | "local";
export type ColorBy = "mass" | "regime" | "fate";
export type DockTab = "explore" | "hop" | "signal" | "clocks";
export type HopKind = "orbital" | "torch";
export type SlotRole = "origin" | "target";

export interface FocusPatch {
  radius: number;
  phase: number;
  patchRadius: number;
  blanets: Blanet[];
  seed: number;
  derivedAtYr: number;
}

export interface AppState {
  params: ModelParams;
  population: PopulationSummary;
  table: DiskTable;
  impostors: Float32Array;
  landmarks: Blanet[];
  focus: FocusPatch;
  view: ViewMode;
  colorBy: ColorBy;
  zExaggeration: number;
  timeYr: number;
  playing: boolean;
  speedYrPerSec: number;
  viewSpeeds: Record<ViewMode, number>;
  tab: DockTab;
  selected: Blanet | null;
  origin: Blanet | null;
  target: Blanet | null;
  armedSlot: SlotRole | null;
  hopKind: HopKind;
  torchAccelerationG: number;
  exhaustFractionC: number;
  orbitalExhaustKms: number;
  ship: Ship | null;
  hopPreview: { points: Vec3[]; times: number[]; kind: HopKind } | null;
  band: BandId;
  rig: Transceiver;
  network: NetworkGraph | null;
  networkBuiltAtYr: number | null;
  networkPositions: Blanet[];
  route: Route | null;
  showNetwork: boolean;
  clockSyncYr: number;
}

type Listener = (state: AppState, changed: Set<keyof AppState>) => void;

const IMPOSTOR_COUNT = 90_000;
const LANDMARK_COUNT = 48;
const FOCUS_COUNT = 320;

export const smbhMassKg = smbhMass;

export function commsEnvironment(s: AppState): CommsEnvironment {
  return { table: s.table, mSmbh: smbhMass(s.params), agnLuminosity: s.params.irradiationLuminosity, innerDiskRadius: s.params.rMinPc * PC };
}

export function derivePopulation(params: ModelParams) {
  const population = populationProfile(params, 200);
  const table = buildDiskTable(params);
  const impostors = sampleImpostorCloud(population, IMPOSTOR_COUNT, 11);
  const landmarks = finalizeBlanets(sampleLandmarks(population, LANDMARK_COUNT, 5), params);
  return { population, table, impostors, landmarks };
}

export function deriveFocus(
  params: ModelParams,
  population: PopulationSummary,
  radius: number,
  phaseNow: number,
  seed: number,
  timeYr = 0,
): FocusPatch {
  const mSmbh = smbhMassKg(params);
  const t = timeYr * YR;
  const { blanets, patchRadius } = sampleFocusCloud(population, radius, phaseNow, FOCUS_COUNT, seed, t, mSmbh);
  finalizeBlanets(blanets, params);
  return { radius, phase: phaseNow - meanMotion(radius, mSmbh) * t, patchRadius, blanets, seed, derivedAtYr: timeYr };
}

export function clampFocusRadius(preferred: number, population: PopulationSummary, params: ModelParams): number {
  const inner = population.formingInner ?? params.rMinPc * PC;
  const outer = population.formingOuter ?? params.rMaxPc * PC;
  return Math.min(Math.max(preferred, inner * 1.05), outer * 0.95);
}

export function focusAzimuthNow(s: AppState): number {
  return s.focus.phase + meanMotion(s.focus.radius, smbhMassKg(s.params)) * s.timeYr * YR;
}

const REGATHER_AFTER_YR = 20;

function initialState(): AppState {
  const params = { ...DEFAULT_PARAMS };
  const derived = derivePopulation(params);
  const focus = deriveFocus(params, derived.population, clampFocusRadius(1 * PC, derived.population, params), 0.6, 101);
  return {
    params,
    ...derived,
    focus,
    view: "torus",
    colorBy: "mass",
    zExaggeration: 3,
    timeYr: 0,
    playing: false,
    speedYrPerSec: 300,
    viewSpeeds: { torus: 300, local: 2 },
    tab: "explore",
    selected: null,
    origin: null,
    target: null,
    armedSlot: null,
    hopKind: "orbital",
    torchAccelerationG: 1,
    exhaustFractionC: 0.3,
    orbitalExhaustKms: 50,
    ship: null,
    hopPreview: null,
    band: "lband",
    rig: { ...DEFAULT_RIG },
    network: null,
    networkBuiltAtYr: null,
    networkPositions: [],
    route: null,
    showNetwork: false,
    clockSyncYr: 0,
  };
}

class Store {
  state: AppState = initialState();
  private listeners: Listener[] = [];

  subscribe(fn: Listener): void {
    this.listeners.push(fn);
  }

  set(patch: Partial<AppState>): void {
    if (patch.view && patch.view !== this.state.view) {
      const viewSpeeds = { ...this.state.viewSpeeds, [this.state.view]: this.state.speedYrPerSec };
      patch = { ...patch, viewSpeeds, speedYrPerSec: viewSpeeds[patch.view] };
      if (patch.view === "local" && !patch.focus && Math.abs(this.state.timeYr - this.state.focus.derivedAtYr) > REGATHER_AFTER_YR) {
        patch = { ...patch, ...this.regatherPatch() };
      }
    }
    const changed = new Set(Object.keys(patch) as (keyof AppState)[]);
    this.state = { ...this.state, ...patch };
    for (const fn of this.listeners) fn(this.state, changed);
  }

  regatherPatch(): Partial<AppState> {
    const s = this.state;
    const focus = deriveFocus(s.params, s.population, s.focus.radius, focusAzimuthNow(s), s.focus.seed + 1, s.timeYr);
    const keep = [s.selected, s.origin, s.target].filter((b): b is Blanet => !!b && b.kind === "local");
    focus.blanets.push(...keep.filter((b, i) => keep.findIndex((x) => x.id === b.id) === i));
    return { focus, network: null, networkBuiltAtYr: null, route: null, hopPreview: null };
  }

  regather(): void {
    this.set(this.regatherPatch());
  }

  setParams(patch: Partial<ModelParams>): void {
    const params = { ...this.state.params, ...patch };
    const derived = derivePopulation(params);
    const radius = clampFocusRadius(this.state.focus.radius, derived.population, params);
    const phaseNow = focusAzimuthNow(this.state);
    const focus = deriveFocus(params, derived.population, radius, phaseNow, this.state.focus.seed, this.state.timeYr);
    this.set({
      params,
      ...derived,
      focus,
      selected: null,
      origin: null,
      target: null,
      ship: null,
      hopPreview: null,
      network: null,
      networkBuiltAtYr: null,
      route: null,
    });
  }
}

export const store = new Store();
