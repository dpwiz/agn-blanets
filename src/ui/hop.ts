import type { Blanet } from "../physics/bodies";
import { C_LIGHT, G, YR } from "../physics/constants";
import { orbitalPeriod, orbitalPosition, propagateKepler } from "../physics/kepler";
import { torchIntercept, type TorchFlight } from "../physics/torch";
import { hohmannTime, porkchop, surfaceEscapeSpeed, transferLeg, type Porkchop, type TransferLeg } from "../physics/transfer";
import { distance } from "../physics/vec";
import { orbitalShipLeg, torchShipLeg, type Ship } from "../ship";
import { smbhMassKg, store, type AppState } from "../state";
import { duration, length, sci, speed } from "../format";
import { h, readout, segmented, slider } from "./dom";
import { slots } from "./slots";

interface PorkState {
  key: string;
  chart: Porkchop;
  pick: { i: number; j: number } | null;
}

let pork: PorkState | null = null;

function departureFloor(s: AppState): number {
  const now = s.timeYr * YR;
  const ship = s.ship;
  if (ship && s.origin && ship.legs[ship.legs.length - 1].to.id === s.origin.id) {
    return Math.max(now, ship.legs[ship.legs.length - 1].arriveTime);
  }
  return now;
}

function ensurePorkchop(s: AppState, origin: Blanet, target: Blanet, force = false): PorkState {
  const start = departureFloor(s);
  const key = `${origin.id}-${target.id}-${s.params.mSmbhMsun}`;
  const stale = pork && pork.chart.departTimes[0] < start - 0.05 * (pork.chart.departTimes[pork.chart.departTimes.length - 1] - pork.chart.departTimes[0]);
  if (pork && pork.key === key && !force && !stale) return pork;
  const mSmbh = smbhMassKg(s.params);
  const th = hohmannTime(origin.orbit.radius, target.orbit.radius, mSmbh);
  const window = Math.min(orbitalPeriod(origin.orbit.radius, mSmbh), 6 * th);
  const chart = porkchop(origin, target, mSmbh, start, window, 0.08 * th, 2.2 * th, 44, 36);
  let pick: PorkState["pick"] = null;
  let bestDv = Infinity;
  chart.dv.forEach((v, idx) => {
    if (v < bestDv) {
      bestDv = v;
      pick = { i: Math.floor(idx / chart.flightTimes.length), j: idx % chart.flightTimes.length };
    }
  });
  pork = { key, chart, pick };
  return pork;
}

function pickedLeg(s: AppState, p: PorkState): TransferLeg | null {
  if (!p.pick || !s.origin || !s.target) return null;
  return transferLeg(s.origin, s.target, smbhMassKg(s.params), p.chart.departTimes[p.pick.i], p.chart.flightTimes[p.pick.j]);
}

function previewOrbital(s: AppState, leg: TransferLeg | null): void {
  if (!leg) {
    store.set({ hopPreview: null });
    return;
  }
  const mSmbh = smbhMassKg(s.params);
  const steps = 160;
  const points = propagateKepler(leg.departPosition, leg.departVelocity, G * mSmbh, leg.timeOfFlight, steps);
  const times = points.map((_, i) => leg.departTime + (leg.timeOfFlight * i) / steps);
  store.set({ hopPreview: { points, times, kind: "orbital" } });
}

