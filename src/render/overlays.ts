import {
  BufferAttribute,
  BufferGeometry,
  Color,
  Group,
  Line,
  LineBasicMaterial,
  LineDashedMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  SphereGeometry,
  Vector3,
} from "three";
import type { Vec3 } from "../physics/vec";
import type { ViewMap } from "./viewmap";

export class PathLine {
  readonly line: Line;
  private geometry = new BufferGeometry();
  private capacity = 0;
  private points: Vec3[] = [];
  private times: number[] | null = null;

  constructor(color: Color, opacity = 1, dashed = false) {
    const material = dashed
      ? new LineDashedMaterial({ color, transparent: true, opacity, dashSize: 0.7, gapSize: 0.45, depthWrite: false })
      : new LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
    this.line = new Line(this.geometry, material);
    this.line.frustumCulled = false;
    this.line.visible = false;
  }

  setPoints(points: Vec3[], times: number[] | null = null): void {
    this.points = points;
    this.times = times;
    if (points.length > this.capacity) {
      this.capacity = Math.max(points.length, 16);
      this.geometry.setAttribute("position", new BufferAttribute(new Float32Array(this.capacity * 3), 3));
    }
    this.geometry.setDrawRange(0, points.length);
    this.line.visible = points.length > 1;
  }

  update(map: ViewMap): void {
    if (!this.line.visible) return;
    const attr = this.geometry.getAttribute("position") as BufferAttribute;
    const v = new Vector3();
    const times = this.times;
    this.points.forEach((p, i) => {
      if (times) map.toSceneAt(p, times[i], v);
      else map.toScene(p, v);
      attr.setXYZ(i, v.x, v.y, v.z);
    });
    attr.needsUpdate = true;
    if (this.line.material instanceof LineDashedMaterial) this.line.computeLineDistances();
  }

  hide(): void {
    this.points = [];
    this.line.visible = false;
  }

  setColor(color: Color): void {
    (this.line.material as LineBasicMaterial | LineDashedMaterial).color.copy(color);
  }
}

export class SegmentCloud {
  readonly lines: LineSegments;
  private geometry = new BufferGeometry();
  private pairs: [number, number][] = [];
  private colors: Float32Array = new Float32Array(0);

  constructor() {
    const material = new LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.55, depthWrite: false });
    this.lines = new LineSegments(this.geometry, material);
    this.lines.frustumCulled = false;
    this.lines.visible = false;
  }

  setPairs(pairs: [number, number][], colors: Color[]): void {
    this.pairs = pairs;
    (this.lines.material as LineBasicMaterial).opacity = Math.min(Math.max(400 / Math.max(pairs.length, 1), 0.06), 0.55);
    const n = pairs.length;
    this.geometry.setAttribute("position", new BufferAttribute(new Float32Array(n * 6), 3));
    this.colors = new Float32Array(n * 6);
    colors.forEach((c, i) => {
      this.colors.set([c.r, c.g, c.b, c.r, c.g, c.b], i * 6);
    });
    this.geometry.setAttribute("color", new BufferAttribute(this.colors, 3));
    this.lines.visible = n > 0;
  }

  update(scenePositions: Vector3[]): void {
    if (!this.lines.visible) return;
    const attr = this.geometry.getAttribute("position") as BufferAttribute;
    this.pairs.forEach(([a, b], i) => {
      const pa = scenePositions[a];
      const pb = scenePositions[b];
      if (!pa || !pb) return;
      attr.setXYZ(i * 2, pa.x, pa.y, pa.z);
      attr.setXYZ(i * 2 + 1, pb.x, pb.y, pb.z);
    });
    attr.needsUpdate = true;
  }

  hide(): void {
    this.pairs = [];
    this.lines.visible = false;
  }
}

export function createMarker(color: Color, radius: number): Mesh {
  const m = new Mesh(new SphereGeometry(radius, 16, 12), new MeshBasicMaterial({ color }));
  m.visible = false;
  return m;
}

export function overlayGroup(...objects: (Line | LineSegments | Mesh)[]): Group {
  const g = new Group();
  for (const o of objects) g.add(o);
  return g;
}
