import {
  BufferGeometry,
  Color,
  DataTexture,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  LinearFilter,
  LineBasicMaterial,
  LineLoop,
  Mesh,
  NearestFilter,
  RGBAFormat,
  RingGeometry,
  ShaderMaterial,
  Vector3,
} from "three";
import { diskAt } from "../physics/disk";
import { epochState, radiusWhereTemperature, type Stage } from "../physics/era";
import { GROUP_LABEL, ORGANICS_FRONT_K, SULFIDE_FRONT_K, type ElementGroup } from "../physics/chemistry";
import { lightReach, nicheAt, resourceAt, ringTrack, settlementTimes, skyAt, type Niche, type Seed, type SpreadTech } from "../physics/civ";
import { PC } from "../physics/constants";
import { fateOf, FATE_LABEL, type ObjectFate } from "../physics/fate";
import { growthLimits } from "../physics/growth";
import { frostLine } from "../physics/ice";
import type { ModelParams } from "../physics/params";
import type { PopulationSummary } from "../physics/population";
import { sci } from "../format";
import type { LabelSpec } from "./labels";
import { ambientColor, FATE_COLOR, NICHE_COLOR, rampColor, RESOURCE_STOPS, SETTLED_STOPS, STAGE_COLOR } from "./palette";
import { torusRadius } from "./viewmap";

export const OVERLAY_LABEL_FIRST_ANGLE = -2.8;
const LABEL_ARC_UNITS = 9;
const OVERLAY_OPACITY = 0.42;
const MIN_LABELLED_BINS = 6;

export const STAGE_LABEL: Record<Stage, string> = {
  dust: "Still dust",
  never: "Nothing forms",
  planet: "Planets",
  browndwarf: "Brown-dwarf mass",
  dustStar: "Unlit stellar-mass bodies",
  star: "Stars",
  massiveStar: "Massive stars",
  remnant: "Dead stars",
};

export const NICHE_LABEL: Record<Niche, string> = {
  never: "Nothing forms",
  dustOnly: "Still dust",
  glowMoons: "Moons of glowing worlds",
  hydrogenWell: "Hydrogen well",
  oven: "Oven midplane",
  temperate: "Liquid-water band",
  frost: "Frost on the grains",
  coldRock: "Cold rock worlds",
};

const RESOURCE_DECADES = 6;
const FAINT = new Color("#6d6496");

export const AMBIENT_CONTOURS: { temperature: number; label: string }[] = [
  { temperature: 373, label: "373 K" },
  { temperature: 273, label: "273 K" },
];

export interface OverlayPaint {
  colors: Color[];
  alphas: number[];
  smooth: boolean;
  contours: { radius: number; label?: string }[];
  zoneLabels: { radius: number; label: string }[];
  zones: { key: string; inner: number; outer: number }[];
}

function zonesOf<K extends string>(pop: PopulationSummary, keys: K[], color: (k: K) => Color, alpha: (k: K) => number, label: (k: K) => string): OverlayPaint {
  const contours: OverlayPaint["contours"] = [];
  const zoneLabels: OverlayPaint["zoneLabels"] = [];
  const zones: OverlayPaint["zones"] = [];
  let start = 0;
  for (let i = 1; i <= keys.length; i++) {
    if (i < keys.length && keys[i] === keys[start]) continue;
    const span = i - start;
    const inner = pop.bins[start].rInner;
    const outer = pop.bins[i - 1].rOuter;
    zones.push({ key: keys[start], inner, outer });
    if (span >= MIN_LABELLED_BINS && alpha(keys[start]) > 0) zoneLabels.push({ radius: Math.sqrt(inner * outer), label: label(keys[start]) });
    if (i < keys.length) contours.push({ radius: outer });
    start = i;
  }
  return { colors: keys.map(color), alphas: keys.map(alpha), smooth: false, contours, zoneLabels, zones };
}

function frostMarks(pop: PopulationSummary, p: ModelParams, gasFraction: number): Pick<OverlayPaint, "contours" | "zoneLabels"> {
  if (!(gasFraction > 0)) return { contours: [], zoneLabels: [] };
  const frost = frostLine(p, gasFraction);
  if (frost.radius !== null) {
    return { contours: [{ radius: frost.radius, label: `Frost line<small>water ice on the grains ${frost.frostyInside ? "inside" : "outside"}</small>` }], zoneLabels: [] };
  }
  const outer = pop.bins[Math.floor(pop.bins.length * 0.75)].rMid;
  const label = frost.everywhere ? "Water ice on every grain" : "Water stays vapour<small>too warm for frost at this gas density</small>";
  return { contours: [], zoneLabels: [{ radius: outer, label }] };
}

