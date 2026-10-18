import { Color } from "three";
import type { ObjectFate } from "../physics/fate";
import type { PebbleRegime } from "../physics/accretion";

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

const MASS_STOPS: [number, Color][] = [
  [-1, new Color("#6f63b0")],
  [0.5, PALETTE.haze],
  [1.3, PALETTE.ember],
  [1.9, PALETTE.emberHot],
  [3.2, PALETTE.white],
];

export function massColor(logMjup: number, out = new Color()): Color {
  if (logMjup <= MASS_STOPS[0][0]) return out.copy(MASS_STOPS[0][1]);
  for (let i = 0; i + 1 < MASS_STOPS.length; i++) {
    const [a, ca] = MASS_STOPS[i];
    const [b, cb] = MASS_STOPS[i + 1];
    if (logMjup <= b) return out.copy(ca).lerp(cb, (logMjup - a) / (b - a));
  }
  return out.copy(MASS_STOPS[MASS_STOPS.length - 1][1]);
}

export const REGIME_COLOR: Record<PebbleRegime, Color> = {
  hill: PALETTE.emberHot,
  bondi: PALETTE.ember,
  geometric: PALETTE.haze,
};

export const FATE_COLOR: Record<ObjectFate, Color> = {
  frozen: new Color("#8a7fc4"),
  growing: PALETTE.ember,
  star: PALETTE.emberHot,
  bhProgenitor: PALETTE.thrust,
  imbhProgenitor: PALETTE.white,
};

export function temperatureColor(t: number, out = new Color()): Color {
  const u = Math.min(Math.max((Math.log10(t) - 2) / 1.2, 0), 1);
  if (u < 0.5) return out.copy(new Color("#4a2c66")).lerp(PALETTE.oxblood, u / 0.5);
  return out.copy(PALETTE.oxblood).lerp(PALETTE.ember, (u - 0.5) / 0.5);
}

export function cssColor(c: Color): string {
  return `#${c.getHexString()}`;
}
