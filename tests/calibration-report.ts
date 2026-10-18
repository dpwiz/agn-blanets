import { CASES, runCase } from "./calibration-cases";

const rows = CASES.map((c) => {
  const r = runCase(c);
  return {
    case: r.label,
    maxDex: r.maxDex.toFixed(3),
    meanDex: r.meanDex.toFixed(3),
    tol: r.tolerance,
    ok: r.maxDex <= r.tolerance ? "✓" : "✗",
    worstR: r.worst.rPc,
    paper: r.worst.paper.toPrecision(3),
    model: r.worst.model.toPrecision(3),
  };
});
console.table(rows);
