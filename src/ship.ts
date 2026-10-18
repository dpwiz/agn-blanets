import type { Blanet } from "./physics/bodies";
import { circularOrbitClockRate, movingClockRate } from "./physics/clocks";
import { G } from "./physics/constants";
import { orbitalPosition, propagateKepler } from "./physics/kepler";
import type { TorchFlight } from "./physics/torch";
import { torchProgress } from "./physics/torch";
import type { TransferLeg } from "./physics/transfer";
import { distance, lerp, norm, type Vec3 } from "./physics/vec";

export interface ShipLeg {
  kind: "orbital" | "torch";
  from: Blanet;
  to: Blanet;
  departTime: number;
  arriveTime: number;
  dv: number;
  massRatio: number;
  properTime: number;
  path: Vec3[];
  pathTimes: number[];
  pathProper: number[];
  torch?: TorchFlight;
}

export interface Ship {
  legs: ShipLeg[];
  startTime: number;
}

export interface ShipState {
  position: Vec3;
  properTime: number;
  status: "waiting" | "flying" | "arrived";
  legIndex: number;
  speed: number;
}

export function orbitalShipLeg(from: Blanet, to: Blanet, leg: TransferLeg, mSmbh: number, exhaustVelocity: number): ShipLeg {
  const steps = 240;
  const path = propagateKepler(leg.departPosition, leg.departVelocity, G * mSmbh, leg.timeOfFlight, steps);
  const dt = leg.timeOfFlight / steps;
  const pathTimes = path.map((_, i) => leg.departTime + i * dt);
  const pathProper = [0];
  for (let i = 1; i < path.length; i++) {
    const v = distance(path[i], path[i - 1]) / dt;
    const r = norm(lerp(path[i], path[i - 1], 0.5));
    pathProper.push(pathProper[i - 1] + movingClockRate(r, v, mSmbh) * dt);
  }
  return {
    kind: "orbital",
    from,
    to,
    departTime: leg.departTime,
    arriveTime: leg.departTime + leg.timeOfFlight,
    dv: leg.dvTotal,
    massRatio: Math.exp(leg.dvTotal / exhaustVelocity),
    properTime: pathProper[pathProper.length - 1],
    path,
    pathTimes,
    pathProper,
  };
}

export function torchShipLeg(from: Blanet, to: Blanet, flight: TorchFlight): ShipLeg {
  const steps = 64;
  const path: Vec3[] = [];
  const pathTimes: number[] = [];
  const pathProper: number[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = flight.departTime + (flight.coordinateTime * i) / steps;
    const s = torchProgress(flight, t);
    path.push(s.position);
    pathTimes.push(t);
    pathProper.push(s.properTime);
  }
  return {
    kind: "torch",
    from,
    to,
    departTime: flight.departTime,
    arriveTime: flight.arriveTime,
    dv: flight.peakSpeed * 2,
    massRatio: flight.massRatio,
    properTime: flight.properTime,
    path,
    pathTimes,
    pathProper,
    torch: flight,
  };
}

function interpolate(leg: ShipLeg, t: number): { position: Vec3; proper: number; speed: number } {
  if (leg.torch) {
    const s = torchProgress(leg.torch, t);
    return { position: s.position, proper: s.properTime, speed: s.speed };
  }
  const times = leg.pathTimes;
  const f = (t - times[0]) / (times[times.length - 1] - times[0]);
  const x = Math.min(Math.max(f, 0), 1) * (times.length - 1);
  const i = Math.min(Math.floor(x), times.length - 2);
  const u = x - i;
  const dt = times[i + 1] - times[i];
  return {
    position: lerp(leg.path[i], leg.path[i + 1], u),
    proper: leg.pathProper[i] + u * (leg.pathProper[i + 1] - leg.pathProper[i]),
    speed: distance(leg.path[i], leg.path[i + 1]) / dt,
  };
}

export function shipStateAt(ship: Ship, t: number, mSmbh: number): ShipState {
  let proper = 0;
  let clock = ship.startTime;
  let location = ship.legs[0].from;
  for (let i = 0; i < ship.legs.length; i++) {
    const leg = ship.legs[i];
    const waitEnd = Math.min(t, leg.departTime);
    if (waitEnd > clock) proper += circularOrbitClockRate(location.orbit.radius, mSmbh) * (waitEnd - clock);
    if (t < leg.departTime) {
      return { position: orbitalPosition(location.orbit, mSmbh, t), properTime: proper, status: "waiting", legIndex: i, speed: 0 };
    }
    if (t < leg.arriveTime) {
      const s = interpolate(leg, t);
      return { position: s.position, properTime: proper + s.proper, status: "flying", legIndex: i, speed: s.speed };
    }
    proper += leg.properTime;
    clock = leg.arriveTime;
    location = leg.to;
  }
  proper += circularOrbitClockRate(location.orbit.radius, mSmbh) * Math.max(t - clock, 0);
  return {
    position: orbitalPosition(location.orbit, mSmbh, t),
    properTime: proper,
    status: "arrived",
    legIndex: ship.legs.length - 1,
    speed: 0,
  };
}
