import { C_LIGHT, G, K_B, M_H, M_SUN, SIGMA_SB } from "./constants";
import type { ModelParams } from "./params";

export interface DiskState {
  r: number;
  mSmbh: number;
  omega: number;
  vK: number;
  rho: number;
  temperature: number;
  cs: number;
  H: number;
  h: number;
  sigma: number;
  pGas: number;
  pTotal: number;
  magneticSupport: number;
}

export function smbhMass(p: ModelParams): number {
  return p.mSmbhMsun * M_SUN;
}

export function gravitationalRadius(mSmbh: number): number {
  return (G * mSmbh) / (C_LIGHT * C_LIGHT);
}

export function soundSpeed(temperature: number, p: ModelParams): number {
  return Math.sqrt((p.gamma * K_B * temperature) / (p.meanMolecularWeight * M_H));
}

export function magneticSupport(p: ModelParams): number {
  return Math.sqrt(1 + 1 / p.betaM);
}

function irradiationTemperature4(r: number, h: number, mSmbh: number, p: ModelParams): number {
  const rStar = p.irradiationRadiusRg * gravitationalRadius(mSmbh);
  const fluxScale = p.irradiationLuminosity / (4 * Math.PI * SIGMA_SB);
  const grazing = (2 / (3 * Math.PI)) * (rStar / r);
  const flaring = p.photosphereHeightOverH * h * (p.flaringIndex - 1);
  return (fluxScale / (r * r)) * Math.max(grazing + flaring, 0);
}

function solveTemperature(r: number, omega: number, mSmbh: number, p: ModelParams): number {
  const support = magneticSupport(p);
  const tb4 = p.backgroundTemperature ** 4;
  const residual = (t: number) => {
    const h = (soundSpeed(t, p) * support) / (omega * r);
    return t ** 4 - tb4 - irradiationTemperature4(r, h, mSmbh, p);
  };
  let lo = Math.max(p.backgroundTemperature, 1e-3);
  let hi = Math.max(lo * 2, 10);
  while (residual(hi) < 0) hi *= 2;
  for (let i = 0; i < 80; i++) {
    const mid = Math.sqrt(lo * hi);
    if (residual(mid) < 0) lo = mid;
    else hi = mid;
  }
  return Math.sqrt(lo * hi);
}

export function diskAt(r: number, p: ModelParams): DiskState {
  const mSmbh = smbhMass(p);
  const omega = Math.sqrt((G * mSmbh) / (r * r * r));
  const vK = omega * r;
  const rho = (omega * omega) / (2 * Math.PI * G);
  const temperature = solveTemperature(r, omega, mSmbh, p);
  const cs = soundSpeed(temperature, p);
  const support = magneticSupport(p);
  const H = (cs / omega) * support;
  const sigma = 2 * H * rho;
  const pGas = (rho * cs * cs) / p.gamma;
  return {
    r,
    mSmbh,
    omega,
    vK,
    rho,
    temperature,
    cs,
    H,
    h: H / r,
    sigma,
    pGas,
    pTotal: pGas * (1 + 1 / p.betaM),
    magneticSupport: support,
  };
}

export function pressureLogSlope(r: number, p: ModelParams): number {
  const eps = 1e-3;
  const outer = diskAt(r * (1 + eps), p);
  const inner = diskAt(r * (1 - eps), p);
  return Math.log(outer.pTotal / inner.pTotal) / Math.log((1 + eps) / (1 - eps));
}

export function etaAt(disk: DiskState, p: ModelParams): number {
  return 0.5 * disk.h * disk.h * Math.abs(pressureLogSlope(disk.r, p));
}
