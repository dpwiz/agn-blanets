import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  NormalBlending,
  Points,
  ShaderMaterial,
} from "three";
import { IMPOSTOR_STRIDE } from "../physics/bodies";
import { M_JUP, M_SUN, PC, YR } from "../physics/constants";
import {
  growthTrack,
  LOG_HYDROGEN_BURNING_MJUP,
  SHORTEST_STELLAR_LIFETIME_YR,
  STELLAR_LIFETIME_SLOPE,
  SUN_LIFETIME_YR,
} from "../physics/era";
import { fateOf } from "../physics/fate";
import { meanMotion } from "../physics/kepler";
import { gaussian, mulberry32 } from "../physics/math";
import type { ModelParams } from "../physics/params";
import type { PopulationSummary } from "../physics/population";
import type { ColorBy } from "../state";
import { FATE_COLOR, MASS_STOPS, REGIME_COLOR, REMNANT_COLOR, temperatureColor } from "./palette";
import { torusRadius } from "./viewmap";

const vertexShader = `
  attribute float aRadius;
  attribute float aPhase;
  attribute float aMeanMotion;
  attribute float aHeight;
  attribute float aSize;
  attribute vec3 aColor;
  uniform float uTime;
  uniform float uZExag;
  uniform float uPixelRatio;
  uniform float uSizeScale;
  varying vec3 vColor;
  void main() {
    float angle = aPhase + aMeanMotion * uTime;
    vec3 p = vec3(aRadius * cos(angle), aHeight * aRadius * uZExag, -aRadius * sin(angle));
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = clamp(aSize * uSizeScale * uPixelRatio * (60.0 / -mv.z), 1.0, 96.0);
    vColor = aColor;
  }
`;

const fragmentShader = `
  uniform float uOpacity;
  uniform float uSoftness;
  varying vec3 vColor;
  void main() {
    vec2 d = gl_PointCoord - 0.5;
    float r = length(d) * 2.0;
    float a = smoothstep(1.0, 1.0 - uSoftness, r);
    if (a <= 0.01) discard;
    gl_FragColor = vec4(vColor, a * uOpacity);
  }
`;

const NEVER_BORN_YR = 1e30;

const planetVertexShader = `
  attribute float aRadius;
  attribute float aPhase;
  attribute float aMeanMotion;
  attribute float aHeight;
  attribute float aLogM0;
  attribute float aBorn;
  attribute float aRate;
  attribute float aLogCeil;
  attribute vec3 aColor;
  uniform float uTime;
  uniform float uZExag;
  uniform float uPixelRatio;
  uniform float uEraOn;
  uniform float uAge;
  uniform float uGrowthEnds;
  uniform float uMassColor;
  uniform float uMassAt[${MASS_STOPS.length}];
  uniform vec3 uMassStops[${MASS_STOPS.length}];
  uniform float uLogHydrogen;
  uniform float uLogSunInMjup;
  uniform float uLogSunLifetime;
  uniform float uLifetimeSlope;
  uniform float uShortestLifetime;
  uniform vec3 uRemnantColor;
  varying vec3 vColor;
  varying float vAlpha;

  vec3 massRamp(float lm) {
    if (lm <= uMassAt[0]) return uMassStops[0];
    for (int i = 0; i < ${MASS_STOPS.length - 1}; i++) {
      if (lm <= uMassAt[i + 1]) return mix(uMassStops[i], uMassStops[i + 1], (lm - uMassAt[i]) / (uMassAt[i + 1] - uMassAt[i]));
    }
    return uMassStops[${MASS_STOPS.length - 1}];
  }

  void main() {
    float lm = aLogM0;
    float alpha = 1.0;
    float remnant = 0.0;
    if (uEraOn > 0.5) {
      alpha = uAge < aBorn ? 0.0 : 1.0;
      float grown = max(min(uAge, uGrowthEnds) - aBorn, 0.0);
      lm = min(aLogM0 + grown * aRate, aLogCeil);
      float threshold = aLogM0 < uLogHydrogen ? uLogHydrogen : aLogM0 + 0.4342945;
      if (lm >= threshold && grown > 0.0) {
        float ignition = aBorn + (threshold - aLogM0) / max(aRate, 1e-30);
        float lifetime = max(pow(10.0, uLogSunLifetime - uLifetimeSlope * (lm - uLogSunInMjup)), uShortestLifetime);
        remnant = uAge - ignition >= lifetime ? 1.0 : 0.0;
      }
    }
    float angle = aPhase + aMeanMotion * uTime;
    vec3 p = vec3(aRadius * cos(angle), aHeight * aRadius * uZExag, -aRadius * sin(angle));
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float size = remnant > 0.5 ? 0.8 : 0.9 + 0.22 * max(lm + 1.0, 0.0);
    gl_PointSize = alpha > 0.5 ? clamp(size * uPixelRatio * (60.0 / -mv.z), 1.0, 96.0) : 0.0;
    vColor = remnant > 0.5 ? uRemnantColor : (uMassColor > 0.5 ? massRamp(lm) : aColor);
    vAlpha = alpha;
  }
`;

