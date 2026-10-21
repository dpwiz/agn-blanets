import { Color, Group, Vector3 } from "three";
import { blanetTrack, type Blanet } from "../physics/bodies";
import { nicheRoutes } from "../physics/civ";
import { linkBudget, BANDS } from "../physics/comms";
import { hohmannArc, hohmannDeltaV, hohmannTime } from "../physics/transfer";
import { duration, speed } from "../format";
import { C_LIGHT, PC, YR } from "../physics/constants";
import { orbitalPosition, orbitalPeriod, orbitPath } from "../physics/kepler";
import { radialState } from "../physics/model";
import { EPOCH_MAX_YR, epochState, gasRemaining } from "../physics/era";
import { lerp, type Vec3 } from "../physics/vec";
import { shipStateAt } from "../ship";
import { agnDarkNow, commsEnvironment, smbhMassKg, store, TIMED_OVERLAYS, type AppState } from "../state";
import { BIRTH_LOOK, createBodyLayer, pickNearest, type BodyLayer, type LookUp } from "./bodies";
import { fatePaint, MidplaneOverlay, nichePaint, resourcePaint, settledPaint, stagePaint, temperaturePaint, type OverlayPaint } from "./midplane";
import { buildGasHaze, buildPlanetCloud, floorRadius, type CloudLayer } from "./cloud";
import { LabelLayer, type LabelSpec } from "./labels";
import { buildLocalDecor, type LocalDecor } from "./local";
import { createMarker, PathLine, SegmentCloud } from "./overlays";
import { PALETTE } from "./palette";
import type { SceneContext } from "./scene";
import { buildTorusDecor, type TorusDecor } from "./torus";
import { LOCAL_PATCH_UNITS, localMap, torusMap, type ViewMap } from "./viewmap";

export const TORUS_CAMERA = { position: new Vector3(0, 36, 112), target: new Vector3(0, -6, 0) };
export const LOCAL_CAMERA = { position: new Vector3(0, 16, 24), target: new Vector3(0, 0, 0) };
export const SWEEP_DECADES_PER_SECOND = 0.5;
const STAGE_REPAINT_MS = 100;
const GAS_STEPS = 20;
const CIV_ROUTE_ANGLE = 0.6;
const CIV_ROUTE_SPACING = 1.4;

function lightTimeLabel(pc: number): string {
  const years = (pc * PC) / (C_LIGHT * YR);
  if (years < 1) return `${(years * 365.25).toFixed(0)} light-days`;
  return `${years < 10 ? years.toFixed(1) : Math.round(years)} light-years`;
}

export class World {
  private torusGroup = new Group();
  private localGroup = new Group();
  private overlayGroup = new Group();
  private planets: CloudLayer | null = null;
  private haze: CloudLayer | null = null;
  private decor: TorusDecor | null = null;
  private midplane: MidplaneOverlay | null = null;
  private paintedKey = "";
  private paintedAt = 0;
  private painted: OverlayPaint | null = null;
  private skyKey = "";
  private localDecor: LocalDecor | null = null;
  private torusBodies: BodyLayer = createBodyLayer(7);
  private localBodies: BodyLayer = createBodyLayer(7);
  private labels: LabelLayer;
  private selectedOrbit = new PathLine(PALETTE.bone, 0.45);
  private preview = new PathLine(PALETTE.thrust, 0.9, true);
  private shipPaths: PathLine[] = [];
  private shipMarker = createMarker(PALETTE.thrust, 0.18);
  private signalLine = new PathLine(PALETTE.signal, 0.9);
  private network = new SegmentCloud();
  private route = new PathLine(PALETTE.emberHot, 1);
  private civRouteLines = [new PathLine(PALETTE.thrust, 0.85, true), new PathLine(PALETTE.bone, 0.7, true)];
  private civRoutes: { key: string; html: string; mid: Vec3 }[] = [];
  private map: ViewMap;
  private networkScene: Vector3[] = [];
  private lastSignalEval = 0;
  private signalOk = false;

