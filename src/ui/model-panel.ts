import { HYDROGEN_BURNING_MASS, PC } from "../physics/constants";
import type { ModelParams } from "../physics/params";
import { formationBands } from "../render/torus";
import { count, mass, sci } from "../format";
import { store, type AppState } from "../state";
import { h, segmented, slider, sourceGlyph, sourceLegend } from "./dom";

function stat(value: string, label: string): HTMLElement {
  return h("div", { class: "stat" }, h("span", { class: "stat-value", text: value }), h("span", { class: "stat-label", text: label }));
}

function bandText(s: AppState): string {
  const bands = formationBands(s.population, s.params);
  if (bands.length === 0) return "Nowhere in 0.1–100 pc: grains never reach the streaming-instability size in time.";
  const parts = bands.map(([a, b]) => `${sci(a / PC, 2)}–${sci(b / PC, 2)} pc`);
  return `Streaming instability can actually operate at ${parts.join(", ")} (outlined in mint).`;
}

export function mountModelPanel(root: HTMLElement): void {
  const render = (s: AppState) => {
    const p = s.params;
    const set = (patch: Partial<ModelParams>) => store.setParams(patch);
    const scroll = root.scrollTop;
    const advancedOpen = root.querySelector("details.advanced")?.hasAttribute("open") ?? false;
    root.replaceChildren(
      h("h2", { text: "The torus" }),
      h("p", { text: "Tune the paper's model. The planet population, the dust haze and every number in the tools update to match." }),
      h(
        "div",
        { class: "stats" },
        stat(count(s.population.totalPlanets), "planetary bodies"),
        stat(count(s.population.totalFilaments), "dust filaments"),
        stat(mass(s.population.totalMass), "locked in planets"),
        stat(`${sci(p.mSmbhMsun, 2)} M☉`, "black hole"),
      ),
      h("p", { class: "axis-note", text: bandText(s) }),
      sourceLegend(),

      h("h3", { text: "Black hole and disk" }),
      slider({
        label: "Black hole mass",
        min: 1e6,
        max: 1e10,
        log: true,
        value: p.mSmbhMsun,
        format: (v) => `${sci(v, 2)} M☉`,
        glyph: sourceGlyph("mSmbhMsun"),
        onChange: (v) => set({ mSmbhMsun: v }),
      }),
      slider({
        label: "Plasma β",
        min: 1e-3,
        max: 1,
        log: true,
        value: p.betaM,
        format: (v) => sci(v, 2),
        hint: "Lower β means stronger magnetic support and a puffier torus.",
        glyph: sourceGlyph("betaM"),
        onChange: (v) => set({ betaM: v }),
      }),

      h("h3", { text: "Dust" }),
      slider({
        label: "Fragmentation speed",
        min: 0.3,
        max: 30,
        log: true,
        value: p.vFrag,
        format: (v) => `${sci(v, 2)} m/s`,
        hint: "How hard grains can collide before shattering. The paper tries 1 and 10 m/s.",
        glyph: sourceGlyph("vFrag"),
        onChange: (v) => set({ vFrag: v }),
      }),
      slider({
        label: "Streaming-instability threshold",
        min: 1e-4,
        max: 1e-1,
        log: true,
        value: p.stSI,
        format: (v) => `St ${sci(v, 2)}`,
        hint: "Grains must reach this Stokes number before filaments form. Paper: 10⁻² or 10⁻³.",
        glyph: sourceGlyph("stSI"),
        onChange: (v) => set({ stSI: v }),
      }),
      slider({
        label: "Turbulent diffusion δ",
        min: 1e-6,
        max: 1e-2,
        log: true,
        value: p.delta,
        format: (v) => sci(v, 2),
        glyph: sourceGlyph("delta"),
        onChange: (v) => set({ delta: v }),
      }),
      slider({
        label: "Dust-to-gas ratio",
        min: 1e-3,
        max: 0.1,
        log: true,
        value: p.metallicity,
        format: (v) => sci(v, 2),
        glyph: sourceGlyph("metallicity"),
        onChange: (v) => set({ metallicity: v }),
      }),

      h("h3", { text: "Population" }),
      segmented(
        "Where planets count",
        [
          { value: "paper", label: "Everywhere (Fig 6)" },
          { value: "gated", label: "Only where SI works" },
        ],
        p.countingMode,
        (v) => set({ countingMode: v }),
        sourceGlyph("countingMode"),
      ),
      segmented(
        "Filaments per ring",
        [
          { value: "one", label: "One (paper)" },
          { value: "full", label: "Fill the ring" },
        ],
        p.azimuthalFilaments ? "full" : "one",
        (v) => set({ azimuthalFilaments: v === "full" }),
        sourceGlyph("azimuthalFilaments"),
      ),
      slider({
        label: "AGN lifetime",
        min: 1e5,
        max: 1e9,
        log: true,
        value: p.agnLifetimeYr,
        format: (v) => (v >= 1e6 ? `${sci(v / 1e6, 2)} Myr` : `${sci(v / 1e3, 2)} kyr`),
        hint: "Sets which grains grow in time and which bodies grow into stars.",
        glyph: sourceGlyph("agnLifetimeYr"),
        onChange: (v) => set({ agnLifetimeYr: v }),
      }),
      segmented(
        "Pebble accretion",
        [
          { value: "regimes", label: "Hill/Bondi/geometric" },
          { value: "paperFig5", label: "As in Fig 5" },
        ],
        p.pebbleAccretionModel,
        (v) => set({ pebbleAccretionModel: v }),
        sourceGlyph("pebbleAccretionModel"),
      ),

      advanced(p, set, advancedOpen),
    );
    root.scrollTop = scroll;
  };
  render(store.state);
  store.subscribe((s, changed) => {
    if (changed.has("params") || changed.has("population")) render(s);
  });
}