export function temperaturePaint(pop: PopulationSummary, p: ModelParams, agnDark: boolean, gasFraction: number): OverlayPaint {
  const params = agnDark ? { ...p, irradiationLuminosity: 0 } : p;
  const temps = pop.bins.map((b) => (agnDark ? diskAt(b.rMid, params).temperature : b.state.disk.temperature));
  const colors = temps.map((t) => ambientColor(t));
  const frost = frostMarks(pop, params, gasFraction);
  if (agnDark) {
    const mid = pop.bins[Math.floor(pop.bins.length / 2)].rMid;
    return {
      colors,
      alphas: temps.map(() => 1),
      smooth: true,
      contours: frost.contours,
      zoneLabels: [{ radius: mid, label: `${sci(temps[0], 3)} K everywhere<small>the AGN no longer heats the gas</small>` }, ...frost.zoneLabels],
      zones: [],
    };
  }
  const contours = AMBIENT_CONTOURS.flatMap(({ temperature, label }) => {
    const r = radiusWhereTemperature(temperature, params);
    return r === null ? [] : [{ radius: r, label }];
  });
  return { colors, alphas: temps.map(() => 1), smooth: true, contours: [...contours, ...frost.contours], zoneLabels: frost.zoneLabels, zones: [] };
}

export function fatePaint(pop: PopulationSummary, p: ModelParams): OverlayPaint {
  const keys = pop.bins.map(
    (b): ObjectFate =>
      fateOf({
        mass: b.state.planetesimalMass,
        doublingTime: b.state.accretion.doublingTime,
        limits: growthLimits(b.state),
        regime: b.state.accretion.regime,
        agnLifetimeYr: p.agnLifetimeYr,
      }).fate,
  );
  return zonesOf(pop, keys, (k) => FATE_COLOR[k], () => 1, (k) => FATE_LABEL[k]);
}

export function stagePaint(pop: PopulationSummary, p: ModelParams, ageYr: number): OverlayPaint {
  const keys = pop.bins.map((b) => epochState(ringTrack(b.state, p), ageYr).stage);
  return zonesOf(
    pop,
    keys,
    (k) => STAGE_COLOR[k],
    (k) => (k === "never" ? 0.35 : k === "dust" ? 0.5 : 1),
    (k) => STAGE_LABEL[k],
  );
}

export function nichePaint(pop: PopulationSummary, p: ModelParams, ageYr: number): OverlayPaint {
  const sky = skyAt(p, ageYr);
  const keys = pop.bins.map((b) => nicheAt(b, p, sky));
  return zonesOf(
    pop,
    keys,
    (k) => NICHE_COLOR[k],
    (k) => (k === "never" ? 0.25 : k === "dustOnly" ? 0.45 : 1),
    (k) => NICHE_LABEL[k],
  );
}

function frontContour(p: ModelParams, temperature: number, label: string): OverlayPaint["contours"] {
  const r = radiusWhereTemperature(temperature, p);
  return r === null ? [] : [{ radius: r, label }];
}

