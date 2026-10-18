export type Provenance = "paper" | "calibrated" | "assumed";

export type PlanetesimalLaw = "liu2020" | "klahrSchreiber2020";
export type CountingMode = "paper" | "gated";
export type PebbleAccretionModel = "regimes" | "paperFig5";

export interface ModelParams {
  mSmbhMsun: number;
  betaM: number;
  alpha: number;
  delta: number;
  vFrag: number;
  stSI: number;
  xiC: number;
  metallicity: number;
  filamentMetallicity: number;
  grainSize0: number;
  grainDensity: number;
  gamma: number;
  meanMolecularWeight: number;
  backgroundTemperature: number;
  irradiationLuminosity: number;
  irradiationRadiusRg: number;
  photosphereHeightOverH: number;
  flaringIndex: number;
  liuCoefficient: number;
  fragmentationPrefactor: number;
  filamentLengthOverH: number;
  pebbleAccretionModel: PebbleAccretionModel;
  planetesimalLaw: PlanetesimalLaw;
  accretionCutoffC1: number;
  accretionCutoffC2: number;
  agnLifetimeYr: number;
  rMinPc: number;
  rMaxPc: number;
  countingMode: CountingMode;
  azimuthalFilaments: boolean;
}

export interface ParamInfo {
  label: string;
  unit: string;
  source: Provenance;
  note: string;
}

export const DEFAULT_PARAMS: ModelParams = {
  mSmbhMsun: 1e8,
  betaM: 0.01,
  alpha: 1e-4,
  delta: 1e-4,
  vFrag: 1,
  stSI: 1e-2,
  xiC: 0.5,
  metallicity: 0.01,
  filamentMetallicity: 0.052,
  grainSize0: 1e-6,
  grainDensity: 3000,
  gamma: 1.4,
  meanMolecularWeight: 2.38,
  backgroundTemperature: 100,
  irradiationLuminosity: 2.03e38,
  irradiationRadiusRg: 80,
  photosphereHeightOverH: 4,
  flaringIndex: 1.5,
  liuCoefficient: 1.82e-5,
  fragmentationPrefactor: 1.5,
  filamentLengthOverH: 2,
  pebbleAccretionModel: "regimes",
  planetesimalLaw: "liu2020",
  accretionCutoffC1: 0.4,
  accretionCutoffC2: 0.65,
  agnLifetimeYr: 1e7,
  rMinPc: 0.1,
  rMaxPc: 100,
  countingMode: "paper",
  azimuthalFilaments: false,
};

