import type { DiskState } from "./disk";
import type { ModelParams } from "./params";

export function stoppingTime(grainSize: number, disk: DiskState, p: ModelParams): number {
  return (grainSize * p.grainDensity) / (disk.cs * disk.rho);
}

export function grainSizeForStokes(stokes: number, disk: DiskState, p: ModelParams): number {
  return (stokes * disk.cs * disk.rho) / (disk.omega * p.grainDensity);
}

export function fragmentationStokes(disk: DiskState, p: ModelParams): number {
  return (p.fragmentationPrefactor * p.vFrag * p.vFrag) / (3 * p.delta * disk.cs * disk.cs);
}

export function driftStokes(eta: number, p: ModelParams): number {
  return (3 * Math.sqrt(Math.PI) * p.xiC * p.metallicity) / (4 * eta);
}

export function coagulationTime(disk: DiskState, p: ModelParams): number {
  return 2 / (Math.sqrt(Math.PI) * p.xiC * p.metallicity * disk.omega);
}

export function timeToStreamingInstability(disk: DiskState, p: ModelParams): number {
  const aSI = grainSizeForStokes(p.stSI, disk, p);
  if (aSI <= p.grainSize0) return 0;
  return coagulationTime(disk, p) * Math.log(aSI / p.grainSize0);
}

export interface DustState {
  stFrag: number;
  stDrift: number;
  stMax: number;
  growthLimit: "fragmentation" | "drift";
  aMax: number;
  aSI: number;
  tGrow: number;
  tSI: number;
  dustScaleHeight: number;
}

export function dustScaleHeight(stokes: number, disk: DiskState, p: ModelParams): number {
  return disk.H * Math.sqrt(p.delta / (stokes + p.delta));
}

export function dustAt(disk: DiskState, eta: number, p: ModelParams): DustState {
  const stFrag = fragmentationStokes(disk, p);
  const stDrift = driftStokes(eta, p);
  const stMax = Math.min(stFrag, stDrift);
  return {
    stFrag,
    stDrift,
    stMax,
    growthLimit: stFrag <= stDrift ? "fragmentation" : "drift",
    aMax: grainSizeForStokes(stMax, disk, p),
    aSI: grainSizeForStokes(p.stSI, disk, p),
    tGrow: coagulationTime(disk, p),
    tSI: timeToStreamingInstability(disk, p),
    dustScaleHeight: dustScaleHeight(stMax, disk, p),
  };
}