function drawPorkchop(canvas: HTMLCanvasElement, p: PorkState, nowS: number): void {
  const dpr = Math.min(window.devicePixelRatio, 2);
  const w = canvas.clientWidth || 300;
  const hgt = canvas.clientHeight || 240;
  canvas.width = w * dpr;
  canvas.height = hgt * dpr;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(dpr, dpr);
  const nI = p.chart.departTimes.length;
  const nJ = p.chart.flightTimes.length;
  const pad = { l: 34, r: 6, t: 6, b: 26 };
  const cw = (w - pad.l - pad.r) / nI;
  const ch = (hgt - pad.t - pad.b) / nJ;
  const finite = Array.from(p.chart.dv).filter(Number.isFinite);
  const lo = Math.log10(Math.min(...finite));
  const hi = Math.log10(Math.min(Math.max(...finite), 10 ** lo * 30));
  ctx.fillStyle = "#0e0c1f";
  ctx.fillRect(0, 0, w, hgt);
  for (let i = 0; i < nI; i++) {
    for (let j = 0; j < nJ; j++) {
      const v = p.chart.dv[i * nJ + j];
      if (!Number.isFinite(v)) continue;
      const u = 1 - Math.min(Math.max((Math.log10(v) - lo) / (hi - lo || 1), 0), 1);
      const r = Math.round(40 + 205 * u ** 0.9);
      const g = Math.round(28 + 190 * u ** 1.8);
      const b = Math.round(70 + 90 * u ** 3);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(pad.l + i * cw, hgt - pad.b - (j + 1) * ch, Math.ceil(cw), Math.ceil(ch));
    }
  }
  if (p.pick) {
    ctx.strokeStyle = "#f2577c";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(pad.l + (p.pick.i + 0.5) * cw, hgt - pad.b - (p.pick.j + 0.5) * ch, 6, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = "#a79bd6";
  ctx.font = "12px 'Barlow Semi Condensed', sans-serif";
  const d0 = (p.chart.departTimes[0] - nowS) / YR;
  const d1 = (p.chart.departTimes[nI - 1] - nowS) / YR;
  ctx.fillText(`leave in ${sci(d0, 2)} yr`, pad.l, hgt - 8);
  const right = `${sci(d1, 2)} yr`;
  ctx.fillText(right, w - pad.r - ctx.measureText(right).width, hgt - 8);
  ctx.save();
  ctx.translate(12, hgt - pad.b);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText(`flight ${sci(p.chart.flightTimes[0] / YR, 2)} yr`, 0, 0);
  const top = `${sci(p.chart.flightTimes[nJ - 1] / YR, 2)} yr`;
  ctx.fillText(top, hgt - pad.b - pad.t - ctx.measureText(top).width, 0);
  ctx.restore();
  canvas.dataset.geom = JSON.stringify({ pad, cw, ch, nI, nJ, hgt });
}

function launch(s: AppState, leg: Ship["legs"][number]): void {
  const prev = s.ship;
  const chain = prev && prev.legs[prev.legs.length - 1].to.id === leg.from.id;
  const ship: Ship = chain ? { ...prev, legs: [...prev.legs, leg] } : { legs: [leg], startTime: s.timeYr * YR };
  store.set({ ship, hopPreview: null, origin: leg.to, target: null, armedSlot: "target" });
  pork = null;
}

function orbitalSection(s: AppState): (HTMLElement | null)[] {
  const origin = s.origin!;
  const target = s.target!;
  const mSmbh = smbhMassKg(s.params);
  const p = ensurePorkchop(s, origin, target);
  const leg = pickedLeg(s, p);
  const canvas = h("canvas", { class: "porkchop", role: "img", "aria-label": "Porkchop plot of transfer cost against departure date and flight time" });
  requestAnimationFrame(() => drawPorkchop(canvas, p, s.timeYr * YR));
  canvas.addEventListener("click", (e) => {
    const g = JSON.parse(canvas.dataset.geom ?? "null");
    if (!g) return;
    const r = canvas.getBoundingClientRect();
    const i = Math.floor((e.clientX - r.left - g.pad.l) / g.cw);
    const j = Math.floor((g.hgt - g.pad.b - (e.clientY - r.top)) / g.ch);
    if (i < 0 || j < 0 || i >= g.nI || j >= g.nJ) return;
    p.pick = { i, j };
    previewOrbital(store.state, pickedLeg(store.state, p));
  });
  if (!store.state.hopPreview && leg) queueMicrotask(() => previewOrbital(store.state, leg));
  const exhaust = s.orbitalExhaustKms * 1e3;
  const th = hohmannTime(origin.orbit.radius, target.orbit.radius, mSmbh);
  const launchBtn = h("button", { class: "button", type: "button", text: "Launch this transfer" });
  launchBtn.toggleAttribute("disabled", !leg);
  launchBtn.addEventListener("click", () => {
    const now = store.state;
    let fresh = pickedLeg(now, p);
    if (!fresh || fresh.departTime < departureFloor(now)) fresh = pickedLeg(now, ensurePorkchop(now, origin, target, true));
    if (fresh) launch(now, orbitalShipLeg(origin, target, fresh, mSmbh, now.orbitalExhaustKms * 1e3));
  });
  const refresh = h("button", { class: "button quiet", type: "button", text: "Recompute from now" });
  refresh.addEventListener("click", () => {
    ensurePorkchop(store.state, origin, target, true);
    store.set({ hopPreview: null });
  });
  return [
    canvas,
    h("p", { class: "axis-note", text: "Brighter means cheaper. Click to choose a departure and flight time; the ring marks your pick. If the window slips into the past while time runs, launching takes the cheapest one still ahead." }),
    leg
      ? readout([
          ["Leave in", leg.departTime - s.timeYr * YR > YR ? duration(leg.departTime - s.timeYr * YR) : "now"],
          ["Coast time", duration(leg.timeOfFlight), "big"],
          ["Escape and capture Δv", speed(leg.dvTotal), "big"],
          ["Speed relative to origin", speed(leg.vInfDepart)],
          ["Speed relative to target", speed(leg.vInfArrive)],
          ["Fuel-to-dry mass ratio", sci(Math.exp(leg.dvTotal / exhaust), 3)],
          ["Hohmann reference", duration(th)],
        ])
      : h("p", { class: "callout", text: "No transfer found in this window. Try recomputing later." }),
    leg
      ? h("p", {
          class: "callout",
          text: `While you coast, differential rotation reshuffles the neighbourhood about ${sci(leg.timeOfFlight / (2 / (3 * Math.sqrt((G * mSmbh) / origin.orbit.radius ** 3))), 2)} times. A torchship arrives while today's neighbours are still close by.`,
        })
      : null,
    slider({
      label: "Exhaust speed",
      min: 3,
      max: 3e4,
      log: true,
      value: s.orbitalExhaustKms,
      format: (v) => `${sci(v, 2)} km/s`,
      hint: "Chemical rockets manage about 4.5 km/s; fusion drives perhaps thousands.",
      onChange: (v) => store.set({ orbitalExhaustKms: v }),
    }),
    h(
      "p",
      { class: "axis-note" },
      `Escape from ${origin.name} alone costs ${speed(surfaceEscapeSpeed({ id: 0, orbit: origin.orbit, mass: origin.mass, radius: origin.radius }))} from its surface; Δv here assumes you start and end in a parking orbit at ${(1.5).toFixed(1)} radii.`,
    ),
    h("div", { class: "button-row" }, launchBtn, refresh),
  ];
}

function torchSection(s: AppState): (HTMLElement | null)[] {
  const origin = s.origin!;
  const target = s.target!;
  const mSmbh = smbhMassKg(s.params);
  const a = s.torchAccelerationG * 9.80665;
  const flight: TorchFlight = torchIntercept(origin.orbit, target.orbit, mSmbh, departureFloor(s), a, s.exhaustFractionC * C_LIGHT);
  const steps = 32;
  queueMicrotask(() => {
    const pts = Array.from({ length: steps + 1 }, (_, i) => {
      const u = i / steps;
      return [flight.from[0] + u * (flight.to[0] - flight.from[0]), flight.from[1] + u * (flight.to[1] - flight.from[1]), flight.from[2] + u * (flight.to[2] - flight.from[2])] as [number, number, number];
    });
    store.set({ hopPreview: { points: pts, times: pts.map((_, i) => flight.departTime + (flight.coordinateTime * i) / steps), kind: "torch" } });
  });
  const launchBtn = h("button", { class: "button", type: "button", text: "Light the torch" });
  launchBtn.addEventListener("click", () => {
    const now = store.state;
    const fresh = torchIntercept(origin.orbit, target.orbit, mSmbh, departureFloor(now), now.torchAccelerationG * 9.80665, now.exhaustFractionC * C_LIGHT);
    launch(now, torchShipLeg(origin, target, fresh));
  });
  const coast = hohmannTime(origin.orbit.radius, target.orbit.radius, mSmbh);
  return [
    readout([
      ["Straight-line distance", `${length(flight.distance)}`],
      ["Time aboard the ship", duration(flight.properTime), "big"],
      ["Time for everyone else", duration(flight.coordinateTime), "big"],
      ["Top speed", speed(flight.peakSpeed)],
      ["Peak Lorentz factor", sci(flight.peakGamma, 4)],
      ["Fuel-to-dry mass ratio", sci(flight.massRatio, 3)],
    ]),
    h("p", { class: "callout", text: `A coasting orbital transfer between the same two bodies takes about ${duration(coast)}. The black hole's pull here is ~${sci(G * mSmbh / (origin.orbit.radius ** 2) / a, 2)} of your thrust, so a straight burn is a fair approximation.` }),
    slider({
      label: "Acceleration",
      min: 0.01,
      max: 10,
      log: true,
      value: s.torchAccelerationG,
      format: (v) => `${sci(v, 2)} g`,
      onChange: (v) => store.set({ torchAccelerationG: v }),
    }),
    slider({
      label: "Exhaust speed",
      min: 0.01,
      max: 1,
      log: true,
      value: s.exhaustFractionC,
      format: (v) => `${sci(v, 2)} c`,
      hint: "1 c is a photon rocket. Fusion exhaust tops out near 0.1 c.",
      onChange: (v) => store.set({ exhaustFractionC: v }),
    }),
    h("div", { class: "button-row" }, launchBtn),
  ];
}

function itinerary(s: AppState): HTMLElement | null {
  const ship = s.ship;
  if (!ship) return null;
  const mSmbh = smbhMassKg(s.params);
  const last = ship.legs[ship.legs.length - 1];
  const totalProper = ship.legs.reduce((acc, l) => acc + l.properTime, 0);
  const span = last.arriveTime - ship.startTime;
  const clear = h("button", { class: "button quiet", type: "button", text: "Scrap the itinerary" });
  clear.addEventListener("click", () => store.set({ ship: null }));
  return h(
    "div",
    {},
    h("h3", { text: "Itinerary" }),
    h(
      "ol",
      { class: "itinerary" },
      ...ship.legs.map((l) =>
        h(
          "li",
          {},
          h("strong", { text: `${l.from.name} to ${l.to.name}` }),
          h("br"),
          `${l.kind === "torch" ? "Torch" : "Coast"}: ${duration(l.properTime)} aboard, ${duration(l.arriveTime - l.departTime)} outside, ${length(distance(orbitalPosition(l.from.orbit, mSmbh, l.departTime), orbitalPosition(l.to.orbit, mSmbh, l.arriveTime)))}`,
        ),
      ),
    ),
    readout([
      ["Flight time aboard", duration(totalProper), "big"],
      ["Outside clock from launch", duration(span)],
    ]),
    h("div", { class: "button-row" }, clear),
  );
}

export function renderHop(s: AppState): HTMLElement {
  const parts: (HTMLElement | null)[] = [
    h("h2", { text: "Fly between bodies" }),
    h("p", { text: "Pick where to leave from and where to go, then choose how: coast on a gravity-only transfer orbit, or burn the whole way with a torchship." }),
    slots(s),
    segmented(
      "Propulsion",
      [
        { value: "orbital", label: "Coast (Lambert)" },
        { value: "torch", label: "Torchship" },
      ],
      s.hopKind,
      (v) => store.set({ hopKind: v, hopPreview: null }),
    ),
  ];
  if (s.origin && s.target && s.origin.id !== s.target.id) {
    parts.push(...(s.hopKind === "orbital" ? orbitalSection(s) : torchSection(s)));
  } else {
    parts.push(h("p", { class: "axis-note", text: "Click two bodies in the scene, or use the slots above to choose which one you are picking." }));
  }
  parts.push(itinerary(s));
  return h("div", {}, ...parts);
}
