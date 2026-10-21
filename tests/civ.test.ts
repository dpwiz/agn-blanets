import { describe, expect, it } from "vitest";
import { M_SUN, PC } from "../src/physics/constants";
import { ORGANICS_FRONT_K, SULFIDE_FRONT_K } from "../src/physics/chemistry";
import { kardashev, nicheAt, nicheRoutes, resourceAt, settlementTimes, skyAt, type Niche } from "../src/physics/civ";
import { radiusWhereTemperature } from "../src/physics/era";
import { DEFAULT_PARAMS, withParams } from "../src/physics/params";
import { populationProfile } from "../src/physics/population";
import { hohmannDeltaV } from "../src/physics/transfer";

const p = withParams({ stSI: 1e-3 });
const pop = populationProfile(p, 200);
const binAt = (rPc: number) => pop.bins.find((b) => b.rOuter >= rPc * PC)!;
const nicheAtRadius = (rPc: number, ageYr: number): Niche => nicheAt(binAt(rPc), p, skyAt(p, ageYr));

describe("condensation fronts", () => {
  it("puts sulfide near 0.17 pc and organics near 0.38 pc", () => {
    expect(radiusWhereTemperature(SULFIDE_FRONT_K, DEFAULT_PARAMS)! / PC).toBeCloseTo(0.17, 1);
    expect(radiusWhereTemperature(ORGANICS_FRONT_K, DEFAULT_PARAMS)! / PC).toBeCloseTo(0.38, 1);
  });
});

describe("niches through time", () => {
  it("fills the inner torus with a hydrogen well once growth is done", () => {
    expect(nicheAtRadius(0.15, 1e9)).toBe("hydrogenWell");
    expect(nicheAtRadius(0.4, 1e9)).toBe("hydrogenWell");
    expect(nicheAtRadius(10, 1e9)).toBe("coldRock");
  });

  it("frosts the grains only after the AGN switches off", () => {
    expect(nicheAtRadius(5, 5e6)).not.toBe("frost");
    expect(nicheAtRadius(5, 1.1e7)).toBe("frost");
    expect(nicheAtRadius(5, 1.3e7)).not.toBe("frost");
  });

  it("marks the liquid-water band while the AGN shines", () => {
    expect(nicheAtRadius(1.45, 5e6)).toBe("temperate");
  });
});

describe("resources", () => {
  it("locks the inner metals inside bodies once they have eaten their dust", () => {
    const stock = resourceAt(binAt(0.1), p, skyAt(p, 5e6), "metals");
    expect(stock.inBodies).toBeGreaterThan(100 * stock.onGrains);
  });

  it("keeps water off the grains while the AGN shines", () => {
    expect(resourceAt(binAt(1), p, skyAt(p, 5e6), "water").onGrains).toBe(0);
    expect(resourceAt(binAt(1), p, skyAt(p, 1.1e7), "water").onGrains).toBeGreaterThan(0);
  });
});

describe("settlement spread", () => {
  const seed = { radius: 1 * PC, yr: 2e6 };
  const orbital = settlementTimes(pop, p, seed, "orbital");
  const torch = settlementTimes(pop, p, seed, "torch");
  const at = (times: number[], rPc: number) => times[pop.bins.findIndex((b) => b.rOuter >= rPc * PC)];

  it("arrives later the farther from the seed", () => {
    expect(at(orbital, 3)).toBeGreaterThan(at(orbital, 2));
    expect(at(orbital, 30)).toBeGreaterThan(at(orbital, 10));
    expect(at(orbital, 0.1)).toBeGreaterThan(at(orbital, 0.5));
  });

  it("spreads faster by torch", () => {
    expect(at(torch, 100)).toBeLessThan(at(orbital, 100));
  });
});

describe("routes between niches", () => {
  it("runs the hydrogen route outward from the well and the band route to cold rock", () => {
    const zones = [
      { key: "hydrogenWell", inner: 0.1 * PC, outer: 0.4 * PC },
      { key: "glowMoons", inner: 0.4 * PC, outer: 0.8 * PC },
      { key: "temperate", inner: 0.8 * PC, outer: 1.5 * PC },
      { key: "coldRock", inner: 1.5 * PC, outer: 100 * PC },
    ];
    const routes = nicheRoutes(zones);
    expect(routes.map((r) => r.name)).toEqual(["Hydrogen route", "Out to the cold realm"]);
    expect(routes[0].from).toBeCloseTo(0.2 * PC, -12);
    expect(routes[1].to).toBeCloseTo(Math.sqrt(150) * PC, -12);
  });
});

describe("travel and power scales", () => {
  it("matches the notes' Hohmann cost from the temperate band to the cold torus", () => {
    expect(hohmannDeltaV(1.5 * PC, 6 * PC, 1e8 * M_SUN) / 1e3).toBeCloseTo(240, 0);
  });

  it("puts humanity near Kardashev 0.7", () => {
    expect(kardashev(2e13)).toBeCloseTo(0.73, 2);
  });
});
