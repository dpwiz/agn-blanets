import { blanetDetails, blanetTrack, MASS_SCATTER_DEX, type Blanet } from "../physics/bodies";
import { accretionRateAt, epochState, livingConditions, SOLAR_CONSTANT, type Stage } from "../physics/era";
import { hillRadius } from "../physics/accretion";
import { iceOnGrains, ORGANICS_FRONT_K, SULFIDE_FRONT_K } from "../physics/chemistry";
import { bodyNow, CHEMICAL_EXHAUST_SPEED, GLOWING_WORLD_POWER, kardashev, lightsItsMoons, midplaneTemperature, skyAt } from "../physics/civ";
import { BANDS, linkBudget } from "../physics/comms";
import type { Vec3 } from "../physics/vec";
import { circularOrbitClockRate, clockLagPerYear } from "../physics/clocks";
import { C_LIGHT, G, L_SUN, M_H, PC, YR } from "../physics/constants";
import { CLASS_LABEL, FATE_LABEL } from "../physics/fate";
import { GAS_HYDROGEN_FRACTION, growthLimits } from "../physics/growth";
import { meanMotion, orbitalPeriod, orbitalPosition } from "../physics/kepler";
import { hohmannDeltaV, hohmannTime, surfaceEscapeSpeed } from "../physics/transfer";
import { agnDarkNow, commsEnvironment, deriveFocus, seedFrom, smbhMassKg, store, type AppState } from "../state";
import { dataRate, distanceWithLight, duration, epoch, length, mass, sci, speed } from "../format";
import { assumptionGlyph, h, readout } from "./dom";

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
  dustStar: "Stellar-mass body with too little hydrogen to burn",
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

interface BodyHere {
  mass: number;
  radius: number;
  accretionRate: number;
  gasMass: number;
  ageYr: number;
}

function bodyHere(s: AppState, b: Blanet, d: ReturnType<typeof blanetDetails>): BodyHere {
  const track = blanetTrack(b, s.params);
  if (!s.eraMode) {
    return { mass: b.mass, radius: b.radius, accretionRate: d.accretion.mdotDust + d.accretion.mdotGas, gasMass: 0, ageYr: Number.isFinite(track.bornYr) ? track.bornYr : 0 };
  }
  const now = bodyNow(d.local, track, s.params, s.eraYr);
  return { mass: now.mass, radius: now.radius, accretionRate: accretionRateAt(track, s.eraYr), gasMass: now.gasMass, ageYr: s.eraYr };
}

