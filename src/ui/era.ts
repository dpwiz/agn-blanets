import { PC, YR } from "../physics/constants";
import { EPOCH_MAX_YR, EPOCH_MIN_YR, formsDuringAgn, GAS_CLEARING_FRACTION, SHORTEST_STELLAR_LIFETIME_YR } from "../physics/era";
import { formationBands } from "../render/torus";
import type { Color } from "three";
import { AMBIENT_LEGEND_TEMPERATURES, ambientColor, cssColor, RESOURCE_STOPS, SETTLED_STOPS } from "../render/palette";
import { epoch, sci } from "../format";
import { ELEMENT_GROUPS, GROUP_LABEL, type ElementGroup } from "../physics/chemistry";
import { GLOWING_WORLD_POWER, HYDROGEN_WELL_FRACTION, SETTLING_YR, TEMPERATE_MAX_K, TEMPERATE_MIN_K, type SpreadTech } from "../physics/civ";
import { seedFrom, store, TIMED_OVERLAYS, type AppState, type Overlay } from "../state";
import { assumptionGlyph, h, segmented } from "./dom";

const LOG_MIN = Math.log10(EPOCH_MIN_YR);
const LOG_MAX = Math.log10(EPOCH_MAX_YR);

const ERA_ASSUMPTIONS = [
  "Bodies appear when their grains reach the streaming-instability size (t_SI), and only where the paper's formation conditions hold.",
  "They then grow at their current e-folding rate, slowing as they use up their share of the ring's dust, until the AGN switches off, as in the Explore estimate.",
  `When the AGN dies the gas disperses over ${GAS_CLEARING_FRACTION * 100}% of its lifetime, ending growth and clearing the sky.`,
  "Gas arrives at the paper's gas-to-pebble ratio, so grown bodies stay mostly rock.",
  `A body shines as a star once it holds as much hydrogen as the lightest ordinary star, then lives 10 Gyr × (M/M☉)^−2.5, at least ${SHORTEST_STELLAR_LIFETIME_YR / 1e6} Myr, and leaves a remnant.`,
  "None of this timeline is in the paper.",
].join(" ");

const NICHE_ASSUMPTIONS = [
  "Each ring takes the first niche that fits.",
  `Moons of glowing worlds: a body glowing above ${sci(GLOWING_WORLD_POWER, 1)} W, with an Earth-light orbit inside its Hill radius.`,
  `Hydrogen well: bodies at least ${HYDROGEN_WELL_FRACTION * 100}% hydrogen.`,
  `Oven midplane above ${TEMPERATE_MAX_K} K, or the liquid-water band at ${TEMPERATE_MIN_K}–${TEMPERATE_MAX_K} K, while the AGN shines.`,
  "Frost on the grains after it switches off, while gas remains. Everything else is cold rock worlds.",
  "None of this is in the paper.",
].join(" ");

const RESOURCE_ASSUMPTIONS = [
  "Solar abundances. Silicates and metal are solid everywhere, iron sulfide below 700 K, refractory organics below 500 K, and water ice below the frost point at the local gas density.",
  "Bodies keep the grains they formed from and the gas they gathered; free grains leave with the gas.",
  "The map shows mass per square metre held in solids, inside bodies and on free grains, over six decades below the richest ring.",
  "None of this is in the paper.",
].join(" ");

const SPREAD_ASSUMPTIONS = [
  "A culture founded on the chosen body spreads ring by ring.",
  `Each hop takes a Hohmann transfer (orbital) or a 1 g brachistochrone (torch), then ${SETTLING_YR / 1000} kyr to settle before the next, and waits for a ring's bodies to form.`,
  "The founding happens at the timeline's current time, or when the body forms.",
  "None of this is in the paper.",
].join(" ");

const MAPS: { value: Overlay; label: (eraMode: boolean) => string }[] = [
  { value: "none", label: () => "No map" },
  { value: "temperature", label: () => "Gas temperature" },
  { value: "fate", label: (eraMode) => (eraMode ? "What bodies are now" : "What bodies become") },
  { value: "niches", label: () => "Who could live here" },
  { value: "resources", label: () => "What you can mine" },
  { value: "settled", label: () => "Where a culture spreads" },
];

function rampLegend(stops: [number, Color][], lo: string, hi: string): HTMLElement {
  const css = stops.map(([x, c]) => `${cssColor(c)} ${Math.round(x * 100)}%`).join(", ");
  return h("span", { class: "ambient-legend" }, h("span", { text: lo }), h("i", { style: `background:linear-gradient(90deg, ${css})` }), h("span", { text: hi }));
}

function toFraction(yr: number): number {
  return (Math.log10(Math.min(Math.max(yr, EPOCH_MIN_YR), EPOCH_MAX_YR)) - LOG_MIN) / (LOG_MAX - LOG_MIN);
}

