import { Color } from "three";
import type { ObjectFate } from "../physics/fate";
import type { Stage } from "../physics/era";
import type { PebbleRegime } from "../physics/accretion";
import type { Niche } from "../physics/civ";

export const PALETTE = {
  ink: new Color("#15122a"),
  ember: new Color("#e58a4e"),
  emberHot: new Color("#f5d8a0"),
  oxblood: new Color("#7a2e3b"),
  bone: new Color("#efe6d6"),
  haze: new Color("#a79bd6"),
  signal: new Color("#7fe0c2"),
  thrust: new Color("#f2577c"),
  white: new Color("#fff8ee"),
};

export const MASS_STOPS: [number, Color][] = [
  [-1, new Color("#6f63b0")],
  [0.5, PALETTE.haze],
  [1.3, PALETTE.ember],
  [1.9, PALETTE.emberHot],
  [3.2, PALETTE.white],
];

export function rampColor(stops: [number, Color][], x: number, out = new Color()): Color {
  if (x <= stops[0][0]) return out.copy(stops[0][1]);
  for (let i = 0; i + 1 < stops.length; i++) {
    const [a, ca] = stops[i];
    const [b, cb] = stops[i + 1];
    if (x <= b) return out.copy(ca).lerp(cb, (x - a) / (b - a));
  }
  return out.copy(stops[stops.length - 1][1]);
}

export function massColor(logMjup: number, out = new Color()): Color {
  return rampColor(MASS_STOPS, logMjup, out);
}

export const REGIME_COLOR: Record<PebbleRegime, Color> = {
  hill: PALETTE.emberHot,
  bondi: PALETTE.ember,
  geometric: PALETTE.haze,
};

const UNLIT_COLOR = new Color("#c98fb0");

export const FATE_COLOR: Record<ObjectFate, Color> = {
  frozen: new Color("#8a7fc4"),
  growing: PALETTE.ember,
  unlit: UNLIT_COLOR,
  star: PALETTE.emberHot,
  bhProgenitor: PALETTE.thrust,
  imbhProgenitor: PALETTE.white,
};

export const REMNANT_COLOR = new Color("#b04a74");

export const STAGE_COLOR: Record<Stage, Color> = {
  dust: new Color("#6d6496"),
  never: new Color("#2a2547"),
  planet: new Color("#8a7fc4"),
  browndwarf: PALETTE.ember,
  dustStar: UNLIT_COLOR,
  star: PALETTE.emberHot,
  massiveStar: PALETTE.white,
  remnant: REMNANT_COLOR,
};

const ICE_BLUE = new Color("#5f8fd0");
const MEADOW = new Color("#9fd3a0");

const AMBIENT_STOPS: [number, Color][] = [
  [100, new Color("#3b3f8f")],
  [170, ICE_BLUE],
  [273, MEADOW],
  [373, new Color("#e8c45a")],
  [700, PALETTE.ember],
  [1200, PALETTE.emberHot],
];

const AMBIENT_LOG_STOPS: [number, Color][] = AMBIENT_STOPS.map(([t, c]) => [Math.log(t), c]);

export function ambientColor(t: number, out = new Color()): Color {
  return rampColor(AMBIENT_LOG_STOPS, Math.log(t), out);
}

export const AMBIENT_LEGEND_TEMPERATURES = AMBIENT_STOPS.map(([t]) => t);

export const NICHE_COLOR: Record<Niche, Color> = {
  never: STAGE_COLOR.never,
  dustOnly: STAGE_COLOR.dust,
  glowMoons: PALETTE.emberHot,
  hydrogenWell: PALETTE.thrust,
  oven: PALETTE.ember,
  temperate: MEADOW,
  frost: ICE_BLUE,
  coldRock: new Color("#8a7fc4"),
};

export const RESOURCE_STOPS: [number, Color][] = [
  [0, new Color("#2a2547")],
  [0.55, PALETTE.signal],
  [1, PALETTE.white],
];

export const SETTLED_STOPS: [number, Color][] = [
  [0, PALETTE.emberHot],
  [0.5, PALETTE.ember],
  [1, PALETTE.oxblood],
];

export function temperatureColor(t: number, out = new Color()): Color {
  const u = Math.min(Math.max((Math.log10(t) - 2) / 1.2, 0), 1);
  if (u < 0.5) return out.copy(new Color("#4a2c66")).lerp(PALETTE.oxblood, u / 0.5);
  return out.copy(PALETTE.oxblood).lerp(PALETTE.ember, (u - 0.5) / 0.5);
}

export function cssColor(c: Color): string {
  return `#${c.getHexString()}`;
}
