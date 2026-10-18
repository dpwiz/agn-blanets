import { describe, expect, it } from "vitest";
import { G, C_LIGHT, M_SUN, PC } from "../src/physics/constants";
import { BANDS, DEFAULT_RIG, dustOpacity, linkBudget, opticalDepth, pathDepth, shapiroDelay, type CommsEnvironment } from "../src/physics/comms";
import { buildDiskTable, type DiskTable } from "../src/physics/disktable";
import { DEFAULT_PARAMS } from "../src/physics/params";
import { buildNetwork, pairCoverage, shortestRoute } from "../src/physics/network";
import { circularOrbitClockRate } from "../src/physics/clocks";
import type { Vec3 } from "../src/physics/vec";

const M = 1e8 * M_SUN;

function uniformSlabTable(sigma: number, H: number, grain: number): DiskTable {
  const n = 4;
  return {
    logR0: Math.log(0.01 * PC),
    dLogR: Math.log(1e4) / (n - 1),
    count: n,
    rMin: 0.01 * PC,
    rMax: 100 * PC,
    sigma: new Float64Array(n).fill(sigma),
    scaleHeight: new Float64Array(n).fill(H),
    dustScaleHeight: new Float64Array(n).fill(H),
    grainSize: new Float64Array(n).fill(grain),
    metallicity: 0.01,
    grainDensity: 3000,
  };
}

describe("Shapiro delay", () => {
  it("matches direct integration of the weak-field delay", () => {
    const a: Vec3 = [1 * PC, 0.001 * PC, 0];
    const b: Vec3 = [-1.5 * PC, 0.001 * PC, 0];
    const n = 200000;
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const p = [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1]), a[2] + t * (b[2] - a[2])];
      sum += ((2 * G * M) / C_LIGHT ** 3) * (1 / Math.hypot(p[0], p[1], p[2])) * (2.5 * PC / n);
    }
    expect(shapiroDelay(a, b, M) / sum).toBeCloseTo(1, 2);
  });
});

describe("optical depth", () => {
  it("integrates a vertical column through a Gaussian slab to κΣ_d", () => {
    const sigma = 1000;
    const H = 0.01 * PC;
    const grain = 1e-3;
    const table = uniformSlabTable(sigma, H, grain);
    const band = BANDS.laser;
    const depth = opticalDepth([1 * PC, 0, -20 * H], [1 * PC, 0, 20 * H], band, table);
    const expected = dustOpacity(grain, band.wavelength, 3000) * 0.01 * sigma;
    expect(depth.dust / expected).toBeCloseTo(1, 2);
  });
});

describe("links through the model torus", () => {
  const table = buildDiskTable(DEFAULT_PARAMS);
  const env: CommsEnvironment = { table, mSmbh: M, agnLuminosity: DEFAULT_PARAMS.irradiationLuminosity, innerDiskRadius: 0.1 * PC, gasFraction: 1 };
  it("long-wavelength radio penetrates the dust layer far better than a laser", () => {
    const a: Vec3 = [1 * PC, 0, 0];
    const b: Vec3 = [1.01 * PC, 0.005 * PC, 0];
    const radio = linkBudget(a, b, BANDS.lband, DEFAULT_RIG, env);
    const laser = linkBudget(a, b, BANDS.laser, DEFAULT_RIG, env);
    expect(radio.tau).toBeLessThan(laser.tau);
    expect(radio.lightDelay).toBeCloseTo((Math.hypot(0.01, 0.005) * PC) / C_LIGHT, 0);
  });
  it("the SMBH occults links across the inner disk", () => {
    const l = linkBudget([1 * PC, 0.01 * PC, 0.001 * PC], [-1 * PC, 0.01 * PC, -0.001 * PC], BANDS.ka, DEFAULT_RIG, env);
    expect(l.occultation).toBe("innerDisk");
    expect(l.capacity).toBe(0);
  });
  it("routes through relays when direct links fail", () => {
    const pts: Vec3[] = [0, 1, 2, 3].map((i) => [(1 + 0.004 * i) * PC, 0, 0]);
    const g = buildNetwork(pts, env, { band: "lband", rig: DEFAULT_RIG, minCapacity: 1, maxRange: 0.005 * PC, relayDelay: 1 });
    const route = shortestRoute(g, 0, 3, 1)!;
    expect(route.nodes).toEqual([0, 1, 2, 3]);
    expect(pairCoverage(g)).toBe(1);
  });
});

describe("clocks", () => {
  it("runs a few minutes per year slow at a parsec from 1e8 M☉", () => {
    const lag = (1 - circularOrbitClockRate(PC, M)) * 3.15576e7;
    expect(lag / 60).toBeGreaterThan(2);
    expect(lag / 60).toBeLessThan(10);
  });
});

describe("gas clearing", () => {
  it("scales the optical depth with the gas that remains", () => {
    const table = buildDiskTable(DEFAULT_PARAMS);
    const env = (gasFraction: number): CommsEnvironment => ({ table, mSmbh: M, agnLuminosity: 0, innerDiskRadius: 0.1 * PC, gasFraction });
    const a: [number, number, number] = [1 * PC, 0, 0];
    const b: [number, number, number] = [1.03 * PC, 0.01 * PC, 0];
    const full = pathDepth(a, b, BANDS.laser, env(1));
    expect(pathDepth(a, b, BANDS.laser, env(0.25)).dust / full.dust).toBeCloseTo(0.25, 10);
    expect(pathDepth(a, b, BANDS.laser, env(0)).dust).toBe(0);
  });
});