interface Formation {
  firstYr: number | null;
  bands: [number, number][];
  full: boolean;
}

const formationCache = new WeakMap<AppState["population"], Formation>();

function formation(s: AppState): Formation {
  const hit = formationCache.get(s.population);
  if (hit) return hit;
  let first = Infinity;
  for (const b of s.population.bins) if (formsDuringAgn(b.state)) first = Math.min(first, b.state.dust.tSI / YR);
  const made = {
    firstYr: Number.isFinite(first) ? first : null,
    bands: formationBands(s.population, s.params),
    full: s.population.bins.every((b) => formsDuringAgn(b.state)),
  };
  formationCache.set(s.population, made);
  return made;
}

function phaseText(s: AppState): string {
  if (!s.eraMode) return "Every body at birth";
  const first = formation(s).firstYr;
  const life = s.params.agnLifetimeYr;
  if (first === null) return "No bodies ever form";
  if (s.eraYr < first) return "Dust is still growing";
  if (s.eraYr < life) return "The AGN is shining";
  if (s.eraYr < life * (1 + GAS_CLEARING_FRACTION)) return "The AGN has gone dark";
  return "Afterglow, the sky is clear";
}

function noteText(s: AppState): string {
  if (!s.eraMode) return "As the paper counts them. Switch to Through time to watch them form, grow and die.";
  const { bands, full } = formation(s);
  const now = `${epoch(s.eraYr)} after the AGN lit up.`;
  if (bands.length === 0) return `${now} Grains never reach the streaming-instability size in time. Lower the SI threshold to 10⁻³ or raise the fragmentation speed.`;
  if (full) return now;
  const where = bands.map(([a, b]) => `${sci(a / PC, 2)}–${sci(b / PC, 2)} pc`).join(", ");
  return `${now} Bodies form only at ${where}, where streaming instability works. An SI threshold of 10⁻³ fills the torus.`;
}

function mark(fraction: number, label: string, cls: string): HTMLElement {
  return h("span", { class: `era-mark ${cls}`, style: `left:${(fraction * 100).toFixed(2)}%`, text: label });
}

function ambientLegend(): HTMLElement {
  const temps = AMBIENT_LEGEND_TEMPERATURES;
  const stops = temps.map((t, i) => `${cssColor(ambientColor(t))} ${((i / (temps.length - 1)) * 100).toFixed(0)}%`).join(", ");
  return h(
    "span",
    { class: "ambient-legend" },
    h("span", { text: `${temps[0]} K` }),
    h("i", { style: `background:linear-gradient(90deg, ${stops})` }),
    h("span", { text: `${temps[temps.length - 1]} K` }),
  );
}