  constructor(private ctx: SceneContext, labelsRoot: HTMLElement) {
    this.labels = new LabelLayer(labelsRoot);
    ctx.scene.add(this.torusGroup, this.localGroup, this.overlayGroup);
    this.torusGroup.add(this.torusBodies.points);
    this.localGroup.add(this.localBodies.points);
    this.overlayGroup.add(this.selectedOrbit.line, this.preview.line, this.shipMarker, this.signalLine.line, this.network.lines, this.route.line, ...this.civRouteLines.map((l) => l.line));
    this.map = torusMap(floorRadius(store.state.params.rMinPc), store.state.zExaggeration);
    this.rebuildPopulation(store.state);
    this.rebuildLocal(store.state);
    this.applyView(store.state, false);
    store.subscribe((s, changed) => this.onChange(s, changed));
    ctx.onFrame((dt) => this.frame(dt));
    this.installPicking();
  }

  private onChange(s: AppState, changed: Set<keyof AppState>): void {
    if (changed.has("population")) this.rebuildPopulation(s);
    else if (changed.has("colorBy")) this.rebuildPlanets(s);
    const repaint: (keyof AppState)[] = ["population", "overlay", "eraMode", "eraYr", "resourceGroup", "spreadTech", "spreadSeed"];
    if (repaint.some((k) => changed.has(k))) this.paintOverlay(s, true);
    if (changed.has("focus") || changed.has("population")) this.rebuildLocal(s);
    if (changed.has("view")) this.applyView(s, true);
    if (changed.has("zExaggeration")) {
      this.planets?.setZExaggeration(s.zExaggeration);
      this.haze?.setZExaggeration(s.zExaggeration);
      this.localDecor?.setZExaggeration(s.zExaggeration);
    }
    if (changed.has("hopPreview")) {
      if (s.hopPreview) this.preview.setPoints(s.hopPreview.points, s.hopPreview.times);
      else this.preview.hide();
    }
    if (changed.has("ship")) this.rebuildShip(s);
    if (changed.has("network") || changed.has("route") || changed.has("showNetwork")) this.rebuildNetwork(s);
    if (changed.has("selected")) this.rebuildSelectedOrbit(s);
    if (changed.has("origin") || changed.has("target") || changed.has("band") || changed.has("rig") || changed.has("tab")) this.lastSignalEval = 0;
  }

  private rebuildPopulation(s: AppState): void {
    const mSmbh = smbhMassKg(s.params);
    const rFloor = floorRadius(s.params.rMinPc);
    if (this.haze) {
      this.torusGroup.remove(this.haze.points);
      this.haze.dispose();
    }
    if (this.decor) {
      this.torusGroup.remove(this.decor.group);
      this.decor.dispose();
    }
    if (this.midplane) {
      this.torusGroup.remove(this.midplane.group);
      this.midplane.dispose();
    }
    this.midplane = new MidplaneOverlay(s.params.rMinPc * PC, s.params.rMaxPc * PC, rFloor, s.population.bins.length);
    this.torusGroup.add(this.midplane.group);
    this.paintedKey = "";
    this.decor = buildTorusDecor(s.population, s.params, rFloor);
    this.haze = buildGasHaze(s.population, mSmbh, rFloor);
    this.haze.setZExaggeration(s.zExaggeration);
    this.torusGroup.add(this.decor.group, this.haze.points);
    this.rebuildPlanets(s);
    this.torusBodies.setBodies(this.withPinned(s.landmarks, s));
  }