export const PARAM_INFO: Record<keyof ModelParams, ParamInfo> = {
  mSmbhMsun: { label: "SMBH mass", unit: "M☉", source: "paper", note: "Paper explores 10⁷, 10⁸, 10⁹ M☉." },
  betaM: { label: "Plasma β", unit: "", source: "paper", note: "P_gas/P_mag = 0.01: magnetic pressure keeps the torus stable." },
  alpha: { label: "Viscosity α", unit: "", source: "paper", note: "Fixed at 10⁻⁴; sets gap-opening and isolation mass." },
  delta: { label: "Dust diffusion δ", unit: "", source: "paper", note: "10⁻⁴ in the text." },
  vFrag: { label: "Fragmentation speed", unit: "m/s", source: "paper", note: "Fiducial 1 m/s; the paper also tries 10 m/s." },
  stSI: { label: "SI threshold Stokes", unit: "", source: "paper", note: "10⁻² fiducial, 10⁻³ alternative." },
  xiC: { label: "Coagulation efficiency", unit: "", source: "paper", note: "ξ_c = 0.5." },
  metallicity: { label: "Dust-to-gas ratio Z", unit: "", source: "calibrated", note: "Not stated; Fig 2c growth times imply Z = 0.01." },
  filamentMetallicity: { label: "Filament dust ratio Z_f", unit: "", source: "calibrated", note: "Not stated; Fig 2g (Eq 24 masses) implies Z_f ≈ 0.052." },
  grainSize0: { label: "ISM grain size a₀", unit: "m", source: "paper", note: "1 µm." },
  grainDensity: { label: "Grain density ρ•", unit: "kg/m³", source: "calibrated", note: "Not stated; Fig 2b implies 3 g/cm³." },
  gamma: { label: "Adiabatic index γ", unit: "", source: "assumed", note: "Not stated; 1.4 for molecular gas." },
  meanMolecularWeight: { label: "Mean molecular weight μ", unit: "", source: "calibrated", note: "Not stated; Fig 1d aspect ratios imply γ/μ ≈ 0.59." },
  backgroundTemperature: { label: "Background temperature T_b", unit: "K", source: "calibrated", note: "Not stated; Fig 1b floors at 100 K." },
  irradiationLuminosity: { label: "Irradiating luminosity", unit: "W", source: "calibrated", note: "The paper sets T★ at the ISCO without giving Ṁ; Fig 1b implies T★⁴r★² ≈ 2.85×10⁴⁴ K⁴m², i.e. L ≈ 2×10⁴⁵ erg/s for every SMBH mass." },
  irradiationRadiusRg: { label: "Irradiation radius r★", unit: "GM/c²", source: "calibrated", note: "Paper says ISCO; the inner-disk temperature excess in Fig 1b (10⁹ M☉) implies r★ ≈ 80 GM/c²." },
  photosphereHeightOverH: { label: "Photosphere height", unit: "H", source: "paper", note: "H_ph = 4H." },
  flaringIndex: { label: "Flaring dlnH/dlnr", unit: "", source: "paper", note: "Simplified to 3/2." },
  liuCoefficient: { label: "SI mass coefficient C", unit: "", source: "paper", note: "1.82×10⁻⁵ from Schäfer et al. 2017." },
  fragmentationPrefactor: { label: "Fragmentation-limit prefactor", unit: "", source: "calibrated", note: "Fig 2a lies 1.5× above Eq 11 evaluated with the Fig 1 sound speed." },
  filamentLengthOverH: { label: "Filament length", unit: "H", source: "calibrated", note: "Text says a filament is about one scale height long; Fig 2f filament masses are 2× that, so 2H reproduces the figure." },
  pebbleAccretionModel: { label: "Pebble accretion model", unit: "", source: "assumed", note: "\"regimes\" applies Hill/Bondi/geometric radii with the exponential cutoff (Eqs 33–38, as the text describes). \"paperFig5\" reproduces Fig 5: Bondi everywhere, no cutoff." },
  planetesimalLaw: { label: "Planetesimal mass law", unit: "", source: "paper", note: "The paper adopts Eq 24 (Liu et al. 2020). Eq 25 (Klahr & Schreiber) as printed gives masses ~10× above the KS20 curve in Fig 2g." },
  accretionCutoffC1: { label: "Cutoff c₁", unit: "", source: "paper", note: "0.4." },
  accretionCutoffC2: { label: "Cutoff c₂", unit: "", source: "paper", note: "0.65." },
  agnLifetimeYr: { label: "AGN lifetime", unit: "yr", source: "paper", note: "Paper assumes ~10⁷ yr; poorly constrained (1–100 Myr)." },
  rMinPc: { label: "Inner radius", unit: "pc", source: "paper", note: "Figures span 0.1–100 pc." },
  rMaxPc: { label: "Outer radius", unit: "pc", source: "paper", note: "Figures span 0.1–100 pc." },
  countingMode: { label: "Population counting", unit: "", source: "paper", note: "\"paper\" reproduces Fig 6 (counts everywhere); \"gated\" keeps only radii where St_max ≥ St_SI and t_SI < AGN lifetime." },
  azimuthalFilaments: { label: "Azimuthal filament count", unit: "", source: "assumed", note: "Fig 6 counts one filament per radial ring; enabling this fills each ring with 2πr/H filaments of length H." },
};

export function withParams(overrides: Partial<ModelParams>): ModelParams {
  return { ...DEFAULT_PARAMS, ...overrides };
}
