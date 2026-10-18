import fixtures from "./fixtures/paper-figs.json";
import { M_JUP, MYR, PC, YR } from "../src/physics/constants";
import { radialState, type RadialState } from "../src/physics/model";
import { DEFAULT_PARAMS, type ModelParams } from "../src/physics/params";
import { grainSizeForStokes } from "../src/physics/dust";
import { klahrSchreiberPlanetesimalMass, liuPlanetesimalMass } from "../src/physics/planetesimals";
import { populationProfile } from "../src/physics/population";

type Series = Record<string, [number, number][]>;
type Figures = Record<string, Record<string, Series>>;

export interface CalibrationCase {
  figure: string;
  panel: string;
  series: string;
  tolerance: number;
  overrides?: Partial<ModelParams>;
  skipEdges?: boolean;
  evaluate: (s: RadialState, p: ModelParams) => number;
  cumulative?: (p: ModelParams) => (rPc: number) => number;
}

export interface CaseResult {
  label: string;
  maxDex: number;
  meanDex: number;
  worst: { rPc: number; paper: number; model: number };
  tolerance: number;
}

const MASSES = ["1e7", "1e8", "1e9"] as const;

const FIG1 = "sgdisk_alpha1em4_mbhvar_zoom";
const FIG2 = "streaminginstabilitymbhStSI1e-2vfrag100";
const FIG5: Partial<ModelParams> = { pebbleAccretionModel: "paperFig5" };

function perMass(
  base: Omit<CalibrationCase, "series" | "overrides">,
  kind: string,
  overrides: Partial<ModelParams> = {},
): CalibrationCase[] {
  return MASSES.map((m) => ({ ...base, series: `${m}:${kind}`, overrides: { ...overrides, mSmbhMsun: Number(m) } }));
}

function cumulativeAt(field: "cumulativeFilaments" | "cumulativePlanets") {
  return (p: ModelParams) => {
    const pop = populationProfile(p, 400);
    return (rPc: number) => {
      const r = rPc * PC;
      const bin = pop.bins.find((b) => b.rOuter >= r) ?? pop.bins[pop.bins.length - 1];
      return bin[field];
    };
  };
}

const sizeMm = (stokes: (s: RadialState) => number) => (s: RadialState, p: ModelParams) =>
  grainSizeForStokes(stokes(s), s.disk, p) * 1e3;