const planetFragmentShader = `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    if (vAlpha < 0.5) discard;
    vec2 d = gl_PointCoord - 0.5;
    float r = length(d) * 2.0;
    float a = smoothstep(1.0, 0.4, r);
    if (a <= 0.01) discard;
    gl_FragColor = vec4(vColor, a * 0.85);
  }
`;

function planetMaterial(massColoring: boolean) {
  return new ShaderMaterial({
    vertexShader: planetVertexShader,
    fragmentShader: planetFragmentShader,
    transparent: true,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      uZExag: { value: 1 },
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
      uEraOn: { value: 0 },
      uAge: { value: 0 },
      uGrowthEnds: { value: 0 },
      uMassColor: { value: massColoring ? 1 : 0 },
      uMassAt: { value: MASS_STOPS.map(([at]) => at) },
      uMassStops: { value: MASS_STOPS.map(([, c]) => c) },
      uLogHydrogen: { value: LOG_HYDROGEN_BURNING_MJUP },
      uLogSunInMjup: { value: Math.log10(M_SUN / M_JUP) },
      uLogSunLifetime: { value: Math.log10(SUN_LIFETIME_YR) },
      uLifetimeSlope: { value: STELLAR_LIFETIME_SLOPE },
      uShortestLifetime: { value: SHORTEST_STELLAR_LIFETIME_YR },
      uRemnantColor: { value: REMNANT_COLOR },
    },
  });
}

function material(opacity: number, softness: number, sizeScale: number, additive: boolean) {
  return new ShaderMaterial({
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    blending: additive ? AdditiveBlending : NormalBlending,
    uniforms: {
      uTime: { value: 0 },
      uZExag: { value: 1 },
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
      uSizeScale: { value: sizeScale },
      uOpacity: { value: opacity },
      uSoftness: { value: softness },
    },
  });
}

export interface CloudLayer {
  points: Points;
  setTime(years: number): void;
  setZExaggeration(z: number): void;
  setEpoch(on: boolean, ageYr: number, growthEndsYr: number): void;
  setFade(fraction: number): void;
  dispose(): void;
}

function wrap(geometry: BufferGeometry, mat: ShaderMaterial): CloudLayer {
  const points = new Points(geometry, mat);
  points.frustumCulled = false;
  const baseOpacity = mat.uniforms.uOpacity?.value as number | undefined;
  return {
    points,
    setTime(years) {
      mat.uniforms.uTime.value = years;
    },
    setZExaggeration(z) {
      mat.uniforms.uZExag.value = z;
    },
    setEpoch(on, ageYr, growthEndsYr) {
      if (!mat.uniforms.uEraOn) return;
      mat.uniforms.uEraOn.value = on ? 1 : 0;
      mat.uniforms.uAge.value = ageYr;
      mat.uniforms.uGrowthEnds.value = growthEndsYr;
    },
    setFade(fraction) {
      if (baseOpacity === undefined) return;
      mat.uniforms.uOpacity.value = baseOpacity * fraction;
      points.visible = fraction > 0;
    },
    dispose() {
      geometry.dispose();
      mat.dispose();
    },
  };
}

function binIndexer(pop: PopulationSummary) {
  const r0 = Math.log(pop.bins[0].rInner);
  const r1 = Math.log(pop.bins[pop.bins.length - 1].rOuter);
  const n = pop.bins.length;
  return (r: number) => Math.min(Math.max(Math.floor(((Math.log(r) - r0) / (r1 - r0)) * n), 0), n - 1);
}

