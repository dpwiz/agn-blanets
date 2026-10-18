import { cross, dot, norm, scale, sub, type Vec3 } from "./vec";

export interface LambertSolution {
  v1: Vec3;
  v2: Vec3;
}

function stumpffC(z: number): number {
  if (z > 1e-8) return (1 - Math.cos(Math.sqrt(z))) / z;
  if (z < -1e-8) return (Math.cosh(Math.sqrt(-z)) - 1) / -z;
  return 0.5 - z / 24 + (z * z) / 720;
}

function stumpffS(z: number): number {
  if (z > 1e-8) {
    const s = Math.sqrt(z);
    return (s - Math.sin(s)) / (s * s * s);
  }
  if (z < -1e-8) {
    const s = Math.sqrt(-z);
    return (Math.sinh(s) - s) / (s * s * s);
  }
  return 1 / 6 - z / 120 + (z * z) / 5040;
}

export function solveLambert(r1v: Vec3, r2v: Vec3, tof: number, mu: number, prograde = true): LambertSolution | null {
  const r1 = norm(r1v);
  const r2 = norm(r2v);
  const cosDTheta = Math.min(Math.max(dot(r1v, r2v) / (r1 * r2), -1), 1);
  let dTheta = Math.acos(cosDTheta);
  const crossZ = cross(r1v, r2v)[2];
  if ((prograde && crossZ < 0) || (!prograde && crossZ >= 0)) dTheta = 2 * Math.PI - dTheta;
  const sinDTheta = Math.sin(dTheta);
  if (Math.abs(1 - cosDTheta) < 1e-12) return null;
  const A = sinDTheta * Math.sqrt((r1 * r2) / (1 - cosDTheta));
  if (Math.abs(A) < 1e-12) return null;

  const y = (z: number) => r1 + r2 + (A * (z * stumpffS(z) - 1)) / Math.sqrt(stumpffC(z));
  const timeOfFlight = (z: number) => {
    const yz = y(z);
    if (yz < 0) return -Infinity;
    return ((yz / stumpffC(z)) ** 1.5 * stumpffS(z) + A * Math.sqrt(yz)) / Math.sqrt(mu);
  };

  const zMax = 4 * Math.PI * Math.PI - 1e-9;
  let zLow = -4 * Math.PI * Math.PI;
  if (y(zLow) < 0) {
    let a = zLow;
    let b = zMax;
    for (let i = 0; i < 200; i++) {
      const m = 0.5 * (a + b);
      if (y(m) < 0) a = m;
      else b = m;
    }
    zLow = b;
  }
  while (timeOfFlight(zLow) > tof && zLow > -1e6) zLow *= 2;
  if (timeOfFlight(zMax) < tof) return null;
  let lo = zLow;
  let hi = zMax;
  for (let i = 0; i < 200; i++) {
    const mid = 0.5 * (lo + hi);
    if (timeOfFlight(mid) < tof) lo = mid;
    else hi = mid;
  }
  const z = 0.5 * (lo + hi);
  const yz = y(z);
  if (!(yz > 0)) return null;
  const f = 1 - yz / r1;
  const g = A * Math.sqrt(yz / mu);
  const gDot = 1 - yz / r2;
  const v1 = scale(sub(r2v, scale(r1v, f)), 1 / g);
  const v2 = scale(sub(scale(r2v, gDot), r1v), 1 / g);
  return { v1, v2 };
}
