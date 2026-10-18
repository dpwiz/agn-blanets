import { PC } from "./constants";
import { radialState } from "./model";
import type { ModelParams } from "./params";

export interface DiskTable {
  logR0: number;
  dLogR: number;
  count: number;
  rMin: number;
  rMax: number;
  sigma: Float64Array;
  scaleHeight: Float64Array;
  dustScaleHeight: Float64Array;
  grainSize: Float64Array;
  metallicity: number;
  grainDensity: number;
}

export interface DiskSample {
  sigma: number;
  H: number;
  Hd: number;
  grainSize: number;
}

export function buildDiskTable(p: ModelParams, count = 160): DiskTable {
  const rMin = p.rMinPc * PC;
  const rMax = p.rMaxPc * PC;
  const logR0 = Math.log(rMin);
  const dLogR = (Math.log(rMax) - logR0) / (count - 1);
  const sigma = new Float64Array(count);
  const scaleHeight = new Float64Array(count);
  const dustScaleHeight = new Float64Array(count);
  const grainSize = new Float64Array(count);
  for (let i = 0; i < count; i++) {
    const s = radialState(Math.exp(logR0 + i * dLogR), p);
    sigma[i] = s.disk.sigma;
    scaleHeight[i] = s.disk.H;
    dustScaleHeight[i] = s.dust.dustScaleHeight;
    grainSize[i] = s.dust.aMax;
  }
  return {
    logR0,
    dLogR,
    count,
    rMin,
    rMax,
    sigma,
    scaleHeight,
    dustScaleHeight,
    grainSize,
    metallicity: p.metallicity,
    grainDensity: p.grainDensity,
  };
}

export function sampleDisk(table: DiskTable, R: number): DiskSample | null {
  if (R > table.rMax) return null;
  const x = (Math.log(Math.max(R, table.rMin)) - table.logR0) / table.dLogR;
  const i = Math.min(Math.max(Math.floor(x), 0), table.count - 2);
  const f = Math.min(Math.max(x - i, 0), 1);
  const mix = (arr: Float64Array) => Math.exp(Math.log(arr[i]) * (1 - f) + Math.log(arr[i + 1]) * f);
  return { sigma: mix(table.sigma), H: mix(table.scaleHeight), Hd: mix(table.dustScaleHeight), grainSize: mix(table.grainSize) };
}

export function gasDensity(table: DiskTable, R: number, z: number): number {
  const s = sampleDisk(table, R);
  if (!s) return 0;
  return (s.sigma / (Math.sqrt(2 * Math.PI) * s.H)) * Math.exp(-(z * z) / (2 * s.H * s.H));
}

export function dustDensity(table: DiskTable, R: number, z: number): { density: number; grainSize: number } {
  if (R < table.rMin) return { density: 0, grainSize: 0 };
  const s = sampleDisk(table, R);
  if (!s) return { density: 0, grainSize: 0 };
  const density = ((table.metallicity * s.sigma) / (Math.sqrt(2 * Math.PI) * s.Hd)) * Math.exp(-(z * z) / (2 * s.Hd * s.Hd));
  return { density, grainSize: s.grainSize };
}
