import { describe, expect, it } from "vitest";
import { HYDROGEN_BURNING_MASS, M_JUP, M_SUN, PC } from "../src/physics/constants";
import { epochState, gasRemaining, massAtAge, radiusWhereTemperature, stellarLifetimeYr, type GrowthTrack } from "../src/physics/era";
import { fateOf } from "../src/physics/fate";
import { DEFAULT_PARAMS } from "../src/physics/params";

const track = (overrides: Partial<GrowthTrack> = {}): GrowthTrack => ({
  birthMass: 8 * M_JUP,
  bornYr: 2e6,
  efoldingTimeYr: 2.6e6,
  ceilingMass: 2000 * M_SUN,
  growthEndsYr: 1e7,
  ...overrides,
});

describe("growth through time", () => {
  it("keeps the birth mass before the body forms", () => {
    const t = track();
    expect(massAtAge(t, 1e6)).toBe(t.birthMass);
    expect(epochState(t, 1e6).stage).toBe("dust");
  });

  it("stops growing when the AGN switches off", () => {
    const t = track();
    expect(massAtAge(t, 5e7)).toBe(massAtAge(t, 1e7));
  });

  it("never exceeds the ceiling", () => {
    const t = track({ efoldingTimeYr: 1e3, ceilingMass: 300 * M_SUN });
    expect(massAtAge(t, 1e7)).toBe(300 * M_SUN);
  });

  it("matches the paper's fate rule for a body born at the start", () => {
    const t = track({ bornYr: 0, ceilingMass: 3000 * M_SUN });
    const fate = fateOf({ mass: t.birthMass, doublingTime: t.efoldingTimeYr * 3.15576e7, thermalMass: t.ceilingMass, regime: "bondi", agnLifetimeYr: t.growthEndsYr });
    expect(massAtAge(t, t.growthEndsYr) / fate.projectedMass).toBeCloseTo(1, 6);
  });

  it("marks bodies that never form", () => {
    expect(epochState(track({ bornYr: Infinity }), 1e8).stage).toBe("never");
  });

  it("turns a massive star into a remnant only after its lifetime", () => {
    const t = track({ bornYr: 0, birthMass: 50 * M_SUN, efoldingTimeYr: 1e5 });
    const life = stellarLifetimeYr(t.ceilingMass);
    expect(epochState(t, 1e5 + life * 0.9).stage).toBe("massiveStar");
    expect(epochState(t, 1e5 + life * 1.1).stage).toBe("remnant");
  });

  it("leaves a stellar-mass dust ball unlit unless it grows", () => {
    const t = track({ bornYr: 0, birthMass: 1.4 * M_SUN, efoldingTimeYr: 1e12 });
    expect(epochState(t, 1e9).stage).toBe("dustStar");
  });

  it("ignites hydrogen at the burning limit", () => {
    const t = track({ bornYr: 0, efoldingTimeYr: 1e6 });
    const s = epochState(t, 1e7);
    expect(s.mass).toBeGreaterThan(HYDROGEN_BURNING_MASS);
    expect(s.ignitedYr).toBeCloseTo(1e6 * Math.log(HYDROGEN_BURNING_MASS / t.birthMass), 0);
  });

  it("clears the gas after the AGN dies", () => {
    expect(gasRemaining(5e6, DEFAULT_PARAMS)).toBe(1);
    expect(gasRemaining(1e8, DEFAULT_PARAMS)).toBe(0);
  });
});

describe("ambient temperature landmarks", () => {
  it("puts the 273 K isotherm near 1.55 pc for the fiducial torus", () => {
    expect(radiusWhereTemperature(273, DEFAULT_PARAMS)! / PC).toBeCloseTo(1.55, 1);
  });
});
