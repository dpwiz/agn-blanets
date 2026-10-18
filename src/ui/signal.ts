import { BANDS, linkBudget, type BandId } from "../physics/comms";
import { YR } from "../physics/constants";
import { orbitalPosition } from "../physics/kepler";
import { pairCoverage, shortestRoute, type NetworkGraph } from "../physics/network";
import { commsEnvironment, smbhMassKg, store, type AppState } from "../state";
import type { NetworkRequest } from "../workers/network.worker";
import { dataRate, decibels, distanceWithLight, duration, sci } from "../format";
import { h, readout, segmented, slider } from "./dom";
import { slots } from "./slots";
import { regatherButton, shearNote } from "./explore";

const RELAY_DELAY_S = 60;
let minCapacity = 1e3;
let autoRebuild = false;
let requestId = 0;
let requestedAtYr = 0;
let lastAuto = 0;
let busy = false;
const worker = new Worker(new URL("../workers/network.worker.ts", import.meta.url), { type: "module" });

worker.onmessage = (e: MessageEvent<{ id: number; graph: NetworkGraph }>) => {
  busy = false;
  if (e.data.id !== requestId) return;
  const s = store.state;
  store.set({ network: e.data.graph, networkBuiltAtYr: requestedAtYr, showNetwork: true, route: routeFor(s, e.data.graph) });
};

store.subscribe((s, changed) => {
  if (changed.has("network") && !s.network) requestId += 1;
});

function routeFor(s: AppState, graph: NetworkGraph | null) {
  if (!graph || !s.origin || !s.target) return null;
  const a = s.networkPositions.findIndex((b) => b.id === s.origin!.id);
  const b = s.networkPositions.findIndex((x) => x.id === s.target!.id);
  if (a < 0 || b < 0) return null;
  return shortestRoute(graph, a, b, RELAY_DELAY_S);
}

export function requestNetwork(s: AppState): void {
  if (s.view !== "local") return;
  const bodies = s.focus.blanets;
  const mSmbh = smbhMassKg(s.params);
  const t = s.timeYr * YR;
  const positions = bodies.map((b) => orbitalPosition(b.orbit, mSmbh, t));
  requestId += 1;
  requestedAtYr = s.timeYr;
  busy = true;
  store.set({ networkPositions: bodies });
  const msg: NetworkRequest = {
    id: requestId,
    positions,
    env: commsEnvironment(s),
    opts: { band: s.band, rig: s.rig, minCapacity, maxRange: s.focus.patchRadius * 0.6, relayDelay: RELAY_DELAY_S },
  };
  worker.postMessage(msg);
}

export function tickNetwork(s: AppState): void {
  if (!autoRebuild || busy || !s.playing || s.view !== "local") return;
  const now = performance.now();
  if (now - lastAuto < 2500) return;
  lastAuto = now;
  requestNetwork(s);
}

let liveTarget: HTMLElement | null = null;

function glareShare(glare: number, thermal: number): string {
  const share = glare / (glare + thermal);
  if (share < 1e-6) return "negligible, the torus shades it";
  return `${sci(100 * share, 2)}%`;
}

function linkRows(s: AppState): HTMLElement {
  const mSmbh = smbhMassKg(s.params);
  const t = s.timeYr * YR;
  const a = orbitalPosition(s.origin!.orbit, mSmbh, t);
  const b = orbitalPosition(s.target!.orbit, mSmbh, t);
  const l = linkBudget(a, b, BANDS[s.band], s.rig, commsEnvironment(s));
  const blocked = l.occultation === "horizon" ? "Behind the black hole" : l.occultation === "innerDisk" ? "Blocked by the inner accretion disk" : null;
  return readout([
    ["Separation", distanceWithLight(l.distance)],
    ["One-way delay", duration(l.totalDelay), "big"],
    ["of which gravity adds", duration(l.shapiroDelay)],
    ["Dust optical depth", sci(l.tauDust, 3)],
    ["Gas optical depth", sci(l.tauGas, 3)],
    ["Signal to noise", decibels(l.snr), l.snr > 1 ? "good" : "bad"],
    ["Data rate", blocked ?? dataRate(l.capacity), l.capacity >= 1 ? "big" : "bad"],
    ["AGN glare share of noise", glareShare(l.glareNoise, l.thermalNoise)],
  ]);
}

export function tickSignal(s: AppState): void {
  if (!liveTarget || !liveTarget.isConnected || !s.origin || !s.target) return;
  liveTarget.replaceChildren(linkRows(s));
}