export function resourcePaint(pop: PopulationSummary, p: ModelParams, ageYr: number, group: ElementGroup): OverlayPaint {
  const sky = skyAt(p, ageYr);
  const stocks = pop.bins.map((b) => resourceAt(b, p, sky, group));
  const solid = stocks.map((s) => s.inBodies + s.onGrains);
  const richest = solid.reduce((best, v, i) => (v > solid[best] ? i : best), 0);
  const top = solid[richest];
  const floor = top / 10 ** RESOURCE_DECADES;
  const colors = solid.map((v) => rampColor(RESOURCE_STOPS, v > 0 ? (Math.log10(v) - Math.log10(floor)) / RESOURCE_DECADES : 0));
  const alphas = solid.map((v) => (v > floor ? 1 : 0));
  const contours =
    group === "carbon" && sky.shining
      ? frontContour(p, ORGANICS_FRONT_K, "Organics condense<small>carbon in solids outside</small>")
      : group === "sulfur" && sky.shining
        ? frontContour(p, SULFIDE_FRONT_K, "Iron sulfide forms<small>sulfur in solids outside</small>")
        : [];
  const frost = group === "water" ? frostMarks(pop, sky.shining ? p : { ...p, irradiationLuminosity: 0 }, sky.gasFraction) : { contours: [], zoneLabels: [] };
  const name = GROUP_LABEL[group];
  const inGas = stocks.reduce((a, s) => a + s.inGas, 0);
  const zoneLabels =
    top > 0
      ? [{ radius: pop.bins[richest].rMid, label: `${name} richest at ${sci(pop.bins[richest].rMid / PC, 2)} pc<small>${sci(top, 2)} kg/m², ${Math.round((100 * stocks[richest].inBodies) / top)}% inside bodies</small>` }]
      : [{ radius: pop.bins[Math.floor(pop.bins.length / 2)].rMid, label: inGas > 0 ? `${name} only in the gas` : `${name} gone with the gas` }];
  return { colors, alphas, smooth: true, contours: [...contours, ...frost.contours], zoneLabels: [...zoneLabels, ...frost.zoneLabels], zones: [] };
}

let lastSpread: { pop: PopulationSummary; p: ModelParams; seed: Seed; tech: SpreadTech; arrival: number[] } | null = null;

function spreadFor(pop: PopulationSummary, p: ModelParams, seed: Seed, tech: SpreadTech): number[] {
  const hit = lastSpread;
  if (hit && hit.pop === pop && hit.p === p && hit.seed === seed && hit.tech === tech) return hit.arrival;
  const arrival = settlementTimes(pop, p, seed, tech);
  lastSpread = { pop, p, seed, tech, arrival };
  return arrival;
}

export function settledPaint(pop: PopulationSummary, p: ModelParams, seed: Seed | null, tech: SpreadTech, ageYr: number): OverlayPaint {
  const blank = pop.bins.map(() => FAINT);
  if (!seed) {
    return { colors: blank, alphas: pop.bins.map(() => 0), smooth: false, contours: [], zoneLabels: [{ radius: pop.bins[Math.floor(pop.bins.length / 2)].rMid, label: "Seed a culture from Explore" }], zones: [] };
  }
  const arrival = spreadFor(pop, p, seed, tech);
  const reachable = arrival.filter((t) => Number.isFinite(t));
  if (reachable.length === 0) {
    return { colors: blank, alphas: pop.bins.map(() => 0), smooth: false, contours: [{ radius: seed.radius, label: "Founding world" }], zoneLabels: [{ radius: seed.radius, label: "No bodies form on its ring<small>the culture cannot spread</small>" }], zones: [] };
  }
  const span = Math.log10(Math.max(...reachable) - seed.yr + 1);
  const settled = arrival.map((t) => t <= ageYr);
  const colors = arrival.map((t, i) => (settled[i] ? rampColor(SETTLED_STOPS, span > 0 ? Math.log10(t - seed.yr + 1) / span : 0) : FAINT));
  const alphas = arrival.map((t, i) => (settled[i] ? 1 : Number.isFinite(t) ? 0.25 : 0));
  const contours: OverlayPaint["contours"] = [{ radius: seed.radius, label: "Founding world" }];
  const reach = lightReach(seed, ageYr);
  const rMin = pop.bins[0].rInner;
  const rMax = pop.bins[pop.bins.length - 1].rOuter;
  for (const r of [seed.radius - reach, seed.radius + reach]) if (r > rMin && r < rMax) contours.push({ radius: r, label: "Its first light has reached" });
  const settledBins = pop.bins.filter((_, i) => settled[i]);
  const how = tech === "orbital" ? "by orbital hops" : "by 1 g torchships";
  const zoneLabels =
    settledBins.length > 0
      ? [{ radius: Math.sqrt(settledBins[0].rInner * settledBins[settledBins.length - 1].rOuter), label: `Settled ${sci(settledBins[0].rInner / PC, 2)}–${sci(settledBins[settledBins.length - 1].rOuter / PC, 2)} pc<small>${how}</small>` }]
      : [];
  return { colors, alphas, smooth: false, contours, zoneLabels, zones: [] };
}

