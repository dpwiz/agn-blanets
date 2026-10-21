import { G } from "./constants";
import { orbitalState, type CircularOrbit } from "./kepler";
import { solveLambert } from "./lambert";
import { norm, sub, type Vec3 } from "./vec";

export interface Body {
  id: number;
  orbit: CircularOrbit;
  mass: number;
  radius: number;
}

export interface TransferLeg {
  departTime: number;
  timeOfFlight: number;
  departPosition: Vec3;
  departVelocity: Vec3;
  arrivePosition: Vec3;
  vInfDepart: number;
  vInfArrive: number;
  dvDepart: number;
  dvArrive: number;
  dvTotal: number;
}

export interface Porkchop {
  departTimes: number[];
  flightTimes: number[];
  dv: Float64Array;
  best: TransferLeg | null;
}

export const PARKING_ORBIT_FACTOR = 1.5;

export function parkingOrbitBurn(vInf: number, body: Body): number {
  const rp = body.radius * PARKING_ORBIT_FACTOR;
  const mu = G * body.mass;
  return Math.sqrt(vInf * vInf + (2 * mu) / rp) - Math.sqrt(mu / rp);
}

export function surfaceEscapeSpeed(body: Body): number {
  return Math.sqrt((2 * G * body.mass) / body.radius);
}

export function hohmannArc(r1: number, r2: number, startAngle: number, samples = 96): Vec3[] {
  const inner = Math.min(r1, r2);
  const outer = Math.max(r1, r2);
  const axis = (inner + outer) / 2;
  const e = (outer - inner) / (outer + inner);
  return Array.from({ length: samples + 1 }, (_, i) => {
    const anomaly = (Math.PI * i) / samples;
    const r = (axis * (1 - e * e)) / (1 + e * Math.cos(anomaly));
    const angle = startAngle + anomaly;
    return [r * Math.cos(angle), r * Math.sin(angle), 0] as Vec3;
  });
}

export function hohmannDeltaV(r1: number, r2: number, mSmbh: number): number {
  const mu = G * mSmbh;
  const transferAxis = (r1 + r2) / 2;
  const leave = Math.abs(Math.sqrt(mu * (2 / r1 - 1 / transferAxis)) - Math.sqrt(mu / r1));
  const arrive = Math.abs(Math.sqrt(mu / r2) - Math.sqrt(mu * (2 / r2 - 1 / transferAxis)));
  return leave + arrive;
}

export function hohmannTime(r1: number, r2: number, mSmbh: number): number {
  return Math.PI * Math.sqrt(((r1 + r2) / 2) ** 3 / (G * mSmbh));
}

export function transferLeg(from: Body, to: Body, mSmbh: number, departTime: number, timeOfFlight: number): TransferLeg | null {
  const mu = G * mSmbh;
  const a = orbitalState(from.orbit, mSmbh, departTime);
  const b = orbitalState(to.orbit, mSmbh, departTime + timeOfFlight);
  const sol = solveLambert(a.position, b.position, timeOfFlight, mu, true);
  if (!sol) return null;
  const vInfDepart = norm(sub(sol.v1, a.velocity));
  const vInfArrive = norm(sub(sol.v2, b.velocity));
  const dvDepart = parkingOrbitBurn(vInfDepart, from);
  const dvArrive = parkingOrbitBurn(vInfArrive, to);
  return {
    departTime,
    timeOfFlight,
    departPosition: a.position,
    departVelocity: sol.v1,
    arrivePosition: b.position,
    vInfDepart,
    vInfArrive,
    dvDepart,
    dvArrive,
    dvTotal: dvDepart + dvArrive,
  };
}

export function porkchop(
  from: Body,
  to: Body,
  mSmbh: number,
  startTime: number,
  departWindow: number,
  minFlight: number,
  maxFlight: number,
  nDepart = 48,
  nFlight = 48,
): Porkchop {
  const departTimes = Array.from({ length: nDepart }, (_, i) => startTime + (departWindow * i) / (nDepart - 1));
  const flightTimes = Array.from(
    { length: nFlight },
    (_, j) => minFlight * (maxFlight / minFlight) ** (j / (nFlight - 1)),
  );
  const dv = new Float64Array(nDepart * nFlight).fill(Infinity);
  let best: TransferLeg | null = null;
  for (let i = 0; i < nDepart; i++) {
    for (let j = 0; j < nFlight; j++) {
      const leg = transferLeg(from, to, mSmbh, departTimes[i], flightTimes[j]);
      if (!leg || !Number.isFinite(leg.dvTotal)) continue;
      dv[i * nFlight + j] = leg.dvTotal;
      if (!best || leg.dvTotal < best.dvTotal) best = leg;
    }
  }
  return { departTimes, flightTimes, dv, best };
}

export function rocketMassRatio(dv: number, exhaustVelocity: number): number {
  return Math.exp(dv / exhaustVelocity);
}
