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
import { M_JUP, PC, YR } from "../physics/constants";
import { fateOf } from "../physics/fate";
import { meanMotion } from "../physics/kepler";
import { gaussian, mulberry32 } from "../physics/math";
import type { PopulationSummary } from "../physics/population";
import type { ColorBy } from "../state";
import { FATE_COLOR, massColor, REGIME_COLOR, temperatureColor } from "./palette";
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
  dispose(): void;
}

function wrap(geometry: BufferGeometry, mat: ShaderMaterial): CloudLayer {
  const points = new Points(geometry, mat);
  points.frustumCulled = false;
  return {
    points,
    setTime(years) {
      mat.uniforms.uTime.value = years;
    },
    setZExaggeration(z) {
      mat.uniforms.uZExag.value = z;
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
  agnLifetimeYr: number,
): CloudLayer {
  const count = impostors.length / IMPOSTOR_STRIDE;
  const radius = new Float32Array(count);
  const phase = new Float32Array(count);
  const motion = new Float32Array(count);
  const height = new Float32Array(count);
  const size = new Float32Array(count);
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
    const logM = Math.log10(m / M_JUP);
    size[i] = 0.9 + 0.22 * Math.max(logM + 1, 0);
    const state = pop.bins[binOf(r)].state;
    if (colorBy === "mass") massColor(logM, c);
    else if (colorBy === "regime") c.copy(REGIME_COLOR[state.accretion.regime]);
    else {
      const f = fateOf({
        mass: m,
        doublingTime: state.accretion.doublingTime,
        thermalMass: state.thermalMass,
        regime: state.accretion.regime,
        agnLifetimeYr,
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
  g.setAttribute("aSize", new BufferAttribute(size, 1));
  g.setAttribute("aColor", new BufferAttribute(color, 3));
  return wrap(g, material(0.85, 0.6, 1, false));
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
