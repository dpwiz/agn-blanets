import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  GridHelper,
  Group,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Points,
  ShaderMaterial,
} from "three";
import { gaussian, mulberry32 } from "../physics/math";
import type { RadialState } from "../physics/model";
import { PALETTE, temperatureColor } from "./palette";
import { LOCAL_PATCH_UNITS } from "./viewmap";

export interface LocalDecor {
  group: Group;
  setZExaggeration(z: number): void;
  dispose(): void;
}

const hazeMaterial = () =>
  new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: { uZExag: { value: 1 }, uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) } },
    vertexShader: `
      attribute vec3 aColor;
      uniform float uZExag;
      uniform float uPixelRatio;
      varying vec3 vColor;
      void main() {
        vec3 p = vec3(position.x, position.y * uZExag, position.z);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = clamp(260.0 * uPixelRatio / -mv.z, 2.0, 90.0);
        vColor = aColor;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      void main() {
        float r = length(gl_PointCoord - 0.5) * 2.0;
        float a = smoothstep(1.0, 0.0, r) * 0.06;
        gl_FragColor = vec4(vColor, a);
      }
    `,
  });

export function buildLocalDecor(local: RadialState, patchRadius: number): LocalDecor {
  const group = new Group();
  const k = LOCAL_PATCH_UNITS / patchRadius;
  const span = LOCAL_PATCH_UNITS * 2.6;
  const grid = new GridHelper(span, 26, PALETTE.haze, PALETTE.haze);
  const gridMat = grid.material as LineBasicMaterial;
  gridMat.transparent = true;
  gridMat.opacity = 0.1;
  group.add(grid);

  const dustHalf = local.dust.dustScaleHeight * k;
  const slabs: Mesh[] = [];
  for (const sign of [-1, 1]) {
    const slab = new Mesh(
      new PlaneGeometry(span, span),
      new MeshBasicMaterial({ color: PALETTE.ember, transparent: true, opacity: 0.045, side: DoubleSide, depthWrite: false }),
    );
    slab.rotation.x = -Math.PI / 2;
    slab.userData.height = sign * dustHalf;
    slabs.push(slab);
    group.add(slab);
  }

  const rand = mulberry32(5);
  const n = 5000;
  const pos = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  const gasHalf = local.disk.H * k;
  const c = temperatureColor(local.disk.temperature);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = (rand() - 0.5) * span;
    pos[i * 3 + 1] = gaussian(rand) * gasHalf;
    pos[i * 3 + 2] = (rand() - 0.5) * span;
    col.set([c.r, c.g, c.b], i * 3);
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(pos, 3));
  g.setAttribute("aColor", new BufferAttribute(col, 3));
  const mat = hazeMaterial();
  const haze = new Points(g, mat);
  haze.frustumCulled = false;
  group.add(haze);

  const setZ = (z: number) => {
    mat.uniforms.uZExag.value = z;
    for (const s of slabs) s.position.y = (s.userData.height as number) * z;
  };
  setZ(1);
  return {
    group,
    setZExaggeration: setZ,
    dispose() {
      group.traverse((o) => {
        const m = o as Mesh;
        m.geometry?.dispose();
        const mt = m.material as { dispose?: () => void } | undefined;
        mt?.dispose?.();
      });
    },
  };
}