export function eraRow(onFrame: (hook: (dt: number) => void) => void): HTMLElement {
  const mode = segmented<"birth" | "time">(
    "Show bodies",
    [
      { value: "birth", label: "At birth" },
      { value: "time", label: "Through time" },
    ],
    store.state.eraMode ? "time" : "birth",
    (v) => store.set({ eraMode: v === "time", eraSweeping: false }),
  ).querySelector(".segmented") as HTMLElement;

  const sweep = h("button", { class: "play small", type: "button" });
  sweep.addEventListener("click", () => {
    const s = store.state;
    if (s.eraSweeping) store.set({ eraSweeping: false, eraYr: s.eraYr });
    else store.set({ eraSweeping: true, eraYr: s.eraYr >= EPOCH_MAX_YR * 0.999 ? EPOCH_MIN_YR : s.eraYr });
  });

  const phase = h("strong", {});
  const note = h("span", {});
  const glyph = assumptionGlyph(ERA_ASSUMPTIONS);
  const readout = h("div", { class: "era-readout" }, h("div", {}, glyph, phase), note);

  const range = h("input", {
    type: "range",
    min: LOG_MIN,
    max: LOG_MAX,
    step: 0.01,
    value: Math.log10(store.state.eraYr),
    "aria-label": "Time since the AGN lit up",
  });
  range.addEventListener("input", () => store.set({ eraYr: 10 ** Number(range.value), eraSweeping: false }));
  const shining = h("span", { class: "era-zone shining" });
  const marks = h("div", { class: "era-marks" });
  const track = h("div", { class: "era-track" }, h("div", { class: "era-bar" }, shining), marks, range);

  const mapSelect = h("select", { "aria-label": "Map on the midplane" }, ...MAPS.map((m) => h("option", { value: m.value, text: m.label(false) }))) as HTMLSelectElement;
  mapSelect.addEventListener("change", () => {
    const v = mapSelect.value as Overlay;
    store.set(TIMED_OVERLAYS.includes(v) && !store.state.eraMode ? { overlay: v, eraMode: true } : { overlay: v });
  });

  const groupSelect = h("select", { "aria-label": "Element to map" }, ...ELEMENT_GROUPS.map((g) => h("option", { value: g, text: GROUP_LABEL[g] }))) as HTMLSelectElement;
  groupSelect.addEventListener("change", () => store.set({ resourceGroup: groupSelect.value as ElementGroup }));
  const resourceControls = h(
    "span",
    { class: "map-controls" },
    groupSelect,
    rampLegend(RESOURCE_STOPS, "10⁻⁶ of richest", "richest"),
    assumptionGlyph(RESOURCE_ASSUMPTIONS),
  );

  const tech = segmented<SpreadTech>(
    "Spread by",
    [
      { value: "orbital", label: "Orbital" },
      { value: "torch", label: "Torch" },
    ],
    store.state.spreadTech,
    (v) => store.set({ spreadTech: v }),
  ).querySelector(".segmented") as HTMLElement;
  const seedButton = h("button", { type: "button", class: "button quiet compact", text: "Seed at selected body" }) as HTMLButtonElement;
  seedButton.addEventListener("click", () => {
    const s = store.state;
    if (s.selected) store.set({ spreadSeed: seedFrom(s, s.selected) });
  });
  const seedNote = h("span", { class: "map-note" });
  const spreadControls = h(
    "span",
    { class: "map-controls" },
    tech,
    seedButton,
    seedNote,
    rampLegend(SETTLED_STOPS, "first", "latest"),
    assumptionGlyph(SPREAD_ASSUMPTIONS),
  );
  const nicheControls = h("span", { class: "map-controls" }, h("span", { class: "map-note", text: "Niches at this time" }), assumptionGlyph(NICHE_ASSUMPTIONS));
  const legendSlot = h("span", { class: "map-legend" });

  const row = h("div", { class: "era-row" }, mode, sweep, readout, track, h("div", { class: "group map-group" }, mapSelect, legendSlot));

  const press = (group: HTMLElement, index: number) => {
    Array.from(group.children).forEach((b, i) => b.setAttribute("aria-pressed", String(i === index)));
  };

  const renderStatic = (s: AppState) => {
    press(mode, s.eraMode ? 1 : 0);
    row.classList.toggle("off", !s.eraMode);
    glyph.hidden = !s.eraMode;
    sweep.disabled = !s.eraMode;
    range.disabled = !s.eraMode;
    sweep.textContent = s.eraSweeping ? "❚❚" : "▶";
    sweep.setAttribute("aria-label", s.eraSweeping ? "Pause the sweep" : "Sweep forward through time");
    const life = toFraction(s.params.agnLifetimeYr);
    shining.style.width = `${(life * 100).toFixed(2)}%`;
    const first = formation(s).firstYr;
    const ticks: [number, string, string][] = [
      [0, "1 kyr", "tick start"],
      [toFraction(1e6), "1 Myr", "tick"],
      [toFraction(1e9), "1 Gyr", "tick"],
      [1, "10 Gyr", "tick end"],
    ];
    const children = [
      mark(life, "AGN switches off", "off"),
      ...ticks.filter(([f]) => Math.abs(f - life) > 0.12).map(([f, label, cls]) => mark(f, label, cls)),
    ];
    if (first !== null && first > EPOCH_MIN_YR) children.push(mark(toFraction(first), "first worlds", "first"));
    marks.replaceChildren(...children);
    mapSelect.value = s.overlay;
    MAPS.forEach((m, i) => {
      mapSelect.options[i].text = m.label(s.eraMode);
    });
    groupSelect.value = s.resourceGroup;
    press(tech, s.spreadTech === "orbital" ? 0 : 1);
    seedButton.disabled = !s.selected;
    seedNote.textContent = s.spreadSeed ? `Founded on ${s.spreadSeed.name} at ${epoch(s.spreadSeed.yr)}` : "Pick a body, then seed it";
    const controls: Partial<Record<Overlay, HTMLElement>> = { temperature: ambientLegend(), niches: nicheControls, resources: resourceControls, settled: spreadControls };
    legendSlot.replaceChildren(controls[s.overlay] ?? "");
  };
  const renderLive = (s: AppState) => {
    phase.textContent = phaseText(s);
    note.textContent = noteText(s);
    const v = String(Math.log10(s.eraYr));
    if (document.activeElement !== range && range.value !== v) range.value = v;
  };

  renderStatic(store.state);
  renderLive(store.state);
  store.subscribe((s, changed) => {
    const statics: (keyof AppState)[] = ["eraMode", "eraSweeping", "params", "population", "overlay", "resourceGroup", "spreadTech", "spreadSeed", "selected"];
    if (statics.some((k) => changed.has(k))) renderStatic(s);
    if (changed.has("eraMode") || changed.has("eraYr") || changed.has("population")) renderLive(s);
  });
  let acc = 0;
  onFrame((dt) => {
    acc += dt;
    if (acc < 0.1) return;
    acc = 0;
    if (store.state.eraSweeping) renderLive(store.state);
  });
  return row;
}
