import { YR } from "./constants";
import { accretionAt, pebbleIsolationMass, thermalMass, type AccretionContext, type AccretionState } from "./accretion";
import { diskAt, etaAt, type DiskState } from "./disk";
import { dustAt, type DustState } from "./dust";
import { filamentMass, filamentWidth, planetesimalMass } from "./planetesimals";
import type { ModelParams } from "./params";

export interface RadialState {
  disk: DiskState;
  eta: number;
  dust: DustState;
  filamentWidth: number;
  filamentMass: number;
  planetesimalMass: number;
  planetesimalsPerFilament: number;
  accretion: AccretionState;
  isolationMass: number;
  thermalMass: number;
  streamingAllowed: boolean;
  grainsGrowInTime: boolean;
}

export function accretionContext(disk: DiskState, eta: number, dust: DustState, p: ModelParams): AccretionContext {
  return { disk, eta, stokes: dust.stMax, p };
}

export function radialState(r: number, p: ModelParams): RadialState {
  const disk = diskAt(r, p);
  const eta = etaAt(disk, p);
  const dust = dustAt(disk, eta, p);
  const mp = planetesimalMass(disk, p);
  const mf = filamentMass(disk, eta, p);
  const ctx = accretionContext(disk, eta, dust, p);
  return {
    disk,
    eta,
    dust,
    filamentWidth: filamentWidth(disk, eta),
    filamentMass: mf,
    planetesimalMass: mp,
    planetesimalsPerFilament: mf / mp,
    accretion: accretionAt(mp, ctx),
    isolationMass: pebbleIsolationMass(disk, p),
    thermalMass: thermalMass(disk),
    streamingAllowed: dust.stMax >= p.stSI,
    grainsGrowInTime: dust.tSI < p.agnLifetimeYr * YR,
  };
}