  private paintOverlay(s: AppState, force: boolean): void {
    const overlay = this.midplane;
    if (!overlay) return;
    overlay.show(s.overlay !== "none");
    if (s.overlay === "none") {
      if (this.painted) {
        this.painted = null;
        this.paintedKey = "";
        this.layCivRoutes(s);
      }
      return;
    }
    const dark = agnDarkNow(s);
    const timed = TIMED_OVERLAYS.includes(s.overlay) || (s.overlay === "fate" && s.eraMode);
    const gas = s.eraMode ? Math.round(gasRemaining(s.eraYr, s.params) * GAS_STEPS) / GAS_STEPS : 1;
    const seed = s.spreadSeed ? `${s.spreadSeed.radius}|${s.spreadSeed.yr}` : "";
    const key = [s.overlay, s.eraMode, dark, gas, timed ? s.eraYr : "", s.resourceGroup, s.spreadTech, seed].join("|");
    if (key === this.paintedKey) return;
    const now = performance.now();
    if (!force && timed && now - this.paintedAt < STAGE_REPAINT_MS) return;
    this.paintedKey = key;
    this.paintedAt = now;
    this.painted = this.paintFor(s, dark, gas);
    overlay.paint(this.painted);
    this.layCivRoutes(s);
  }

  private layCivRoutes(s: AppState): void {
    const routes = s.overlay === "niches" && this.painted ? nicheRoutes(this.painted.zones) : [];
    const mSmbh = smbhMassKg(s.params);
    this.civRoutes = routes.slice(0, this.civRouteLines.length).map((r, i) => {
      const points = hohmannArc(r.from, r.to, CIV_ROUTE_ANGLE + i * CIV_ROUTE_SPACING);
      this.civRouteLines[i].setPoints(points);
      const cost = `${speed(hohmannDeltaV(r.from, r.to, mSmbh))}, ${duration(hohmannTime(r.from, r.to, mSmbh))}`;
      return { key: `civ-route-${i}`, html: `${r.name}<small>${cost} by Hohmann</small>`, mid: points[Math.floor(points.length / 2)] };
    });
    this.civRouteLines.forEach((l, i) => {
      if (i >= this.civRoutes.length) l.hide();
    });
  }

  private paintFor(s: AppState, dark: boolean, gas: number): OverlayPaint {
    switch (s.overlay) {
      case "temperature":
        return temperaturePaint(s.population, s.params, dark, gas);
      case "niches":
        return nichePaint(s.population, s.params, s.eraYr);
      case "resources":
        return resourcePaint(s.population, s.params, s.eraYr, s.resourceGroup);
      case "settled":
        return settledPaint(s.population, s.params, s.spreadSeed, s.spreadTech, s.eraYr);
      default:
        return s.eraMode ? stagePaint(s.population, s.params, s.eraYr) : fatePaint(s.population, s.params);
    }
  }

  private bodyLook(s: AppState): LookUp {
    if (!s.eraMode) return BIRTH_LOOK;
    return (b) => {
      const e = epochState(blanetTrack(b, s.params), s.eraYr);
      return { mass: e.mass, hidden: e.stage === "dust" || e.stage === "never", remnant: e.stage === "remnant" };
    };
  }

  private advanceEpoch(s: AppState, dt: number): void {
    if (s.eraSweeping) {
      const next = Math.min(s.eraYr * 10 ** (SWEEP_DECADES_PER_SECOND * dt), EPOCH_MAX_YR);
      store.state.eraYr = next;
      if (next >= EPOCH_MAX_YR) store.set({ eraYr: next, eraSweeping: false });
    }
    const e = store.state;
    const gas = e.eraMode ? gasRemaining(e.eraYr, e.params) : 1;
    this.planets?.setEpoch(e.eraMode, e.eraYr, e.params.agnLifetimeYr);
    this.haze?.setFade(gas);
    this.localDecor?.setGas(gas);
    this.decor?.setShining(agnDarkNow(e) ? 0 : 1);
    this.midplane?.setOpacity(e.overlay === "temperature" ? gas : 1);
    this.paintOverlay(e, false);
    const env = commsEnvironment(e);
    const skyKey = `${env.agnLuminosity > 0}|${env.gasFraction > 0}`;
    if (this.skyKey && skyKey !== this.skyKey) store.set({ network: null, networkBuiltAtYr: null, route: null });
    this.skyKey = skyKey;
  }

