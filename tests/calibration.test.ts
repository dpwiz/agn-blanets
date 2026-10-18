import { describe, expect, it } from "vitest";
import { CASES, runCase } from "./calibration-cases";

describe("reproduces the paper's figures", () => {
  for (const c of CASES) {
    it(`${c.figure} ${c.panel} ${c.series}`, () => {
      const result = runCase(c);
      expect(result.maxDex, JSON.stringify(result.worst)).toBeLessThanOrEqual(c.tolerance);
    });
  }
});
