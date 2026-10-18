import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, Points, ShaderMaterial, Vector3 } from "three";
import type { Blanet } from "../physics/bodies";
import { M_JUP } from "../physics/constants";
import { orbitalPosition } from "../physics/kepler";
import { massColor, REMNANT_COLOR } from "./palette";
import type { ViewMap } from "./viewmap";

const vertexShader = `
  attribute float aSize;
  attribute vec3 aColor;
  attribute float aRing;
  uniform float uPixelRatio;
  varying vec3 vColor;
  varying float vRing;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aSize * uPixelRatio;
    vColor = aColor;
    vRing = aRing;
  }
`;

const fragmentShader = `
  varying vec3 vColor;
  varying float vRing;
  void main() {
    vec2 d = gl_PointCoord - 0.5;
    float r = length(d) * 2.0;
    float core = smoothstep(0.42, 0.3, r);
    float glow = smoothstep(1.0, 0.3, r) * 0.35;
    float ring = vRing * smoothstep(0.06, 0.0, abs(r - 0.82));
    float a = max(max(core, glow), ring);
    if (a < 0.02) discard;
    vec3 c = mix(vColor, vec3(1.0), core * 0.25);
    gl_FragColor = vec4(c, a);
  }
`;

export interface BodyLook {
  mass: number;
  hidden: boolean;
  remnant: boolean;
}

export type LookUp = (b: Blanet) => BodyLook;

export const BIRTH_LOOK: LookUp = (b) => ({ mass: b.mass, hidden: false, remnant: false });

export interface BodyLayer {
  points: Points;
  bodies: Blanet[];
  hidden: Uint8Array;
  screen: Float32Array;
  scenePositions: Vector3[];
  setBodies(bodies: Blanet[]): void;
  update(map: ViewMap, tSeconds: number, mSmbh: number, highlight: Map<number, Color>, look?: LookUp): void;
}

export function createBodyLayer(baseSize: number): BodyLayer {
  const material = new ShaderMaterial({
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: { uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) } },
  });
  const geometry = new BufferGeometry();
  const points = new Points(geometry, material);
  points.frustumCulled = false;
  const layer: BodyLayer = {
    points,
    bodies: [],
    hidden: new Uint8Array(0),
    screen: new Float32Array(0),
    scenePositions: [],
    setBodies(bodies) {
      layer.bodies = bodies;
      const n = bodies.length;
      geometry.setAttribute("position", new BufferAttribute(new Float32Array(n * 3), 3));
      geometry.setAttribute("aSize", new BufferAttribute(new Float32Array(n), 1));
      geometry.setAttribute("aColor", new BufferAttribute(new Float32Array(n * 3), 3));
      geometry.setAttribute("aRing", new BufferAttribute(new Float32Array(n), 1));
      layer.scenePositions = bodies.map(() => new Vector3());
      layer.hidden = new Uint8Array(n);
      layer.screen = new Float32Array(n * 2);
    },
    update(map, tSeconds, mSmbh, highlight, look = BIRTH_LOOK) {
      const pos = geometry.getAttribute("position") as BufferAttribute;
      const size = geometry.getAttribute("aSize") as BufferAttribute;
      const color = geometry.getAttribute("aColor") as BufferAttribute;
      const ring = geometry.getAttribute("aRing") as BufferAttribute;
      if (!pos) return;
      const c = new Color();
      layer.bodies.forEach((b, i) => {
        const v = map.toScene(orbitalPosition(b.orbit, mSmbh, tSeconds), layer.scenePositions[i]);
        pos.setXYZ(i, v.x, v.y, v.z);
        const h = highlight.get(b.id);
        const seen = look(b);
        const logM = Math.log10(seen.mass / M_JUP);
        layer.hidden[i] = seen.hidden && !h ? 1 : 0;
        if (h) c.copy(h);
        else if (seen.remnant) c.copy(REMNANT_COLOR);
        else massColor(logM, c);
        color.setXYZ(i, c.r, c.g, c.b);
        const base = seen.remnant ? baseSize * 0.7 : baseSize + 2.2 * Math.max(logM, 0);
        size.setX(i, layer.hidden[i] ? 0 : base * (h ? 2.1 : 1));
        ring.setX(i, h ? 1 : 0);
      });
      pos.needsUpdate = true;
      size.needsUpdate = true;
      color.needsUpdate = true;
      ring.needsUpdate = true;
    },
  };
  return layer;
}

export function pickNearest(
  layer: BodyLayer,
  project: (p: Vector3) => { x: number; y: number; visible: boolean },
  x: number,
  y: number,
  radiusPx: number,
): Blanet | null {
  let best: Blanet | null = null;
  let bestD = radiusPx * radiusPx;
  layer.scenePositions.forEach((p, i) => {
    if (layer.hidden[i]) return;
    const s = project(p);
    if (!s.visible) return;
    const d = (s.x - x) ** 2 + (s.y - y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = layer.bodies[i];
    }
  });
  return best;
}
