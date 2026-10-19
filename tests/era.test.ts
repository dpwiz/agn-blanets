import { describe, expect, it } from "vitest";
import { M_JUP, M_SUN, PC } from "../src/physics/constants";
import { epochState, gasRemaining, growthTrack, massAtAge, radiusWhereTemperature, stellarLifetimeYr, type GrowthTrack } from "../src/physics/era";
import { fateOf } from "../src/physics/fate";
import { growthLimits } from "../src/physics/growth";
import { radialState } from "../src/physics/model";
import { DEFAULT_PARAMS, withParams } from "../src/physics/params";

const track = (overrides: Partial<GrowthTrack> = {}): GrowthTrack => ({
  birthMass: 8 * M_JUP,
  bornYr: 2e6,
  efoldingTimeYr: 2.6e6,
  supplyMass: 0.3 * M_SUN,
  ceilingMass: 2000 * M_SUN,
  growthEndsYr: 1e7,
  ignitionMass: null,
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

  it("levels off at the ring's dust supply", () => {
    const t = track({ efoldingTimeYr: 1e5 });
    expect(massAtAge(t, 1e7) / t.supplyMass).toBeCloseTo(1, 6);
    expect(massAtAge(t, 3e6)).toBeLessThan(t.supplyMass);
  });

  it("never exceeds the thermal mass", () => {
    const t = track({ efoldingTimeYr: 1e3, supplyMass: 500 * M_SUN, ceilingMass: 300 * M_SUN });
    expect(massAtAge(t, 1e7)).toBe(300 * M_SUN);
  });

  it("matches the fate rule for a body born at the start", () => {
    const p = withParams({ stSI: 1e-3 });
    const s = radialState(1 * PC, p);
    const t = { ...growthTrack(s, s.planetesimalMass, s.accretion.doublingTime, p), bornYr: 0 };
    const fate = fateOf({ mass: t.birthMass, doublingTime: s.accretion.doublingTime, limits: growthLimits(s), regime: "bondi", agnLifetimeYr: t.growthEndsYr });
    expect(massAtAge(t, t.growthEndsYr) / fate.projectedMass).toBeCloseTo(1, 6);
  });

  it("marks bodies that never form", () => {
    expect(epochState(track({ bornYr: Infinity }), 1e8).stage).toBe("never");
  });

  it("turns a massive star into a remnant only after its lifetime", () => {
    const t = track({ bornYr: 0, birthMass: 1 * M_SUN, supplyMass: 60 * M_SUN, efoldingTimeYr: 1e4, ignitionMass: 1.5 * M_SUN });
    const s = epochState(t, 2e5);
    expect(s.stage).toBe("massiveStar");
    const life = stellarLifetimeYr(massAtAge(t, t.growthEndsYr));
    expect(epochState(t, s.ignitedYr! + life * 0.9).stage).toBe("massiveStar");
    expect(epochState(t, s.ignitedYr! + life * 1.1).stage).toBe("remnant");
  });

  it("leaves a stellar-mass body without hydrogen unlit", () => {
    const t = track({ bornYr: 0, birthMass: 1.4 * M_SUN, supplyMass: 3 * M_SUN, efoldingTimeYr: 1e5 });
    expect(epochState(t, 1e9).stage).toBe("dustStar");
  });

  it("ignites when the body has gathered its hydrogen", () => {
    const t = track({ bornYr: 0, efoldingTimeYr: 1e6, ignitionMass: 0.2 * M_SUN });
    const s = epochState(t, 1e7);
    expect(s.ignitedYr).not.toBeNull();
    expect(massAtAge(t, s.ignitedYr!) / t.ignitionMass!).toBeCloseTo(1, 4);
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