  private rebuildPlanets(s: AppState): void {
    if (this.planets) {
      this.torusGroup.remove(this.planets.points);
      this.planets.dispose();
    }
    const mSmbh = smbhMassKg(s.params);
    this.planets = buildPlanetCloud(s.population, s.impostors, mSmbh, floorRadius(s.params.rMinPc), s.colorBy, s.params);
    this.planets.setZExaggeration(s.zExaggeration);
    this.torusGroup.add(this.planets.points);
  }

  private rebuildLocal(s: AppState): void {
    if (this.localDecor) {
      this.localGroup.remove(this.localDecor.group);
      this.localDecor.dispose();
    }
    this.localDecor = buildLocalDecor(radialState(s.focus.radius, s.params), s.focus.patchRadius);
    this.localDecor.setZExaggeration(s.zExaggeration);
    this.localGroup.add(this.localDecor.group);
    this.localBodies.setBodies(this.withPinned(s.focus.blanets, s));
  }

  private withPinned(base: Blanet[], s: AppState): Blanet[] {
    const ids = new Set(base.map((b) => b.id));
    const extra = [s.selected, s.origin, s.target].filter((b): b is Blanet => !!b && !ids.has(b.id));
    const unique = new Map(extra.map((b) => [b.id, b]));
    return [...base, ...unique.values()];
  }

  private applyView(s: AppState, animate: boolean): void {
    this.torusGroup.visible = s.view === "torus";
    this.localGroup.visible = s.view === "local";
    const cam = s.view === "torus" ? TORUS_CAMERA : LOCAL_CAMERA;
    this.ctx.flyTo(cam.position, cam.target, animate ? 1.4 : 0);
    this.rebuildSelectedOrbit(s);
  }

  private rebuildSelectedOrbit(s: AppState): void {
    const b = s.selected;
    if (!b) {
      this.selectedOrbit.hide();
      return;
    }
    const mSmbh = smbhMassKg(s.params);
    if (s.view === "torus") {
      this.selectedOrbit.setPoints(orbitPath(b.orbit, 192));
    } else {
      const period = orbitalPeriod(b.orbit.radius, mSmbh);
      const t0 = s.timeYr * YR;
      const times = Array.from({ length: 160 }, (_, i) => t0 + ((i - 120) / 160) * period * 0.25);
      this.selectedOrbit.setPoints(times.map((t) => orbitalPosition(b.orbit, mSmbh, t)), times);
    }
  }

  private rebuildShip(s: AppState): void {
    for (const p of this.shipPaths) {
      this.overlayGroup.remove(p.line);
      p.dispose();
    }
    this.shipPaths = [];
    if (!s.ship) {
      this.shipMarker.visible = false;
      return;
    }
    for (const leg of s.ship.legs) {
      const line = new PathLine(PALETTE.thrust, 0.75);
      line.setPoints(leg.path, leg.pathTimes);
      this.overlayGroup.add(line.line);
      this.shipPaths.push(line);
    }
    this.shipMarker.visible = true;
  }

  private rebuildNetwork(s: AppState): void {
    if (!s.network || !s.showNetwork) {
      this.network.hide();
    } else {
      const maxCap = Math.max(...s.network.edges.map((e) => e.capacity), 1);
      const colors = s.network.edges.map((e) => {
        const u = Math.log10(e.capacity) / Math.log10(maxCap);
        return new Color().copy(PALETTE.haze).lerp(PALETTE.signal, Math.min(Math.max(u, 0), 1)).multiplyScalar(0.35 + 0.65 * u);
      });
      this.network.setPairs(
        s.network.edges.map((e) => [e.a, e.b]),
        colors,
      );
    }
    this.networkScene = s.networkPositions.map(() => new Vector3());
    if (!s.route) this.route.hide();
  }

