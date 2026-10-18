import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineLoop,
  Mesh,
  MeshBasicMaterial,
  RingGeometry,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
} from "three";
import { PC } from "../physics/constants";
import { formsPlanetsAt } from "../physics/population";
import type { PopulationSummary } from "../physics/population";
import type { ModelParams } from "../physics/params";
import { PALETTE } from "./palette";
import { torusRadius } from "./viewmap";

export interface ScaleRing {
  radiusPc: number;
  anchor: Vector3;
}

export interface TorusDecor {
  group: Group;
  rings: ScaleRing[];
  dispose(): void;
}

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

const accretionDiskMaterial = () =>
  new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: AdditiveBlending,
    uniforms: { uInner: { value: 0.7 }, uOuter: { value: 4 } },
    vertexShader: `
      varying vec3 vPos;
      void main() {
        vPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uInner;
      uniform float uOuter;
      varying vec3 vPos;
      void main() {
        float r = length(vPos.xy);
        float u = clamp((r - uInner) / (uOuter - uInner), 0.0, 1.0);
        vec3 hot = vec3(0.92, 0.9, 1.0);
        vec3 warm = vec3(0.9, 0.54, 0.31);
        vec3 c = mix(hot, warm, pow(u, 0.35));
        float a = 0.55 * exp(-6.0 * u) * (1.0 - u);
        gl_FragColor = vec4(c, a);
      }
    `,
  });

export function buildTorusDecor(pop: PopulationSummary, p: ModelParams, rFloor: number): TorusDecor {
  const group = new Group();
  const innerDiskOuter = torusRadius(p.rMinPc * PC, rFloor);

  const hole = new Mesh(new SphereGeometry(0.55, 32, 16), new MeshBasicMaterial({ color: 0x000000 }));
  group.add(hole);
  const photonRing = new Mesh(
    new RingGeometry(0.58, 0.66, 64),
    new MeshBasicMaterial({ color: PALETTE.emberHot, transparent: true, opacity: 0.9, side: DoubleSide, blending: AdditiveBlending }),
  );
  photonRing.rotation.x = -Math.PI / 2 + 0.25;
  group.add(photonRing);
  const diskMat = accretionDiskMaterial();
  diskMat.uniforms.uOuter.value = innerDiskOuter;
  const disk = new Mesh(new RingGeometry(0.7, innerDiskOuter, 128, 1), diskMat);
  disk.rotation.x = -Math.PI / 2;
  group.add(disk);

  const rings: ScaleRing[] = [];
  for (let e = -2; e <= 3; e++) {
    const rp = 10 ** e;
    if (rp < p.rMinPc * 0.099 || rp > p.rMaxPc * 1.01) continue;
    const R = torusRadius(rp * PC, rFloor);
    group.add(circle(R, PALETTE.haze, rp >= p.rMinPc ? 0.28 : 0.14));
    rings.push({ radiusPc: rp, anchor: new Vector3(R * Math.cos(-0.5), 0, -R * Math.sin(-0.5)) });
  }

  const bands = formationBands(pop, p);
  for (const [a, b] of bands) {
    const ra = torusRadius(a, rFloor);
    const rb = torusRadius(b, rFloor);
    const band = new Mesh(
      new RingGeometry(ra, rb, 192, 1),
      new MeshBasicMaterial({ color: PALETTE.signal, transparent: true, opacity: 0.05, side: DoubleSide, depthWrite: false }),
    );
    band.rotation.x = -Math.PI / 2;
    group.add(band);
    group.add(circle(ra, PALETTE.signal, 0.35));
    group.add(circle(rb, PALETTE.signal, 0.35));
  }

  return {
    group,
    rings,
    dispose() {
      group.traverse((o) => {
        const m = o as Mesh;
        m.geometry?.dispose();
        const mat = m.material as { dispose?: () => void } | undefined;
        mat?.dispose?.();
      });
    },
  };
}

export function formationBands(pop: PopulationSummary, p: ModelParams): [number, number][] {
  const gated = { ...p, countingMode: "gated" as const };
  const out: [number, number][] = [];
  let start: number | null = null;
  for (const b of pop.bins) {
    const ok = formsPlanetsAt(b.state, gated);
    if (ok && start === null) start = b.rInner;
    if (!ok && start !== null) {
      out.push([start, b.rInner]);
      start = null;
    }
  }
  if (start !== null) out.push([start, pop.bins[pop.bins.length - 1].rOuter]);
  return out;
}