function advanced(p: ModelParams, set: (patch: Partial<ModelParams>) => void, open: boolean): HTMLElement {
  const details = h("details", { class: "advanced", open }, h("summary", { text: "Values the paper leaves unstated" }));
  details.append(
    h("p", { text: "These were fitted so the model reproduces the paper's own figures. Change them to see how much the conclusions lean on each." }),
    slider({ label: "Irradiating luminosity", min: 1e36, max: 1e40, log: true, value: p.irradiationLuminosity, format: (v) => `${sci(v * 1e7, 2)} erg/s`, glyph: sourceGlyph("irradiationLuminosity"), onChange: (v) => set({ irradiationLuminosity: v }) }),
    slider({ label: "Irradiating radius", min: 6, max: 1000, log: true, value: p.irradiationRadiusRg, format: (v) => `${sci(v, 2)} GM/c²`, glyph: sourceGlyph("irradiationRadiusRg"), onChange: (v) => set({ irradiationRadiusRg: v }) }),
    slider({ label: "Background temperature", min: 10, max: 300, log: true, value: p.backgroundTemperature, format: (v) => `${sci(v, 3)} K`, glyph: sourceGlyph("backgroundTemperature"), onChange: (v) => set({ backgroundTemperature: v }) }),
    slider({ label: "Mean molecular weight", min: 1, max: 4, value: p.meanMolecularWeight, format: (v) => v.toFixed(2), glyph: sourceGlyph("meanMolecularWeight"), onChange: (v) => set({ meanMolecularWeight: v }) }),
    slider({ label: "Adiabatic index", min: 1, max: 1.67, value: p.gamma, format: (v) => v.toFixed(2), glyph: sourceGlyph("gamma"), onChange: (v) => set({ gamma: v }) }),
    slider({ label: "Grain density", min: 500, max: 8000, log: true, value: p.grainDensity, format: (v) => `${sci(v / 1000, 2)} g/cm³`, glyph: sourceGlyph("grainDensity"), onChange: (v) => set({ grainDensity: v }) }),
    slider({ label: "Filament dust ratio", min: 0.005, max: 0.5, log: true, value: p.filamentMetallicity, format: (v) => sci(v, 2), glyph: sourceGlyph("filamentMetallicity"), onChange: (v) => set({ filamentMetallicity: v }) }),
    slider({ label: "Filament length", min: 0.5, max: 4, value: p.filamentLengthOverH, format: (v) => `${v.toFixed(2)} H`, glyph: sourceGlyph("filamentLengthOverH"), onChange: (v) => set({ filamentLengthOverH: v }) }),
    slider({ label: "Fragmentation prefactor", min: 0.5, max: 3, value: p.fragmentationPrefactor, format: (v) => `${v.toFixed(2)}×`, glyph: sourceGlyph("fragmentationPrefactor"), onChange: (v) => set({ fragmentationPrefactor: v }) }),
    segmented(
      "Planetesimal mass law",
      [
        { value: "liu2020", label: "Eq 24 (Liu+20)" },
        { value: "klahrSchreiber2020", label: "Eq 25 (KS20)" },
      ],
      p.planetesimalLaw,
      (v) => set({ planetesimalLaw: v }),
      sourceGlyph("planetesimalLaw"),
    ),
    h("p", { class: "axis-note", text: `Hydrogen burning starts near ${mass(HYDROGEN_BURNING_MASS)}; anything heavier born here is a stellar-mass ball of pure dust.` }),
  );
  return details;
}
