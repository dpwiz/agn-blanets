import { C_LIGHT, G, K_B } from "./constants";
import { dustDensity, gasDensity, sampleDisk, type DiskTable } from "./disktable";
import { closestApproachToOrigin, distance, dot, norm, scale, sub, type Vec3 } from "./vec";

const PLANCK = 6.62607015e-34;

export type BandId = "lband" | "ka" | "laser" | "xray";

export interface Band {
  id: BandId;
  label: string;
  wavelength: number;
  gasOpacity: number;
  agnSpectralFraction: number;
}

export const BANDS: Record<BandId, Band> = {
  lband: { id: "lband", label: "L-band radio · 21 cm", wavelength: 0.21, gasOpacity: 0, agnSpectralFraction: 1e-5 },
  ka: { id: "ka", label: "Ka-band radio · 9.4 mm", wavelength: 9.4e-3, gasOpacity: 0, agnSpectralFraction: 1e-5 },
  laser: { id: "laser", label: "Near-IR laser · 1.06 µm", wavelength: 1.064e-6, gasOpacity: 0, agnSpectralFraction: 0.1 },
  xray: { id: "xray", label: "Soft X-ray · 1 keV", wavelength: 1.24e-9, gasOpacity: 10, agnSpectralFraction: 0.03 },
};

export interface Transceiver {
  power: number;
  apertureDiameter: number;
  apertureEfficiency: number;
  bandwidth: number;
  systemTemperature: number;
  sidelobeLevel: number;
}

export const DEFAULT_RIG: Transceiver = {
  power: 1e5,
  apertureDiameter: 70,
  apertureEfficiency: 0.6,
  bandwidth: 1e6,
  systemTemperature: 20,
  sidelobeLevel: 1e-5,
};

export interface CommsEnvironment {
  table: DiskTable;
  mSmbh: number;
  agnLuminosity: number;
  innerDiskRadius: number;
  gasFraction: number;
}

export type Occultation = "none" | "horizon" | "innerDisk";

export interface LinkBudget {
  distance: number;
  lightDelay: number;
  shapiroDelay: number;
  totalDelay: number;
  occultation: Occultation;
  tauDust: number;
  tauGas: number;
  tau: number;
  tauToAgn: number;
  received: number;
  thermalNoise: number;
  glareNoise: number;
  snr: number;
  capacity: number;
  glareAngle: number;
  beamWidth: number;
}

export function dustExtinctionEfficiency(grainSize: number, wavelength: number): number {
  const x = (2 * Math.PI * grainSize) / wavelength;
  return (2 * x) / (1 + x);
}

export function dustOpacity(grainSize: number, wavelength: number, grainDensity: number): number {
  if (grainSize <= 0) return 0;
  return (3 * dustExtinctionEfficiency(grainSize, wavelength)) / (4 * grainDensity * grainSize);
}

export function shapiroDelay(a: Vec3, b: Vec3, mSmbh: number): number {
  const r1 = norm(a);
  const r2 = norm(b);
  const d = distance(a, b);
  const denom = Math.max(r1 + r2 - d, 1e-30);
  return ((2 * G * mSmbh) / C_LIGHT ** 3) * Math.log((r1 + r2 + d) / denom);
}

export function occultation(a: Vec3, b: Vec3, env: CommsEnvironment): Occultation {
  const rg = (G * env.mSmbh) / (C_LIGHT * C_LIGHT);
  if (closestApproachToOrigin(a, b).distance < 3 * Math.sqrt(3) * rg) return "horizon";
  if (a[2] * b[2] < 0) {
    const t = a[2] / (a[2] - b[2]);
    const crossing = Math.hypot(a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1]));
    if (crossing < env.innerDiskRadius) return "innerDisk";
  }
  return "none";
}

