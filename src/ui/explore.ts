import { blanetDetails, MASS_SCATTER_DEX } from "../physics/bodies";
import { circularOrbitClockRate, clockLagPerYear } from "../physics/clocks";
import { C_LIGHT, PC, YR } from "../physics/constants";
import { CLASS_LABEL, FATE_LABEL } from "../physics/fate";
import { meanMotion, orbitalPeriod, orbitalPosition } from "../physics/kepler";
import { surfaceEscapeSpeed } from "../physics/transfer";
import { deriveFocus, smbhMassKg, store, type AppState } from "../state";
import { distanceWithLight, duration, length, mass, sci, speed } from "../format";
import { h, readout } from "./dom";

export function shearNote(s: AppState): HTMLElement {
  const omega = meanMotion(s.focus.radius, smbhMassKg(s.params));
  return h("p", {
    class: "axis-note",
    text: `Neighbours drift apart at ${speed(1.5 * omega * s.focus.patchRadius)} across this patch: differential rotation reshuffles it every ~${duration(2 / (3 * omega))}. Gather a fresh crowd to see who is close right now.`,
  });
}

export function regatherButton(): HTMLElement {
  const b = h("button", { class: "button quiet", type: "button", text: "Gather today's neighbours" });
  b.addEventListener("click", () => store.regather());
  return b;
}

const REGIME_TEXT = { hill: "Hill", bondi: "Bondi", geometric: "Geometric (barely accretes)" };

export function renderExplore(s: AppState): HTMLElement {
  const b = s.selected;
  if (!b) {
    const openLocal = h("button", { class: "button", type: "button", text: "Open a neighbourhood" });
    openLocal.addEventListener("click", () => store.set({ view: "local" }));
    if (s.view === "local") {
      return h(
        "div",
        {},
        h("h2", { text: "Pick a body" }),
        h("p", { text: `You are ${length(s.focus.radius)} from the black hole, looking at ${s.focus.blanets.length} neighbours in a patch ${length(2 * s.focus.patchRadius)} across. The view turns with the patch, so the black hole always lies toward the bottom of the screen.` }),
        shearNote(s),
        h("div", { class: "button-row" }, regatherButton()),
      );
    }
    return h(
      "div",
      {},
      h("h2", { text: "Pick a body" }),
      h("p", {
        text: "Click any bright point to inspect it. The torus view shows a few dozen landmark bodies spread across the whole population; the faint swarm behind them stands in for the rest.",
      }),
      h("p", {
        text: "A neighbourhood view drops you into the dust layer at true scale, where the nearest neighbours are a few light-days apart.",
      }),
      h("div", { class: "button-row" }, openLocal),
    );
  }
  const mSmbh = smbhMassKg(s.params);
  const d = blanetDetails(b, s.params);
  const rate = circularOrbitClockRate(b.orbit.radius, mSmbh);
  const escape = surfaceEscapeSpeed(b);
  const growing = d.fate.fate !== "frozen";

  const visit = h("button", { class: "button", type: "button", text: "Visit its neighbourhood" });
  visit.addEventListener("click", () => {
    const pos = orbitalPosition(b.orbit, mSmbh, s.timeYr * YR);
    const focus = deriveFocus(s.params, s.population, b.orbit.radius, Math.atan2(pos[1], pos[0]), Math.floor(Math.random() * 1e6), s.timeYr);
    focus.blanets.push(b);
    store.set({ focus, view: "local" });
  });
  const hop = h("button", { class: "button quiet", type: "button", text: "Fly from here" });
  hop.addEventListener("click", () => store.set({ origin: b, tab: "hop", armedSlot: "target" }));
  const signal = h("button", { class: "button quiet", type: "button", text: "Signal from here" });
  signal.addEventListener("click", () => store.set({ origin: b, tab: "signal", armedSlot: "target" }));

  return h(
    "div",
    { class: "body-card" },
    h("h2", { text: b.name }),
    h("p", { class: "kind", text: CLASS_LABEL[d.fate.objectClass] }),
    readout([
      ["Mass", mass(b.mass), "big"],
      ["Radius if uncompressed", length(b.radius)],
      ["Surface escape speed", speed(escape)],
      ["Distance from the hole", distanceWithLight(b.orbit.radius)],
      ["Orbital period", duration(orbitalPeriod(b.orbit.radius, mSmbh))],
      ["Gas temperature", `${sci(d.local.disk.temperature, 3)} K`],
      ["Disk aspect ratio H/r", sci(d.local.disk.h, 2)],
      ["Pebble Stokes number", sci(d.local.dust.stMax, 2)],
      ["Largest grains", length(d.local.dust.aMax)],
    ]),
    h("h3", { text: "Growth" }),
    readout([
      ["Pebble accretion", `${REGIME_TEXT[d.accretion.regime]}, ${d.accretion.geometry}`],
      ["Mass e-folding time", duration(d.accretion.doublingTime), growing ? "good" : undefined],
      ["Over the AGN lifetime", `${sci(d.fate.efoldings, 2)} e-foldings`],
      ["Likely fate", FATE_LABEL[d.fate.fate], growing ? "good" : undefined],
      ["Could reach", growing ? mass(d.fate.projectedMass) : "its birth mass"],
      ["Pebble isolation mass", mass(d.local.isolationMass)],
    ]),
    h("h3", { text: "Its clock" }),
    readout([
      ["Runs slow by", `${duration(clockLagPerYear(rate))} per year`],
      ["Light from the hole takes", duration(b.orbit.radius / C_LIGHT)],
    ]),
    h("p", {
      class: "axis-note",
      text: `Born pure dust in a filament ${length(d.local.filamentWidth)} wide; its siblings number about ${sci(d.local.planetesimalsPerFilament, 2)}. The paper gives one characteristic mass per radius; individual masses here scatter by ${MASS_SCATTER_DEX} dex around it, our assumption. "Could reach" extrapolates the current growth rate over the AGN lifetime, capped at the thermal mass; the paper itself only separates bodies that grow from those that do not. The radius assumes rock at ${sci(s.params.grainDensity / 1000, 2)} g/cm³, though the paper expects degenerate cores well below a Jupiter mass.`,
    }),
    h("div", { class: "button-row" }, visit, hop, signal),
    h("p", { class: "axis-note", text: `Orbit ${(b.orbit.radius / PC).toPrecision(4)} pc, inclination ${sci((b.orbit.inclination * 180) / Math.PI, 2)}°.` }),
  );
}