export function buildPlanetCloud(
  pop: PopulationSummary,
  impostors: Float32Array,
  mSmbh: number,
  rFloor: number,
  colorBy: ColorBy,
  p: ModelParams,
): CloudLayer {
  const count = impostors.length / IMPOSTOR_STRIDE;
  const radius = new Float32Array(count);
  const phase = new Float32Array(count);
  const motion = new Float32Array(count);
  const height = new Float32Array(count);
  const logM0 = new Float32Array(count);
  const born = new Float32Array(count);
  const rate = new Float32Array(count);
  const logCeil = new Float32Array(count);
  const color = new Float32Array(count * 3);
  const binOf = binIndexer(pop);
  const c = new Color();
  for (let i = 0; i < count; i++) {
    const o = i * IMPOSTOR_STRIDE;
    const r = impostors[o];
    const m = impostors[o + 3];
    radius[i] = torusRadius(r, rFloor);
    phase[i] = impostors[o + 1];
    motion[i] = meanMotion(r, mSmbh) * YR;
    height[i] = impostors[o + 2] / r;
    logM0[i] = Math.log10(m / M_JUP);
    const state = pop.bins[binOf(r)].state;
    const track = growthTrack(state, m, state.accretion.doublingTime, p);
    born[i] = Number.isFinite(track.bornYr) ? track.bornYr : NEVER_BORN_YR;
    rate[i] = 1 / (track.efoldingTimeYr * Math.LN10);
    logCeil[i] = Math.log10(track.ceilingMass / M_JUP);
    if (colorBy === "regime") c.copy(REGIME_COLOR[state.accretion.regime]);
    else if (colorBy === "fate") {
      const f = fateOf({
        mass: m,
        doublingTime: state.accretion.doublingTime,
        thermalMass: state.thermalMass,
        regime: state.accretion.regime,
        agnLifetimeYr: p.agnLifetimeYr,
      });
      c.copy(FATE_COLOR[f.fate]);
    }
    color.set([c.r, c.g, c.b], i * 3);
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(count * 3), 3));
  g.setAttribute("aRadius", new BufferAttribute(radius, 1));
  g.setAttribute("aPhase", new BufferAttribute(phase, 1));
  g.setAttribute("aMeanMotion", new BufferAttribute(motion, 1));
  g.setAttribute("aHeight", new BufferAttribute(height, 1));
  g.setAttribute("aLogM0", new BufferAttribute(logM0, 1));
  g.setAttribute("aBorn", new BufferAttribute(born, 1));
  g.setAttribute("aRate", new BufferAttribute(rate, 1));
  g.setAttribute("aLogCeil", new BufferAttribute(logCeil, 1));
  g.setAttribute("aColor", new BufferAttribute(color, 3));
  return wrap(g, planetMaterial(colorBy === "mass"));
}

export function buildGasHaze(pop: PopulationSummary, mSmbh: number, rFloor: number, count = 26_000): CloudLayer {
  const rand = mulberry32(99);
  const radius = new Float32Array(count);
  const phase = new Float32Array(count);
  const motion = new Float32Array(count);
  const height = new Float32Array(count);
  const size = new Float32Array(count);
  const color = new Float32Array(count * 3);
  const rMin = pop.bins[0].rInner;
  const rMax = pop.bins[pop.bins.length - 1].rOuter;
  const binOf = binIndexer(pop);
  const c = new Color();
  for (let i = 0; i < count; i++) {
    const r = rMin * (rMax / rMin) ** rand();
    const state = pop.bins[binOf(r)].state;
    radius[i] = torusRadius(r, rFloor);
    phase[i] = rand() * Math.PI * 2;
    motion[i] = meanMotion(r, mSmbh) * YR;
    height[i] = gaussian(rand) * state.disk.h;
    size[i] = 9 + 9 * rand();
    temperatureColor(state.disk.temperature, c);
    const fade = 0.55 + 0.45 * Math.exp(-Math.abs(height[i]) / (2 * state.disk.h));
    color.set([c.r * fade, c.g * fade, c.b * fade], i * 3);
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(count * 3), 3));
  g.setAttribute("aRadius", new BufferAttribute(radius, 1));
  g.setAttribute("aPhase", new BufferAttribute(phase, 1));
  g.setAttribute("aMeanMotion", new BufferAttribute(motion, 1));
  g.setAttribute("aHeight", new BufferAttribute(height, 1));
  g.setAttribute("aSize", new BufferAttribute(size, 1));
  g.setAttribute("aColor", new BufferAttribute(color, 3));
  return wrap(g, material(0.05, 1, 4.5, true));
}

export const PC_FLOOR_FRACTION = 0.1;

export function floorRadius(rMinPc: number): number {
  return rMinPc * PC * PC_FLOOR_FRACTION;
}
