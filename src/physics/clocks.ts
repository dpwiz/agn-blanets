import { C_LIGHT, G, YR } from "./constants";

export function circularOrbitClockRate(r: number, mSmbh: number): number {
  return Math.sqrt(Math.max(1 - (3 * G * mSmbh) / (r * C_LIGHT * C_LIGHT), 0));
}

export function staticClockRate(r: number, mSmbh: number): number {
  return Math.sqrt(Math.max(1 - (2 * G * mSmbh) / (r * C_LIGHT * C_LIGHT), 0));
}

export function movingClockRate(r: number, speed: number, mSmbh: number): number {
  return Math.sqrt(Math.max(1 - (2 * G * mSmbh) / (r * C_LIGHT * C_LIGHT) - (speed * speed) / (C_LIGHT * C_LIGHT), 0));
}

export function clockLagPerYear(rate: number): number {
  return (1 - rate) * YR;
}