export const CASES: CalibrationCase[] = [
  ...perMass({ figure: FIG1, panel: "rho_cgs", tolerance: 0.02, evaluate: (s) => s.disk.rho / 1000 }, "solid"),
  ...perMass({ figure: FIG1, panel: "T", tolerance: 0.02, evaluate: (s) => s.disk.temperature }, "solid"),
  ...perMass({ figure: FIG1, panel: "Sigma_cgs", tolerance: 0.02, evaluate: (s) => s.disk.sigma / 10 }, "solid"),
  ...perMass({ figure: FIG1, panel: "h", tolerance: 0.02, evaluate: (s) => s.disk.h }, "solid"),
  ...perMass({ figure: FIG2, panel: "St", tolerance: 0.03, evaluate: (s) => s.dust.stFrag }, "dashdot"),
  ...perMass({ figure: FIG2, panel: "St", tolerance: 0.05, skipEdges: true, evaluate: (s) => s.dust.stDrift }, "solid"),
  ...perMass({ figure: FIG2, panel: "a_mm", tolerance: 0.03, evaluate: sizeMm((s) => s.dust.stFrag) }, "dashdot"),
  ...perMass({ figure: FIG2, panel: "a_mm", tolerance: 0.05, skipEdges: true, evaluate: sizeMm((s) => s.dust.stDrift) }, "solid"),
  ...perMass({ figure: FIG2, panel: "t_grow_Myr", tolerance: 0.02, evaluate: (s) => s.dust.tGrow / MYR }, "solid"),
  ...perMass({ figure: FIG2, panel: "t_SI_Myr", tolerance: 0.05, skipEdges: true, evaluate: (s) => s.dust.tSI / MYR }, "solid"),
  ...perMass({ figure: FIG2, panel: "eta", tolerance: 0.03, skipEdges: true, evaluate: (s) => s.eta }, "solid"),
  ...perMass({ figure: FIG2, panel: "m_f_MJ", tolerance: 0.1, skipEdges: true, evaluate: (s) => s.filamentMass / M_JUP }, "solid"),
  ...perMass({ figure: FIG2, panel: "m_p_MJ", tolerance: 0.1, evaluate: (s, p) => liuPlanetesimalMass(s.disk, p) / M_JUP }, "dashed"),
  ...perMass({ figure: FIG2, panel: "m_p_MJ", tolerance: 1.2, evaluate: (s, p) => klahrSchreiberPlanetesimalMass(s.disk, p) / M_JUP }, "solid"),
  ...perMass({ figure: FIG2, panel: "N_p", tolerance: 0.1, skipEdges: true, evaluate: (s) => s.planetesimalsPerFilament }, "solid"),
  ...perMass({ figure: FIG2, panel: "radii_pc", tolerance: 0.1, skipEdges: true, evaluate: (s) => s.accretion.rBondiDust / PC }, "dashed"),
  ...perMass({ figure: FIG2, panel: "radii_pc", tolerance: 0.1, evaluate: (s) => s.accretion.rHill / PC }, "solid"),
  ...perMass({ figure: FIG2, panel: "radii_pc", tolerance: 0.1, evaluate: (s) => s.accretion.rGeo / PC }, "dashdot"),
  ...perMass({ figure: "Vfrag1000SI1e-2", panel: "St", tolerance: 0.03, evaluate: (s) => s.dust.stFrag }, "dashdot", { vFrag: 10 }),
  ...perMass({ figure: "Vfrag1000SI1e-2", panel: "a_mm", tolerance: 0.03, evaluate: sizeMm((s) => s.dust.stFrag) }, "dashdot", { vFrag: 10 }),
  ...perMass({ figure: "Vfrag100SI1e-3", panel: "t_SI_Myr", tolerance: 0.05, skipEdges: true, evaluate: (s) => s.dust.tSI / MYR }, "solid", { stSI: 1e-3 }),
  ...perMass({ figure: "accretion_dustgasSt1e-2Vfrag100", panel: "mdot_MJ_yr", tolerance: 0.15, skipEdges: true, evaluate: (s) => (s.accretion.mdotDust * YR) / M_JUP }, "solid", FIG5),
  ...perMass({ figure: "accretion_dustgasSt1e-2Vfrag100", panel: "mdot_MJ_yr", tolerance: 0.2, skipEdges: true, evaluate: (s) => (s.accretion.mdotGas * YR) / M_JUP }, "dashed", FIG5),
  ...perMass({ figure: "accretion_dustgasSt1e-2Vfrag1000", panel: "mdot_MJ_yr", tolerance: 1.3, skipEdges: true, evaluate: (s) => (s.accretion.mdotDust * YR) / M_JUP }, "solid", { ...FIG5, vFrag: 10 }),
  ...perMass({ figure: "timeMjupDust_delta1em5_mbhvarSt1e-2Vfrag100", panel: "t_acc_yr", tolerance: 0.15, skipEdges: true, evaluate: (s) => s.planetesimalMass / s.accretion.mdotDust / YR }, "solid", FIG5),
  ...perMass({ figure: "timeMjupDust_delta1em5_mbhvarSt1e-2Vfrag1000", panel: "t_acc_yr", tolerance: 1.3, skipEdges: true, evaluate: (s) => s.planetesimalMass / s.accretion.mdotDust / YR }, "solid", { ...FIG5, vFrag: 10 }),
  ...perMass({ figure: "total_filamentsSt1e-2Vfrag100", panel: "N_filaments_cum", tolerance: 0.15, evaluate: () => 0, cumulative: cumulativeAt("cumulativeFilaments") }, "solid"),
  ...perMass({ figure: "total_planetsSt1e-2Vfrag100", panel: "N_planets_cum", tolerance: 0.15, evaluate: () => 0, cumulative: cumulativeAt("cumulativePlanets") }, "solid"),
];

export function runCase(c: CalibrationCase, base: ModelParams = DEFAULT_PARAMS): CaseResult {
  const figures = fixtures as unknown as Figures;
  const points = figures[c.figure]?.[c.panel]?.[c.series];
  const label = `${c.figure.slice(0, 24)} ${c.panel} ${c.series}`;
  if (!points) throw new Error(`missing fixture ${label}`);
  const p = { ...base, ...c.overrides };
  const used = c.skipEdges ? points.filter(([r]) => r > 0.1 && r < 100) : points;
  const cumulative = c.cumulative?.(p);
  let maxDex = 0;
  let sumDex = 0;
  let worst = { rPc: 0, paper: 0, model: 0 };
  for (const [rPc, paper] of used) {
    const model = cumulative ? cumulative(rPc) : c.evaluate(radialState(rPc * PC, p), p);
    const dex = Math.abs(Math.log10(model / paper));
    sumDex += dex;
    if (!(dex <= maxDex)) {
      maxDex = Number.isFinite(dex) ? dex : Infinity;
      worst = { rPc, paper, model };
    }
  }
  return { label, maxDex, meanDex: sumDex / used.length, worst, tolerance: c.tolerance };
}
