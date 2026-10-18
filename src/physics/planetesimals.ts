import { G, M_JUP, M_SUN } from "./constants";
import type { DiskState } from "./disk";
import type { ModelParams } from "./params";

export function filamentWidth(disk: DiskState, eta: number): number {
  return eta * disk.r;
}

export function filamentMass(disk: DiskState, eta: number, p: ModelParams): number {
  return eta * disk.r * p.filamentLengthOverH * disk.H * disk.sigma * p.filamentMetallicity;
}

export function liuPlanetesimalMass(disk: DiskState, p: ModelParams): number {
  const selfGravity = (4 * Math.PI * Math.PI * G * disk.rho) / (disk.omega * disk.omega);
  return (
    3.1 *
    M_JUP *
    (p.liuCoefficient / 1e-5) *
    Math.sqrt(p.filamentMetallicity / 0.02) *
    selfGravity ** 1.5 *
    (disk.h / 0.05) ** 3 *
    (disk.mSmbh / (1e8 * M_SUN))
  );
}

export function klahrSchreiberPlanetesimalMass(disk: DiskState, p: ModelParams): number {
  return (1 / 9) * (p.delta / p.stSI) ** 1.5 * disk.h ** 3 * disk.mSmbh;
}

export function planetesimalMass(disk: DiskState, p: ModelParams): number {
  return p.planetesimalLaw === "liu2020"
    ? liuPlanetesimalMass(disk, p)
    : klahrSchreiberPlanetesimalMass(disk, p);
}

export function rocheDensity(disk: DiskState): number {
  return (9 * disk.omega * disk.omega) / (4 * Math.PI * G);
}
