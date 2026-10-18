import { describe, expect, it } from "vitest";
import { G, M_SUN, PC, YR, C_LIGHT, M_JUP } from "../src/physics/constants";
import { solveLambert } from "../src/physics/lambert";
import { orbitalState, propagateKepler, type CircularOrbit } from "../src/physics/kepler";
import { hohmannTime, transferLeg, porkchop, type Body } from "../src/physics/transfer";
import { brachistochrone, newtonianBrachistochroneTime, torchIntercept, torchProgress } from "../src/physics/torch";
import { norm, sub } from "../src/physics/vec";

const M = 1e8 * M_SUN;
const mu = G * M;

describe("Lambert solver", () => {
  it("recovers a Hohmann transfer between circular orbits", () => {
    const r1 = 1 * PC;
    const r2 = 2 * PC;
    const tof = hohmannTime(r1, r2, M);
    const sol = solveLambert([r1, 0, 0], [-r2, 1e-6 * r2, 0], tof, mu);
    expect(sol).not.toBeNull();
    const a = (r1 + r2) / 2;
    const vPeri = Math.sqrt(mu * (2 / r1 - 1 / a));
    const vApo = Math.sqrt(mu * (2 / r2 - 1 / a));
    expect(norm(sol!.v1) / vPeri).toBeCloseTo(1, 3);
    expect(norm(sol!.v2) / vApo).toBeCloseTo(1, 3);
  });

  it("is consistent with numerical propagation for an arbitrary 3D arc", () => {
    const r1: [number, number, number] = [1.3 * PC, 0.2 * PC, 0.05 * PC];
    const r2: [number, number, number] = [-0.4 * PC, 1.7 * PC, -0.02 * PC];
    const tof = 0.4 * hohmannTime(1.3 * PC, 1.7 * PC, M);
    const sol = solveLambert(r1, r2, tof, mu)!;
    const path = propagateKepler(r1, sol.v1, mu, tof, 400);
    expect(norm(sub(path[path.length - 1], r2)) / norm(r2)).toBeLessThan(1e-4);
  });
});

describe("orbital transfers between blanets", () => {
  const body = (radius: number, phase0: number): Body => ({
    id: 0,
    orbit: { radius, inclination: 0, node: 0, phase0 },
    mass: 10 * M_JUP,
    radius: 7e7,
  });
  it("finds a cheap window close to the Hohmann cost for coplanar orbits", () => {
    const a = body(1 * PC, 0);
    const b = body(1.05 * PC, 0.3);
    const th = hohmannTime(a.orbit.radius, b.orbit.radius, M);
    const pc = porkchop(a, b, M, 0, 2 * th * 40, 0.5 * th, 1.5 * th, 64, 32);
    expect(pc.best).not.toBeNull();
    const hohmannDv = Math.sqrt(mu / a.orbit.radius) * (Math.sqrt((2 * b.orbit.radius) / (a.orbit.radius + b.orbit.radius)) - 1);
    expect(pc.best!.vInfDepart).toBeLessThan(5 * hohmannDv);
    const leg = transferLeg(a, b, M, pc.best!.departTime, pc.best!.timeOfFlight)!;
    expect(leg.dvTotal).toBeCloseTo(pc.best!.dvTotal, 6);
  });
});

describe("relativistic torchship", () => {
  it("matches Newtonian time when a·d ≪ c²", () => {
    const d = 1e12;
    const a = 9.81;
    const p = brachistochrone(d, a);
    expect(p.coordinateTime / newtonianBrachistochroneTime(d, a)).toBeCloseTo(1, 4);
    expect(p.properTime / p.coordinateTime).toBeCloseTo(1, 4);
  });

  it("shows strong time dilation over a parsec at 1 g", () => {
    const p = brachistochrone(PC, 9.81);
    expect(p.properTime / YR).toBeGreaterThan(3);
    expect(p.properTime / YR).toBeLessThan(5);
    expect(p.coordinateTime / YR).toBeGreaterThan(p.properTime / YR);
    expect(p.peakSpeed / C_LIGHT).toBeGreaterThan(0.8);
  });

  it("intercepts a moving target and ends on it", () => {
    const from: CircularOrbit = { radius: 1 * PC, inclination: 0, node: 0, phase0: 0 };
    const to: CircularOrbit = { radius: 1.2 * PC, inclination: 0.01, node: 1, phase0: 2 };
    const f = torchIntercept(from, to, M, 0, 9.81, 0.5 * C_LIGHT);
    const end = torchProgress(f, f.arriveTime);
    const target = orbitalState(to, M, f.arriveTime).position;
    expect(norm(sub(end.position, target)) / PC).toBeLessThan(1e-6);
    expect(end.properTime).toBeCloseTo(f.properTime, 0);
  });
});
