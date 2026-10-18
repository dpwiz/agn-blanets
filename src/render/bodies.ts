import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, Points, ShaderMaterial, Vector3 } from "three";
import type { Blanet } from "../physics/bodies";
import { M_JUP } from "../physics/constants";
import { orbitalPosition } from "../physics/kepler";
import { massColor } from "./palette";
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

export interface BodyLayer {
  points: Points;
  bodies: Blanet[];
  screen: Float32Array;
  scenePositions: Vector3[];
  setBodies(bodies: Blanet[]): void;
  update(map: ViewMap, tSeconds: number, mSmbh: number, highlight: Map<number, Color>): void;
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
      layer.screen = new Float32Array(n * 2);
    },
    update(map, tSeconds, mSmbh, highlight) {
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
        if (h) c.copy(h);
        else massColor(Math.log10(b.mass / M_JUP), c);
        color.setXYZ(i, c.r, c.g, c.b);
        size.setX(i, (baseSize + 2.2 * Math.max(Math.log10(b.mass / M_JUP), 0)) * (h ? 2.1 : 1));
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
