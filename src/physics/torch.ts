import { C_LIGHT } from "./constants";
import { orbitalPosition, type CircularOrbit } from "./kepler";
import { distance, lerp, type Vec3 } from "./vec";

export interface TorchProfile {
  distance: number;
  acceleration: number;
  coordinateTime: number;
  properTime: number;
  peakGamma: number;
  peakSpeed: number;
}

export interface TorchFlight extends TorchProfile {
  departTime: number;
  arriveTime: number;
  from: Vec3;
  to: Vec3;
  massRatio: number;
}

export function brachistochrone(d: number, a: number): TorchProfile {
  const c = C_LIGHT;
  const half = d / 2;
  const peakGamma = 1 + (a * half) / (c * c);
  const excess = (a * half) / (c * c);
  const halfProper = (c / a) * Math.log1p(excess + Math.sqrt(excess * (2 + excess)));
  const halfCoordinate = (c / a) * Math.sinh((a * halfProper) / c);
  return {
    distance: d,
    acceleration: a,
    coordinateTime: 2 * halfCoordinate,
    properTime: 2 * halfProper,
    peakGamma,
    peakSpeed: c * Math.tanh((a * halfProper) / c),
  };
}

export function newtonianBrachistochroneTime(d: number, a: number): number {
  return 2 * Math.sqrt(d / a);
}

export function relativisticMassRatio(properTime: number, acceleration: number, exhaustVelocity: number): number {
  return Math.exp((acceleration * properTime) / exhaustVelocity);
}

export function torchIntercept(
  fromOrbit: CircularOrbit,
  toOrbit: CircularOrbit,
  mSmbh: number,
  departTime: number,
  acceleration: number,
  exhaustVelocity: number,
): TorchFlight {
  const from = orbitalPosition(fromOrbit, mSmbh, departTime);
  let arriveTime = departTime;
  let profile = brachistochrone(distance(from, orbitalPosition(toOrbit, mSmbh, departTime)), acceleration);
  for (let i = 0; i < 12; i++) {
    arriveTime = departTime + profile.coordinateTime;
    profile = brachistochrone(distance(from, orbitalPosition(toOrbit, mSmbh, arriveTime)), acceleration);
  }
  arriveTime = departTime + profile.coordinateTime;
  return {
    ...profile,
    departTime,
    arriveTime,
    from,
    to: orbitalPosition(toOrbit, mSmbh, arriveTime),
    massRatio: relativisticMassRatio(profile.properTime, acceleration, exhaustVelocity),
  };
}

export function torchProgress(flight: TorchFlight, t: number): { position: Vec3; speed: number; properTime: number } {
  const c = C_LIGHT;
  const a = flight.acceleration;
  const elapsed = Math.min(Math.max(t - flight.departTime, 0), flight.coordinateTime);
  const halfT = flight.coordinateTime / 2;
  const coveredAt = (tc: number) => ((c * c) / a) * (Math.sqrt(1 + ((a * tc) / c) ** 2) - 1);
  const properAt = (tc: number) => (c / a) * Math.asinh((a * tc) / c);
  let covered: number;
  let tau: number;
  let speed: number;
  if (elapsed <= halfT) {
    covered = coveredAt(elapsed);
    tau = properAt(elapsed);
    speed = (a * elapsed) / Math.sqrt(1 + ((a * elapsed) / c) ** 2);
  } else {
    const remaining = flight.coordinateTime - elapsed;
    covered = flight.distance - coveredAt(remaining);
    tau = flight.properTime - properAt(remaining);
    speed = (a * remaining) / Math.sqrt(1 + ((a * remaining) / c) ** 2);
  }
  return { position: lerp(flight.from, flight.to, covered / flight.distance), speed, properTime: tau };
}
