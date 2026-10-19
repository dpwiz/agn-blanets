import { describe, expect, it } from "vitest";
import { PC } from "../src/physics/constants";
import { frostLine, frostPoint, iceVapourPressure } from "../src/physics/ice";
import { DEFAULT_PARAMS } from "../src/physics/params";

describe("water frost at torus densities", () => {
  it("matches the Murphy & Koop vapour pressure at 150 K", () => {
    expect(iceVapourPressure(150)).toBeCloseTo(6.1e-6, 6);
  });

  it("puts the frost point near 120 K at the 1 pc midplane density", () => {
    expect(frostPoint(2.8e14)).toBeCloseTo(119, 0);
  });

  it("keeps water as vapour across the shining torus at a 100 K background", () => {
    const line = frostLine(DEFAULT_PARAMS, 1);
    expect(line.radius).toBeNull();
    expect(line.everywhere).toBe(false);
  });

  it("freezes water on the grains inside ~25 pc once the AGN is off", () => {
    const line = frostLine({ ...DEFAULT_PARAMS, irradiationLuminosity: 0 }, 1);
    expect(line.frostyInside).toBe(true);
    expect(line.radius! / PC).toBeGreaterThan(15);
    expect(line.radius! / PC).toBeLessThan(40);
  });
});