export function opticalDepth(a: Vec3, b: Vec3, band: Band, table: DiskTable): { dust: number; gas: number } {
  const L = distance(a, b);
  if (L === 0) return { dust: 0, gas: 0 };
  const Ra = Math.hypot(a[0], a[1]);
  const Rb = Math.hypot(b[0], b[1]);
  const sa = sampleDisk(table, Ra);
  const sb = sampleDisk(table, Rb);
  const hd = Math.min(sa?.Hd ?? Infinity, sb?.Hd ?? Infinity, sampleDisk(table, table.rMin)?.Hd ?? Infinity);
  const dz = Math.abs(a[2] - b[2]);
  const rMid = Math.max(Math.min(Ra, Rb), table.rMin);
  const n = Math.min(Math.max(Math.ceil((6 * dz) / hd + (12 * L) / rMid), 32), 1200);
  const ds = L / n;
  let dust = 0;
  let gas = 0;
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const x = a[0] + t * (b[0] - a[0]);
    const y = a[1] + t * (b[1] - a[1]);
    const z = a[2] + t * (b[2] - a[2]);
    const R = Math.hypot(x, y);
    if (band.gasOpacity > 0) gas += gasDensity(table, R, z) * band.gasOpacity * ds;
    const d = dustDensity(table, R, z);
    if (d.density > 0) dust += d.density * dustOpacity(d.grainSize, band.wavelength, table.grainDensity) * ds;
  }
  return { dust, gas };
}

const CLEAR_PATH = { dust: 0, gas: 0 };

export function pathDepth(a: Vec3, b: Vec3, band: Band, env: CommsEnvironment): { dust: number; gas: number } {
  if (env.gasFraction <= 0) return CLEAR_PATH;
  const full = opticalDepth(a, b, band, env.table);
  return env.gasFraction >= 1 ? full : { dust: full.dust * env.gasFraction, gas: full.gas * env.gasFraction };
}

export function apertureGain(rig: Transceiver, wavelength: number): number {
  return rig.apertureEfficiency * ((Math.PI * rig.apertureDiameter) / wavelength) ** 2;
}

export function agnSightlineDepth(receiver: Vec3, band: Band, env: CommsEnvironment): number {
  const inner = scale(receiver, (env.innerDiskRadius * 0.5) / Math.max(norm(receiver), 1));
  const d = pathDepth(receiver, inner, band, env);
  return d.dust + d.gas;
}

export interface PrecomputedDepths {
  path?: { dust: number; gas: number };
  receiverToAgn?: number;
}

export function linkBudget(
  a: Vec3,
  b: Vec3,
  band: Band,
  rig: Transceiver,
  env: CommsEnvironment,
  pre: PrecomputedDepths = {},
): LinkBudget {
  const d = distance(a, b);
  const lightDelay = d / C_LIGHT;
  const shapiro = shapiroDelay(a, b, env.mSmbh);
  const occ = occultation(a, b, env);
  const depth = pre.path ?? pathDepth(a, b, band, env);
  const tau = depth.dust + depth.gas;
  const tauToAgn = pre.receiverToAgn ?? agnSightlineDepth(b, band, env);
  const lambda = band.wavelength;
  const nu = C_LIGHT / lambda;
  const gain = apertureGain(rig, lambda);
  const pathLoss = (lambda / (4 * Math.PI * d)) ** 2;
  const received = occ === "none" ? rig.power * gain * gain * pathLoss * Math.exp(-tau) : 0;
  const thermalNoise = (K_B * rig.systemTemperature + PLANCK * nu) * rig.bandwidth;
  const beamWidth = (1.22 * lambda) / rig.apertureDiameter;
  const toSource = sub(a, b);
  const toAgn = scale(b, -1);
  const cosAngle = dot(toSource, toAgn) / (norm(toSource) * norm(toAgn));
  const glareAngle = Math.acos(Math.min(Math.max(cosAngle, -1), 1));
  const pattern = Math.exp(-4 * Math.LN2 * (glareAngle / beamWidth) ** 2) + rig.sidelobeLevel;
  const effectiveArea = (rig.apertureEfficiency * Math.PI * rig.apertureDiameter ** 2) / 4;
  const fluxDensity = (band.agnSpectralFraction * env.agnLuminosity) / (nu * 4 * Math.PI * norm(b) ** 2);
  const glareNoise = fluxDensity * Math.exp(-tauToAgn) * effectiveArea * rig.bandwidth * pattern;
  const snr = received / (thermalNoise + glareNoise);
  return {
    distance: d,
    lightDelay,
    shapiroDelay: shapiro,
    totalDelay: lightDelay + shapiro,
    occultation: occ,
    tauDust: depth.dust,
    tauGas: depth.gas,
    tau,
    tauToAgn,
    received,
    thermalNoise,
    glareNoise,
    snr,
    capacity: rig.bandwidth * Math.log2(1 + snr),
    glareAngle,
    beamWidth,
  };
}