  private highlightMap(s: AppState): Map<number, Color> {
    const h = new Map<number, Color>();
    if (s.route) for (const i of s.route.nodes) h.set(s.networkPositions[i]?.id ?? -1, PALETTE.signal);
    if (s.selected) h.set(s.selected.id, PALETTE.bone);
    if (s.target) h.set(s.target.id, PALETTE.signal);
    if (s.origin) h.set(s.origin.id, PALETTE.thrust);
    return h;
  }

  private frame(dt: number): void {
    const s = store.state;
    if (s.playing) store.state.timeYr = s.timeYr + s.speedYrPerSec * dt;
    this.advanceEpoch(s, dt);
    const t = store.state.timeYr * YR;
    const mSmbh = smbhMassKg(s.params);
    this.map =
      s.view === "torus"
        ? torusMap(floorRadius(s.params.rMinPc), s.zExaggeration)
        : localMap({ radius: s.focus.radius, phase: s.focus.phase, patchRadius: s.focus.patchRadius, mSmbh }, t, s.zExaggeration);
    this.planets?.setTime(store.state.timeYr);
    this.haze?.setTime(store.state.timeYr);
    const highlight = this.highlightMap(s);
    const layer = s.view === "torus" ? this.torusBodies : this.localBodies;
    const wanted = this.withPinned(s.view === "torus" ? s.landmarks : s.focus.blanets, s);
    if (wanted.length !== layer.bodies.length || wanted.some((b, i) => b !== layer.bodies[i])) layer.setBodies(wanted);
    layer.update(this.map, t, mSmbh, highlight, this.bodyLook(store.state));

    if (s.view === "local" && s.selected) this.rebuildSelectedOrbit(s);
    this.selectedOrbit.update(this.map);
    const showRoutes = s.view === "torus" && this.midplane?.showsLabels;
    this.civRouteLines.forEach((l, i) => {
      if (showRoutes && i < this.civRoutes.length) {
        l.line.visible = true;
        l.update(this.map);
      } else l.line.visible = false;
    });
    this.preview.update(this.map);
    for (const p of this.shipPaths) p.update(this.map);
    if (s.ship) {
      const st = shipStateAt(s.ship, t, mSmbh);
      this.map.toScene(st.position, this.shipMarker.position);
    }

    if (s.network && s.showNetwork) {
      s.networkPositions.forEach((b, i) => this.map.toScene(orbitalPosition(b.orbit, mSmbh, t), this.networkScene[i] ?? (this.networkScene[i] = new Vector3())));
      this.network.update(this.networkScene);
      if (s.route) {
        this.route.setPoints(s.route.nodes.map((i) => orbitalPosition(s.networkPositions[i].orbit, mSmbh, t)));
        this.route.update(this.map);
      }
    }

    this.updateSignalLine(s, t, mSmbh);
    this.renderLabels(s, t, mSmbh);
  }

  private updateSignalLine(s: AppState, t: number, mSmbh: number): void {
    if (s.tab !== "signal" || !s.origin || !s.target) {
      this.signalLine.hide();
      return;
    }
    const a = orbitalPosition(s.origin.orbit, mSmbh, t);
    const b = orbitalPosition(s.target.orbit, mSmbh, t);
    const now = performance.now();
    if (now - this.lastSignalEval > 400) {
      this.lastSignalEval = now;
      this.signalOk = linkBudget(a, b, BANDS[s.band], s.rig, commsEnvironment(s)).capacity >= 1;
      this.signalLine.setColor(this.signalOk ? PALETTE.signal : PALETTE.thrust);
    }
    const n = 48;
    const pts: Vec3[] = Array.from({ length: n + 1 }, (_, i) => lerp(a, b, i / n));
    this.signalLine.setPoints(pts);
    this.signalLine.update(this.map);
  }