const vertexShader = `
  varying vec3 vPos;
  void main() {
    vPos = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = `
  uniform sampler2D uZones;
  uniform float uInner;
  uniform float uOuter;
  uniform float uOpacity;
  varying vec3 vPos;
  void main() {
    float u = (length(vPos.xy) - uInner) / (uOuter - uInner);
    if (u < 0.0 || u > 1.0) discard;
    vec4 zone = texture2D(uZones, vec2(u, 0.5));
    gl_FragColor = vec4(zone.rgb, zone.a * uOpacity);
  }
`;

function circle(radius: number, color: Color, opacity: number): LineLoop {
  const pts: number[] = [];
  const n = 256;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push(radius * Math.cos(a), 0, -radius * Math.sin(a));
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pts, 3));
  return new LineLoop(g, new LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));
}

function fanOut(): (radius: number) => Vector3 {
  let angle = OVERLAY_LABEL_FIRST_ANGLE;
  return (radius) => {
    const at = new Vector3(radius * Math.cos(angle), 0, -radius * Math.sin(angle));
    angle += LABEL_ARC_UNITS / radius;
    return at;
  };
}

export class MidplaneOverlay {
  readonly group = new Group();
  labels: LabelSpec[] = [];
  private data: Uint8Array;
  private texture: DataTexture;
  private material: ShaderMaterial;
  private mesh: Mesh;
  private contours = new Group();
  private opacity = 1;

  constructor(
    rMin: number,
    rMax: number,
    private rFloor: number,
    binCount: number,
  ) {
    this.data = new Uint8Array(binCount * 4);
    this.texture = new DataTexture(this.data, binCount, 1, RGBAFormat);
    const inner = torusRadius(rMin, rFloor);
    const outer = torusRadius(rMax, rFloor);
    this.material = new ShaderMaterial({
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      uniforms: { uZones: { value: this.texture }, uInner: { value: inner }, uOuter: { value: outer }, uOpacity: { value: OVERLAY_OPACITY } },
    });
    this.mesh = new Mesh(new RingGeometry(inner, outer, 256, 1), this.material);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.renderOrder = -1;
    this.contours.renderOrder = -1;
    this.group.add(this.mesh, this.contours);
    this.group.visible = false;
  }

  paint(paint: OverlayPaint): void {
    paint.colors.forEach((c, i) => {
      this.data[i * 4] = Math.round(c.r * 255);
      this.data[i * 4 + 1] = Math.round(c.g * 255);
      this.data[i * 4 + 2] = Math.round(c.b * 255);
      this.data[i * 4 + 3] = Math.round(paint.alphas[i] * 255);
    });
    const filter = paint.smooth ? LinearFilter : NearestFilter;
    this.texture.magFilter = filter;
    this.texture.minFilter = filter;
    this.texture.needsUpdate = true;
    this.clearContours();
    const labels: LabelSpec[] = [];
    const anchorAt = fanOut();
    paint.contours.forEach((c, i) => {
      const R = torusRadius(c.radius, this.rFloor);
      this.contours.add(circle(R, new Color("#efe6d6"), c.label ? 0.55 : 0.3));
      if (c.label) labels.push({ key: `overlay-contour-${i}`, html: c.label, className: "overlay", position: anchorAt(R) });
    });
    paint.zoneLabels.forEach((z, i) => {
      labels.push({ key: `overlay-zone-${i}`, html: z.label, className: "overlay zone", position: anchorAt(torusRadius(z.radius, this.rFloor)) });
    });
    this.labels = labels;
    this.applyOpacity();
  }

  show(visible: boolean): void {
    this.group.visible = visible;
  }

  get showsLabels(): boolean {
    return this.group.visible && this.opacity > 0;
  }

  setOpacity(fraction: number): void {
    if (fraction === this.opacity) return;
    this.opacity = fraction;
    this.applyOpacity();
  }

  private applyOpacity(): void {
    this.material.uniforms.uOpacity.value = OVERLAY_OPACITY * this.opacity;
    for (const child of this.contours.children) {
      const m = (child as LineLoop).material as LineBasicMaterial;
      m.visible = this.opacity > 0;
    }
  }

  private clearContours(): void {
    for (const child of [...this.contours.children]) {
      const line = child as LineLoop;
      line.geometry.dispose();
      (line.material as LineBasicMaterial).dispose();
      this.contours.remove(line);
    }
  }

  dispose(): void {
    this.clearContours();
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.texture.dispose();
  }
}
