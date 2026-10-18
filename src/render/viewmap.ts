import { Vector3 } from "three";
import { meanMotion } from "../physics/kepler";
import type { Vec3 } from "../physics/vec";

export const UNITS_PER_DECADE = 10;
export const FLOOR_RADIUS_UNITS = 4;
export const LOCAL_PATCH_UNITS = 12;

export interface ViewMap {
  kind: "torus" | "local";
  toScene(p: Vec3, out?: Vector3): Vector3;
  toSceneAt(p: Vec3, tSeconds: number, out?: Vector3): Vector3;
  radiusToScene(r: number): number;
}

export function torusRadius(r: number, rFloor: number): number {
  if (r <= rFloor) return (FLOOR_RADIUS_UNITS * r) / rFloor;
  return FLOOR_RADIUS_UNITS + UNITS_PER_DECADE * Math.log10(r / rFloor);
}

export function torusMap(rFloor: number, zExaggeration: number): ViewMap {
  const toScene = (p: Vec3, out = new Vector3()) => {
    const R = Math.hypot(p[0], p[1]);
    if (R === 0) return out.set(0, 0, 0);
    const Rs = torusRadius(R, rFloor);
    const k = Rs / R;
    return out.set(p[0] * k, p[2] * k * zExaggeration, -p[1] * k);
  };
  return {
    kind: "torus",
    radiusToScene: (r) => torusRadius(r, rFloor),
    toScene,
    toSceneAt: (p, _t, out) => toScene(p, out),
  };
}

export interface LocalFrame {
  radius: number;
  phase: number;
  patchRadius: number;
  mSmbh: number;
}

export function localAnchorAngle(frame: LocalFrame, tSeconds: number): number {
  return frame.phase + meanMotion(frame.radius, frame.mSmbh) * tSeconds;
}

function corotatingPoint(frame: LocalFrame, theta: number, zExaggeration: number, p: Vec3, out: Vector3): Vector3 {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  const k = LOCAL_PATCH_UNITS / frame.patchRadius;
  const dx = p[0] - frame.radius * c;
  const dy = p[1] - frame.radius * s;
  const radial = dx * c + dy * s;
  const prograde = -dx * s + dy * c;
  return out.set(prograde * k, p[2] * k * zExaggeration, -radial * k);
}

export function localMap(frame: LocalFrame, tSeconds: number, zExaggeration: number): ViewMap {
  const theta = localAnchorAngle(frame, tSeconds);
  const k = LOCAL_PATCH_UNITS / frame.patchRadius;
  return {
    kind: "local",
    radiusToScene: (r) => (r - frame.radius) * k,
    toScene: (p, out = new Vector3()) => corotatingPoint(frame, theta, zExaggeration, p, out),
    toSceneAt: (p, t, out = new Vector3()) => corotatingPoint(frame, localAnchorAngle(frame, t), zExaggeration, p, out),
  };
}
