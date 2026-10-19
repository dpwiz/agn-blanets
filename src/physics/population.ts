import { PC } from "./constants";
import { formsDuringAgn } from "./era";
import { logspace } from "./math";
import { filamentsPerRing, radialState, type RadialState } from "./model";
import type { ModelParams } from "./params";

export interface RadialBin {
  rInner: number;
  rOuter: number;
  rMid: number;
  state: RadialState;
  formsPlanets: boolean;
  filaments: number;
  planets: number;
  cumulativeFilaments: number;
  cumulativePlanets: number;
  planetNumberDensity: number;
}

export interface PopulationSummary {
  bins: RadialBin[];
  totalFilaments: number;
  totalPlanets: number;
  totalMass: number;
  formingInner: number | null;
  formingOuter: number | null;
}

export function formsPlanetsAt(state: RadialState, p: ModelParams): boolean {
  return p.countingMode === "paper" || formsDuringAgn(state);
}

export function populationProfile(p: ModelParams, binCount = 200): PopulationSummary {
  const edges = logspace(p.rMinPc * PC, p.rMaxPc * PC, binCount + 1);
  const bins: RadialBin[] = [];
  let cumulativeFilaments = 0;
  let cumulativePlanets = 0;
  let totalMass = 0;
  let formingInner: number | null = null;
  let formingOuter: number | null = null;
  for (let i = 0; i < binCount; i++) {
    const rInner = edges[i];
    const rOuter = edges[i + 1];
    const rMid = Math.sqrt(rInner * rOuter);
    const state = radialState(rMid, p);
    const formsPlanets = formsPlanetsAt(state, p);
    const filaments = formsPlanets ? ((rOuter - rInner) / state.filamentWidth) * filamentsPerRing(state.disk, p) : 0;
    const planets = filaments * state.planetesimalsPerFilament;
    cumulativeFilaments += filaments;
    cumulativePlanets += planets;
    totalMass += planets * state.planetesimalMass;
    if (formsPlanets) {
      formingInner ??= rInner;
      formingOuter = rOuter;
    }
    const layerVolume = 2 * Math.PI * rMid * (rOuter - rInner) * 2 * state.dust.dustScaleHeight;
    bins.push({
      rInner,
      rOuter,
      rMid,
      state,
      formsPlanets,
      filaments,
      planets,
      cumulativeFilaments,
      cumulativePlanets,
      planetNumberDensity: planets / layerVolume,
    });
  }
  return { bins, totalFilaments: cumulativeFilaments, totalPlanets: cumulativePlanets, totalMass, formingInner, formingOuter };
}
