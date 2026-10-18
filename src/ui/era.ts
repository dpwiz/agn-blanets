import { PC, YR } from "../physics/constants";
import { EPOCH_MAX_YR, EPOCH_MIN_YR, formsDuringAgn, GAS_CLEARING_FRACTION, SHORTEST_STELLAR_LIFETIME_YR } from "../physics/era";
import { formationBands } from "../render/torus";
import { AMBIENT_LEGEND_TEMPERATURES, ambientColor, cssColor } from "../render/palette";
import { epoch, sci } from "../format";
import { store, type AppState, type Overlay } from "../state";
import { attachTip, h, segmented } from "./dom";

const LOG_MIN = Math.log10(EPOCH_MIN_YR);
const LOG_MAX = Math.log10(EPOCH_MAX_YR);

const ERA_ASSUMPTIONS = [
  "Bodies appear when their grains reach the streaming-instability size (t_SI), and only where the paper's formation conditions hold.",
  "They then grow at their current e-folding rate until the AGN switches off, capped at the thermal mass, as in the Explore estimate.",
  `When the AGN dies the gas disperses over ${GAS_CLEARING_FRACTION * 100}% of its lifetime, ending growth and clearing the sky.`,
  "A body born above the hydrogen-burning mass is pure dust and stays unlit unless it grows by an e-fold, echoing the paper's split between frozen and growing bodies.",
  `Once a body grows past the hydrogen-burning limit it shines as a star for 10 Gyr × (M/M☉)^−2.5, at least ${SHORTEST_STELLAR_LIFETIME_YR / 1e6} Myr, then leaves a remnant.`,
  "None of this timeline is in the paper.",
].join(" ");

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
  const glyph = h("span", { class: "source assumed", tabindex: 0, role: "img", "aria-label": "Our assumption" });
  attachTip(glyph, "Our assumption", ERA_ASSUMPTIONS);
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

  const overlay = segmented<Overlay>(
    "Map on the midplane",
    [
      { value: "none", label: "No map" },
      { value: "temperature", label: "Gas temperature" },
      { value: "fate", label: "What bodies become" },
    ],
    store.state.overlay,
    (v) => store.set({ overlay: v }),
  ).querySelector(".segmented") as HTMLElement;
  overlay.classList.add("overlay-switch");
  const fateButton = overlay.children[2] as HTMLButtonElement;
  const legendSlot = h("span", {});

  const row = h("div", { class: "era-row" }, mode, sweep, readout, track, h("div", { class: "group" }, overlay, legendSlot));

  const press = (group: HTMLElement, index: number) => {
    Array.from(group.children).forEach((b, i) => b.setAttribute("aria-pressed", String(i === index)));
  };
  const overlays: Overlay[] = ["none", "temperature", "fate"];

  const renderStatic = (s: AppState) => {
    press(mode, s.eraMode ? 1 : 0);
    press(overlay, overlays.indexOf(s.overlay));
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
    legendSlot.replaceChildren(s.overlay === "temperature" ? ambientLegend() : "");
    fateButton.textContent = s.eraMode ? "What bodies are now" : "What bodies become";
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
    if (changed.has("eraMode") || changed.has("eraSweeping") || changed.has("params") || changed.has("population") || changed.has("overlay")) renderStatic(s);
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
