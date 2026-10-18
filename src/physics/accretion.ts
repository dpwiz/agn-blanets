import { G, M_SUN } from "./constants";
import type { DiskState } from "./disk";
import { dustScaleHeight } from "./dust";
import { besselI0Scaled, besselI1Scaled, bisectLog, logspace } from "./math";
import type { ModelParams } from "./params";

export type PebbleRegime = "hill" | "bondi" | "geometric";
export type AccretionGeometry = "3D" | "2D";

export interface AccretionContext {
  disk: DiskState;
  eta: number;
  stokes: number;
  p: ModelParams;
}

export interface AccretionState {
  mass: number;
  rHill: number;
  rBondiDust: number;
  rBondiGas: number;
  rGeo: number;
  transitionMass: number;
  hillBondiMass: number;
  bondiGeometricMass: number;
  regime: PebbleRegime;
  rAcc: number;
  xi: number;
  geometry: AccretionGeometry;
  mdotDust: number;
  mdotGas: number;
  doublingTime: number;
}

export const ISOLATION_GAP_PARAMETER = 75 / 17;

export function hillRadius(mass: number, disk: DiskState): number {
  return disk.r * Math.cbrt(mass / (3 * disk.mSmbh));
}

export function headwind(ctx: AccretionContext): number {
  return ctx.eta * ctx.disk.vK;
}

export function bondiRadiusDust(mass: number, ctx: AccretionContext): number {
  const dv = headwind(ctx);
  return (2 * G * mass) / (dv * dv);
}

export function bondiRadiusGas(mass: number, disk: DiskState): number {
  return (2 * G * mass) / (disk.cs * disk.cs);
}

export function geometricRadius(mass: number, p: ModelParams): number {
  return Math.cbrt((3 * mass) / (4 * Math.PI * p.grainDensity));
}

export function transitionMass(ctx: AccretionContext): number {
  return ctx.eta ** 3 * ctx.disk.mSmbh;
}

export function hillBondiMass(ctx: AccretionContext): number {
  return transitionMass(ctx) / (8 * ctx.stokes);
}

export function bondiGeometricMass(ctx: AccretionContext): number {
  return (transitionMass(ctx) / 8) * ctx.stokes;
}

export function pebbleRegime(mass: number, ctx: AccretionContext): PebbleRegime {
  if (mass >= hillBondiMass(ctx)) return "hill";
  if (mass >= bondiGeometricMass(ctx)) return "bondi";
  return "geometric";
}

function bondiAccretionRadius(mass: number, ctx: AccretionContext): number {
  const ts = ctx.stokes / ctx.disk.omega;
  const rB = bondiRadiusDust(mass, ctx);
  const tB = rB / headwind(ctx);
  return Math.sqrt((4 * ts) / tB) * rB;
}

export function accretionRadius(mass: number, ctx: AccretionContext): number {
  const { disk, stokes, p } = ctx;
  if (p.pebbleAccretionModel === "paperFig5") return bondiAccretionRadius(mass, ctx);
  const regime = pebbleRegime(mass, ctx);
  if (regime === "geometric") return geometricRadius(mass, p);
  const rHill = hillRadius(mass, disk);
  const rHat = regime === "hill" ? Math.cbrt(stokes / 0.1) * rHill : bondiAccretionRadius(mass, ctx);
  const ts = stokes / disk.omega;
  const tp = (G * mass) / (headwind(ctx) + disk.omega * rHill) ** 3;
  return rHat * Math.exp(-p.accretionCutoffC1 * (ts / tp) ** p.accretionCutoffC2);
}

export function midplaneDustDensity(ctx: AccretionContext): number {
  const hd = dustScaleHeight(ctx.stokes, ctx.disk, ctx.p);
  return (ctx.p.metallicity * ctx.disk.sigma) / (Math.sqrt(2 * Math.PI) * hd);
}

export function pebbleAccretionRate(mass: number, ctx: AccretionContext) {
  const rAcc = accretionRadius(mass, ctx);
  const hd = dustScaleHeight(ctx.stokes, ctx.disk, ctx.p);
  const xi = (rAcc / (2 * hd)) ** 2;
  const approach = ctx.p.pebbleAccretionModel === "paperFig5" ? headwind(ctx) : headwind(ctx) + ctx.disk.omega * rAcc;
  const geometryFactor = besselI0Scaled(xi) + besselI1Scaled(xi);
  const mdot = Math.PI * rAcc * rAcc * midplaneDustDensity(ctx) * approach * geometryFactor;
  return { rAcc, xi, mdot };
}

export function gasAccretionRate(mass: number, mdotDust: number, disk: DiskState): number {
  const rHill = hillRadius(mass, disk);
  const rBondi = bondiRadiusGas(mass, disk);
  if (rBondi < rHill) {
    return (4 * Math.PI * G ** 3 * mass * mass * disk.rho * mdotDust) / disk.cs ** 6;
  }
  return ((4 * Math.PI * disk.rho * G) / (9 * disk.omega * disk.omega)) * mdotDust;
}

export function pebbleIsolationMass(disk: DiskState, p: ModelParams): number {
  return disk.mSmbh * Math.sqrt(ISOLATION_GAP_PARAMETER * disk.h ** 5 * p.alpha);
}

export function thermalMass(disk: DiskState): number {
  return 3 * disk.h ** 3 * disk.mSmbh;
}

export function twoDimensionalTransitionMass(ctx: AccretionContext): number | null {
  const hd = dustScaleHeight(ctx.stokes, ctx.disk, ctx.p);
  const f = (m: number) => accretionRadius(m, ctx) - 2 * hd;
  const grid = logspace(1e-12 * M_SUN, 1e6 * M_SUN, 181);
  for (let i = 0; i + 1 < grid.length; i++) {
    if (Math.sign(f(grid[i])) !== Math.sign(f(grid[i + 1]))) {
      return bisectLog(f, grid[i], grid[i + 1], 60);
    }
  }
  return null;
}

export function accretionAt(mass: number, ctx: AccretionContext): AccretionState {
  const { disk, p } = ctx;
  const { rAcc, xi, mdot } = pebbleAccretionRate(mass, ctx);
  const mdotGas = gasAccretionRate(mass, mdot, disk);
  return {
    mass,
    rHill: hillRadius(mass, disk),
    rBondiDust: bondiRadiusDust(mass, ctx),
    rBondiGas: bondiRadiusGas(mass, disk),
    rGeo: geometricRadius(mass, p),
    transitionMass: transitionMass(ctx),
    hillBondiMass: hillBondiMass(ctx),
    bondiGeometricMass: bondiGeometricMass(ctx),
    regime: pebbleRegime(mass, ctx),
    rAcc,
    xi,
    geometry: xi < 1 ? "3D" : "2D",
    mdotDust: mdot,
    mdotGas,
    doublingTime: mass / (mdot + mdotGas),
  };
}