function networkSection(s: AppState): HTMLElement {
  const wrap = h("div", {}, h("h3", { text: "Relay network" }));
  if (s.view !== "local") {
    const go = h("button", { class: "button quiet", type: "button", text: "Open the neighbourhood" });
    go.addEventListener("click", () => store.set({ view: "local" }));
    wrap.append(h("p", { text: "Relays only make sense among close neighbours. Open a neighbourhood to build a network across its few hundred bodies." }), h("div", { class: "button-row" }, go));
    return wrap;
  }
  const build = h("button", { class: "button", type: "button", text: s.network ? "Rebuild for this moment" : "Build the network" });
  build.addEventListener("click", () => requestNetwork(store.state));
  const show = h("button", { class: "button quiet", type: "button", text: s.showNetwork ? "Hide links" : "Show links" });
  show.addEventListener("click", () => store.set({ showNetwork: !store.state.showNetwork }));
  const auto = h("button", { class: "button quiet", type: "button", "aria-pressed": String(autoRebuild), text: autoRebuild ? "Stop following orbits" : "Follow the orbits" });
  auto.addEventListener("click", () => {
    autoRebuild = !autoRebuild;
    store.set({ showNetwork: true });
  });
  wrap.append(
    h("p", { text: `Links count when both directions carry at least ${dataRate(minCapacity)}. Each relay adds a minute of processing.` }),
    shearNote(s),
    slider({
      label: "Minimum link rate",
      min: 1,
      max: 1e7,
      log: true,
      value: minCapacity,
      format: dataRate,
      onChange: (v) => {
        minCapacity = v;
        requestNetwork(store.state);
      },
    }),
    h("div", { class: "button-row" }, build, s.network ? show : null, s.network ? auto : null, regatherButton()),
  );
  if (s.network) {
    const rows: [string, string, string?][] = [
      ["Bodies", String(s.network.nodeCount)],
      ["Working links", String(s.network.edges.length)],
      ["Pairs that can reach each other", `${sci(100 * pairCoverage(s.network), 3)}%`, "big"],
      ["Built at", `${sci(s.networkBuiltAtYr ?? 0, 4)} yr`],
    ];
    if (s.route) {
      rows.push(["Route hops", String(s.route.edges.length), "good"]);
      rows.push(["Route delay", duration(s.route.delay), "big"]);
      rows.push(["Slowest hop", dataRate(s.route.bottleneck)]);
    } else if (s.origin && s.target) {
      const inNet = s.networkPositions.some((b) => b.id === s.origin!.id) && s.networkPositions.some((b) => b.id === s.target!.id);
      rows.push(["Route", inNet ? "No path at this moment" : "Endpoints are outside this neighbourhood", "bad"]);
    }
    wrap.append(readout(rows));
  }
  return wrap;
}

export function renderSignal(s: AppState): HTMLElement {
  const parts: (HTMLElement | null)[] = [
    h("h2", { text: "Send a signal" }),
    h("p", { text: "Light takes days to cross between neighbours and years to cross the torus. Dust swallows short wavelengths, the inner disk blocks the far side, and the black hole bends and slows anything that passes close." }),
    slots(s, { origin: "Transmitter", target: "Receiver" }),
    segmented<BandId>(
      "Band",
      (Object.keys(BANDS) as BandId[]).map((id) => ({ value: id, label: BANDS[id].label.split(" · ")[0] })),
      s.band,
      (v) => store.set({ band: v, network: null, route: null }),
      undefined,
      BANDS[s.band].label,
    ),
  ];
  if (s.origin && s.target && s.origin.id !== s.target.id) {
    liveTarget = h("div", {}, linkRows(s));
    parts.push(liveTarget);
  } else {
    liveTarget = null;
  }
  parts.push(
    h("h3", { text: "Your equipment" }),
    slider({ label: "Transmit power", min: 1, max: 1e9, log: true, value: s.rig.power, format: (v) => `${sci(v, 2)} W`, onChange: (v) => store.set({ rig: { ...store.state.rig, power: v } }) }),
    slider({ label: "Dish or mirror diameter", min: 0.1, max: 1000, log: true, value: s.rig.apertureDiameter, format: (v) => `${sci(v, 2)} m`, onChange: (v) => store.set({ rig: { ...store.state.rig, apertureDiameter: v } }) }),
    slider({ label: "Bandwidth", min: 1, max: 1e10, log: true, value: s.rig.bandwidth, format: (v) => `${sci(v, 2)} Hz`, onChange: (v) => store.set({ rig: { ...store.state.rig, bandwidth: v } }) }),
    networkSection(s),
    h("p", { class: "axis-note", text: "Dust opacity comes from the model's own grain sizes at each point along the beam, so changing the fragmentation speed changes which bands get through." }),
  );
  return h("div", {}, ...parts);
}

export function refreshRoute(s: AppState): boolean {
  const route = routeFor(s, s.network);
  if (route === s.route) return false;
  store.set({ route });
  return true;
}
