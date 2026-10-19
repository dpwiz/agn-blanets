import { describe, expect, it } from "vitest";
import { PC } from "../src/physics/constants";
import { finalMass, formsDuringAgn, growthTrack } from "../src/physics/era";
import { gasGathered, growthLimits, hydrogenMass, MIN_STELLAR_HYDROGEN, supplyMass } from "../src/physics/growth";
import { radialState } from "../src/physics/model";
import { withParams } from "../src/physics/params";
import { populationProfile } from "../src/physics/population";

describe("growth on a shared dust supply", () => {
  const p = withParams({ stSI: 1e-3 });

  it("eats exactly the ring's leftover dust at the supply mass", () => {
    for (const rPc of [0.1, 1, 10]) {
      const s = radialState(rPc * PC, p);
      const limits = growthLimits(s);
      const m0 = s.planetesimalMass;
      const top = supplyMass(m0, limits);
      const eaten = top - m0 - gasGathered(m0, top, limits);
      expect(eaten / limits.dustLeftPerBody).toBeCloseTo(1, 6);
    }
  });

  it("gathers gas at 2/9 of the pebble rate above the Bondi–Hill switch", () => {
    const limits = growthLimits(radialState(1 * PC, p));
    const a = limits.bondiHillMass * 2;
    const b = limits.bondiHillMass * 3;
    expect(gasGathered(a, b, limits) / (b - a)).toBeCloseTo(2 / 11, 6);
  });

  it("keeps the population within the torus's dust", () => {
    for (const params of [p, withParams({ vFrag: 10 })]) {
      const pop = populationProfile(params, 160);
      let eaten = 0;
      let dust = 0;
      for (const b of pop.bins) {
        const s = b.state;
        const area = Math.PI * (b.rOuter ** 2 - b.rInner ** 2);
        dust += s.disk.sigma * params.metallicity * area;
        if (!formsDuringAgn(s)) continue;
        const m0 = s.planetesimalMass;
        const end = finalMass(growthTrack(s, m0, s.accretion.doublingTime, params));
        eaten += b.planets * (end - gasGathered(m0, end, growthLimits(s)));
      }
      expect(eaten).toBeLessThanOrEqual(dust * 1.0001);
    }
  });

  it("measures hydrogen against the lightest ordinary star", () => {
    const limits = growthLimits(radialState(1 * PC, p));
    const m0 = radialState(1 * PC, p).planetesimalMass;
    expect(hydrogenMass(m0, m0, limits)).toBe(0);
    expect(MIN_STELLAR_HYDROGEN).toBeGreaterThan(0);
  });
});