  private renderLabels(s: AppState, t: number, mSmbh: number): void {
    const specs: LabelSpec[] = [];
    if (s.view === "torus" && this.midplane?.showsLabels) {
      specs.push(...this.midplane.labels);
      for (const r of this.civRoutes) specs.push({ key: r.key, html: r.html, className: "overlay route", position: this.map.toScene(r.mid) });
    }
    if (s.view === "torus" && this.decor) {
      for (const r of this.decor.rings) {
        specs.push({
          key: `ring-${r.radiusPc}`,
          html: `${r.radiusPc >= 1 ? r.radiusPc : r.radiusPc.toString()} pc<small>${lightTimeLabel(r.radiusPc)}</small>`,
          className: "ring",
          position: r.anchor,
        });
      }
    }
    if (s.view === "local") {
      const half = LOCAL_PATCH_UNITS * 0.95;
      const across = 2 * s.focus.patchRadius;
      specs.push(
        { key: "dir-in", html: "toward the black hole", className: "ring", position: new Vector3(0, 0, half) },
        { key: "dir-out", html: "away from the black hole", className: "ring", position: new Vector3(0, 0, -half) },
        { key: "dir-pro", html: "orbital motion", className: "ring", position: new Vector3(half, 0, 0) },
        {
          key: "scale",
          html: `${(s.focus.radius / PC).toPrecision(3)} pc out<small>patch ${(across / PC).toPrecision(2)} pc across, ${lightTimeLabel(across / PC)}</small>`,
          className: "ring",
          position: new Vector3(-half, 0, half),
        },
      );
    }
    const named: [Blanet | null, string][] = [
      [s.origin, "origin"],
      [s.target, "target"],
      [s.selected, ""],
    ];
    const done = new Set<number>();
    for (const [b, cls] of named) {
      if (!b || done.has(b.id)) continue;
      done.add(b.id);
      specs.push({
        key: `body-${b.id}`,
        html: b.name,
        className: `body ${cls}`,
        position: this.map.toScene(orbitalPosition(b.orbit, mSmbh, t)),
      });
    }
    if (s.ship) {
      specs.push({ key: "ship", html: "Ship", className: "body origin", position: this.shipMarker.position.clone() });
    }
    this.labels.render(specs, (p) => this.ctx.project(p));
  }

  private installPicking(): void {
    const canvas = this.ctx.canvas;
    let down: { x: number; y: number } | null = null;
    canvas.addEventListener("pointerdown", (e) => {
      down = { x: e.clientX, y: e.clientY };
    });
    canvas.addEventListener("pointerup", (e) => {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return;
      down = null;
      const s = store.state;
      const layer = s.view === "torus" ? this.torusBodies : this.localBodies;
      const hit = pickNearest(layer, (p) => this.ctx.project(p), e.clientX, e.clientY, 16);
      if (!hit) return;
      this.choose(hit);
    });
    const tooltip = document.getElementById("tooltip") as HTMLDivElement;
    canvas.addEventListener("pointermove", (e) => {
      const s = store.state;
      const layer = s.view === "torus" ? this.torusBodies : this.localBodies;
      const hit = pickNearest(layer, (p) => this.ctx.project(p), e.clientX, e.clientY, 14);
      canvas.style.cursor = hit ? "pointer" : "crosshair";
      if (!hit) {
        tooltip.hidden = true;
        return;
      }
      tooltip.hidden = false;
      tooltip.innerHTML = `<strong>${hit.name}</strong><br>${(hit.orbit.radius / PC).toPrecision(3)} pc from the black hole`;
      tooltip.style.left = `${e.clientX + 14}px`;
      tooltip.style.top = `${e.clientY + 14}px`;
    });
    canvas.addEventListener("pointerleave", () => {
      tooltip.hidden = true;
    });
  }

  choose(b: Blanet): void {
    const s = store.state;
    if (s.tab === "hop" || s.tab === "signal") {
      const slot = s.armedSlot ?? (!s.origin ? "origin" : !s.target ? "target" : null);
      if (slot === "origin") {
        store.set({ origin: b, armedSlot: s.target ? null : "target", hopPreview: null, route: null });
        return;
      }
      if (slot === "target") {
        store.set({ target: b, armedSlot: null, hopPreview: null, route: null });
        return;
      }
    }
    store.set({ selected: b });
  }
}
