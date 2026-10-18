import { G } from "./constants";
import type { Vec3 } from "./vec";

export interface CircularOrbit {
  radius: number;
  inclination: number;
  node: number;
  phase0: number;
}

export function meanMotion(radius: number, mSmbh: number): number {
  return Math.sqrt((G * mSmbh) / radius ** 3);
}

export function orbitalPeriod(radius: number, mSmbh: number): number {
  return (2 * Math.PI) / meanMotion(radius, mSmbh);
}

function orient(x: number, y: number, orbit: CircularOrbit): Vec3 {
  const ci = Math.cos(orbit.inclination);
  const si = Math.sin(orbit.inclination);
  const cn = Math.cos(orbit.node);
  const sn = Math.sin(orbit.node);
  const yInc = y * ci;
  const zInc = y * si;
  return [x * cn - yInc * sn, x * sn + yInc * cn, zInc];
}

export function orbitalState(orbit: CircularOrbit, mSmbh: number, t: number): { position: Vec3; velocity: Vec3 } {
  const n = meanMotion(orbit.radius, mSmbh);
  const theta = orbit.phase0 + n * t;
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  const v = n * orbit.radius;
  return {
    position: orient(orbit.radius * c, orbit.radius * s, orbit),
    velocity: orient(-v * s, v * c, orbit),
  };
}

export function orbitalPosition(orbit: CircularOrbit, mSmbh: number, t: number): Vec3 {
  return orbitalState(orbit, mSmbh, t).position;
}

export function orbitPath(orbit: CircularOrbit, segments = 128): Vec3[] {
  const pts: Vec3[] = [];
  for (let i = 0; i <= segments; i++) {
    const theta = (2 * Math.PI * i) / segments;
    pts.push(orient(orbit.radius * Math.cos(theta), orbit.radius * Math.sin(theta), orbit));
  }
  return pts;
}

export function propagateKepler(r0: Vec3, v0: Vec3, mu: number, dt: number, steps = 64): Vec3[] {
  const out: Vec3[] = [r0];
  let r: Vec3 = [...r0];
  let v: Vec3 = [...v0];
  const h = dt / steps;
  const acc = (p: Vec3): Vec3 => {
    const d = Math.hypot(p[0], p[1], p[2]);
    const k = -mu / (d * d * d);
    return [p[0] * k, p[1] * k, p[2] * k];
  };
  const sub = 8;
  const hs = h / sub;
  for (let i = 0; i < steps; i++) {
    for (let j = 0; j < sub; j++) {
      const a0 = acc(r);
      const vHalf: Vec3 = [v[0] + 0.5 * hs * a0[0], v[1] + 0.5 * hs * a0[1], v[2] + 0.5 * hs * a0[2]];
      r = [r[0] + hs * vHalf[0], r[1] + hs * vHalf[1], r[2] + hs * vHalf[2]];
      const a1 = acc(r);
      v = [vHalf[0] + 0.5 * hs * a1[0], vHalf[1] + 0.5 * hs * a1[1], vHalf[2] + 0.5 * hs * a1[2]];
    }
    out.push([...r]);
  }
  return out;
}