function livingSection(s: AppState, b: Blanet, d: ReturnType<typeof blanetDetails>): HTMLElement[] {
  const here = bodyHere(s, b, d);
  const live = livingConditions(d.local, here.mass, here.radius, here.accretionRate, s.params, agnDarkNow(s));
  const sky = live.skyOpticalDepth;
  return [
    h("h3", { text: s.eraMode ? "Living here at this time" : "Living here while the AGN shines" }),
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

const CIVILIZATION_NOTE = [
  `Our estimates, beyond the paper. A world lights its moons when it glows above ${sci(GLOWING_WORLD_POWER, 1)} W with an Earth-light orbit inside its Hill radius.`,
  "Kardashev level is (log₁₀ W − 6)/10.",
  `Rockets use a ${speed(CHEMICAL_EXHAUST_SPEED)} chemical exhaust.`,
  "Neighbours sit at the population's mean spacing in the dust layer, and the link uses your Signal band and rig across one spacing in the midplane.",
].join(" ");

function civilizationSection(s: AppState, b: Blanet, d: ReturnType<typeof blanetDetails>): HTMLElement[] {
  const p = s.params;
  const mSmbh = smbhMassKg(p);
  const here = bodyHere(s, b, d);
  const live = livingConditions(d.local, here.mass, here.radius, here.accretionRate, p);
  const hill = hillRadius(here.mass, d.local.disk);
  const lit = lightsItsMoons(live.glowLuminosity, live.earthLightDistance, here.radius, hill);
  const sky = skyAt(p, here.ageYr);
  const T = midplaneTemperature(d.local, p, sky);
  const particles = (d.local.disk.rho * sky.gasFraction) / (p.meanMolecularWeight * M_H);
  const water = !(sky.gasFraction > 0) ? "gone with the gas" : iceOnGrains(T, particles) ? "frost on the grains" : "vapour in the gas";
  const carbon = !(sky.gasFraction > 0) || T < ORGANICS_FRONT_K ? "carbon in solids" : "carbon as CO gas";
  const sulfur = !(sky.gasFraction > 0) || T < SULFIDE_FRONT_K ? "sulfur as iron sulfide" : "sulfur in the gas";
  const escape = Math.sqrt((2 * G * here.mass) / here.radius);
  const r = b.orbit.radius;
  const bin = s.population.bins.find((x) => x.rOuter >= r) ?? s.population.bins[s.population.bins.length - 1];
  const spacing = 0.55 * bin.planetNumberDensity ** (-1 / 3);
  const omega = d.local.disk.omega;
  const angle = spacing / r;
  const near: Vec3 = [r, 0, 0];
  const far: Vec3 = [r * Math.cos(angle), r * Math.sin(angle), 0];
  const link = Number.isFinite(spacing) ? linkBudget(near, far, BANDS[s.band], s.rig, commsEnvironment(s)) : null;
  const glyph = assumptionGlyph(CIVILIZATION_NOTE);
  const seed = h("button", { class: "button quiet", type: "button", text: s.spreadSeed?.name === b.name ? "A culture spreads from here" : "Seed a culture here" });
  seed.addEventListener("click", () => store.set({ spreadSeed: seedFrom(store.state, b), overlay: "settled", eraMode: true }));
  const rows: [string, string, string?][] = [
    ["Its glow now", live.glowLuminosity > 0 ? `${sci(live.glowLuminosity, 2)} W, Kardashev ${kardashev(live.glowLuminosity).toFixed(1)}` : "faded, stored heat only"],
    ["Earth-like light for moons", live.glowLuminosity > 0 ? `${length(live.earthLightDistance)} out, Hill radius ${length(hill)}` : "none", lit ? "good" : undefined],
    ["Hydrogen it holds", here.gasMass > 0 ? `${sci((100 * GAS_HYDROGEN_FRACTION * here.gasMass) / here.mass, 2)}% of its mass, ${mass(GAS_HYDROGEN_FRACTION * here.gasMass)}` : "none, pure dust"],
    ["Water here", water],
    ["Carbon and sulfur here", `${carbon}, ${sulfur}`],
    ["Escape speed now", speed(escape)],
    ["Chemical rocket to escape", `mass ratio e^${sci(escape / CHEMICAL_EXHAUST_SPEED, 2)}`],
    ["Nearest neighbours", Number.isFinite(spacing) ? distanceWithLight(spacing) : "none here"],
    ["Neighbours change every", duration(1 / (1.5 * omega))],
  ];
  if (Number.isFinite(spacing)) {
    rows.push(["Hop one spacing outward", `${speed(hohmannDeltaV(r, r + spacing, mSmbh))}, ${duration(hohmannTime(r, r + spacing, mSmbh))} by Hohmann`]);
  }
  if (link) rows.push([`Talking to them by ${BANDS[s.band].label.split(" ·")[0]}`, link.capacity >= 1 ? dataRate(link.capacity) : "blocked", link.capacity >= 1 ? "good" : "bad"]);
  return [h("h3", {}, "Civilization here ", glyph), readout(rows), h("div", { class: "button-row" }, seed)];
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
      ["Its share of the ring's dust", mass(growthLimits(d.local).dustLeftPerBody)],
      ["Could reach", growing ? mass(d.fate.projectedMass) : "its birth mass"],
      ["Hydrogen by then", growing ? `${sci((100 * d.fate.hydrogenMass) / d.fate.projectedMass, 2)}% of its mass` : "none"],
      ["Pebble isolation mass", mass(d.local.isolationMass)],
    ]),
    ...epochSection(s, b),
    ...livingSection(s, b, d),
    ...civilizationSection(s, b, d),
    h("h3", { text: "Its clock" }),
    readout([
      ["Runs slow by", `${duration(clockLagPerYear(rate))} per year`],
      ["Light from the hole takes", duration(b.orbit.radius / C_LIGHT)],
    ]),
    h("p", {
      class: "axis-note",
      text: `Born pure dust in a filament ${length(d.local.filamentWidth)} wide; its siblings number about ${sci(d.local.planetesimalsPerFilament, 2)}. The paper gives one characteristic mass per radius; individual masses here scatter by ${MASS_SCATTER_DEX} dex around it, our assumption. "Could reach" is our estimate: the body grows at its current rate while its ring's dust lasts, sharing that dust evenly with its neighbours, and gathers gas at the paper's gas-to-pebble ratio. It shines as a star only once it holds as much hydrogen as the lightest ordinary star. The paper itself only separates bodies that grow from those that do not. The radius assumes rock at ${sci(s.params.grainDensity / 1000, 2)} g/cm³, though the paper expects degenerate cores well below a Jupiter mass.`,
    }),
    h("div", { class: "button-row" }, visit, hop, signal),
    h("p", { class: "axis-note", text: `Orbit ${(b.orbit.radius / PC).toPrecision(4)} pc, inclination ${sci((b.orbit.inclination * 180) / Math.PI, 2)}°.` }),
  );
}
