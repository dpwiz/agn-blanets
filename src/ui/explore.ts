import { blanetDetails, blanetTrack, MASS_SCATTER_DEX, type Blanet } from "../physics/bodies";
import { epochState, livingConditions, SOLAR_CONSTANT, type Stage } from "../physics/era";
import { circularOrbitClockRate, clockLagPerYear } from "../physics/clocks";
import { C_LIGHT, L_SUN, PC, YR } from "../physics/constants";
import { CLASS_LABEL, FATE_LABEL } from "../physics/fate";
import { meanMotion, orbitalPeriod, orbitalPosition } from "../physics/kepler";
import { surfaceEscapeSpeed } from "../physics/transfer";
import { deriveFocus, smbhMassKg, store, type AppState } from "../state";
import { distanceWithLight, duration, epoch, length, mass, sci, speed } from "../format";
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

const STAGE_TEXT: Record<Stage, string> = {
  dust: "Still dust, its grains are growing",
  never: "Never forms in this AGN episode",
  planet: "Planet",
  browndwarf: "Brown-dwarf mass",
  dustStar: "Stellar-mass ball of dust, not burning hydrogen",
  star: "Star",
  massiveStar: "Massive star",
  remnant: "Dead star, a remnant",
};

function epochSection(s: AppState, b: Blanet): HTMLElement[] {
  if (!s.eraMode) return [];
  const track = blanetTrack(b, s.params);
  const e = epochState(track, s.eraYr);
  const rows: [string, string, string?][] = [
    ["Time since the AGN lit up", epoch(s.eraYr)],
    ["Stage", STAGE_TEXT[e.stage], e.stage === "remnant" ? "bad" : undefined],
    ["Forms at", Number.isFinite(track.bornYr) ? epoch(track.bornYr) : "never"],
    ["Mass now", e.stage === "dust" || e.stage === "never" ? "not yet a body" : mass(e.mass), "big"],
  ];
  if (e.ignitedYr !== null) rows.push(["Ignites hydrogen at", epoch(e.ignitedYr)]);
  if (e.diesYr !== null) rows.push(["Burns out at", epoch(e.diesYr)]);
  return [h("h3", { text: "At this point in time" }), readout(rows)];
}

function livingSection(s: AppState, b: Blanet, d: ReturnType<typeof blanetDetails>): HTMLElement[] {
  const live = livingConditions(d.local, b.mass, b.radius, d.accretion.mdotDust + d.accretion.mdotGas, s.params);
  const sky = live.skyOpticalDepth;
  return [
    h("h3", { text: "Living here while the AGN shines" }),
    readout([
      ["Glow from infalling pebbles", `${sci(live.glowLuminosity, 2)} W, ${sci(live.glowLuminosity / L_SUN, 2)} L☉`],
      ["Surface glows at", `${sci(live.glowTemperature, 3)} K`],
      ["Earth-like light for moons at", length(live.earthLightDistance)],
      ["Sky overhead in visible light", `${sky >= 1 ? "opaque" : "clear"}, optical depth ${sci(sky, 2)}`, sky >= 1 ? "bad" : "good"],
      ["Climb to the torus surface", `${speed(live.climbSpeed)} to rise ${length(live.surfaceHeight)}`],
      ["AGN light up there", `${sci(live.agnFlux, 2)} W/m², ${sci(live.agnFlux / SOLAR_CONSTANT, 2)}× sunlight at Earth`],
    ]),
    h("p", {
      class: "axis-note",
      text: "Our estimates from the model, not the paper's. The glow is the energy of falling pebbles and gas, using the uncompressed radius, so a real, denser body glows brighter and hotter. The sky depth counts the largest grains straight up through half the dust column. The torus surface sits at the photosphere height the paper assumes.",
    }),
  ];
}

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
    h("p", { class: "kind", text: s.eraMode ? `At birth: ${CLASS_LABEL[d.fate.objectClass]}` : CLASS_LABEL[d.fate.objectClass] }),
    readout([
      [s.eraMode ? "Birth mass" : "Mass", mass(b.mass), "big"],
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
    ...epochSection(s, b),
    ...livingSection(s, b, d),
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
