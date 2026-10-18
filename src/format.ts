import { AU, C_LIGHT, DAY, M_EARTH, M_JUP, M_SUN, PC, YR } from "./physics/constants";

const SUPERSCRIPT: Record<string, string> = {
  "-": "⁻",
  "0": "⁰",
  "1": "¹",
  "2": "²",
  "3": "³",
  "4": "⁴",
  "5": "⁵",
  "6": "⁶",
  "7": "⁷",
  "8": "⁸",
  "9": "⁹",
};

export function sci(x: number, digits = 2): string {
  if (!Number.isFinite(x)) return x > 0 ? "∞" : "—";
  if (x === 0) return "0";
  const exp = Math.floor(Math.log10(Math.abs(Number(x.toPrecision(digits)))));
  if (exp >= -2 && exp < 4) {
    const decimals = Math.max(0, digits - 1 - exp);
    return x.toLocaleString("en-US", { maximumFractionDigits: decimals, minimumFractionDigits: 0 });
  }
  const mant = x / 10 ** exp;
  const sup = String(exp)
    .split("")
    .map((c) => SUPERSCRIPT[c] ?? c)
    .join("");
  return `${mant.toFixed(digits - 1)}×10${sup}`;
}

export function count(x: number): string {
  if (x >= 1e6) return `${sci(x / 1e6, 3)} million`;
  if (x >= 1e4) return Math.round(x).toLocaleString("en-US");
  return sci(x, 3);
}

export function mass(kg: number): string {
  if (kg >= 0.08 * M_SUN) return `${sci(kg / M_SUN, 3)} M☉`;
  if (kg >= 0.1 * M_JUP) return `${sci(kg / M_JUP, 3)} Mjup`;
  return `${sci(kg / M_EARTH, 3)} M⊕`;
}

export function length(m: number): string {
  if (m >= 0.01 * PC) return `${sci(m / PC, 3)} pc`;
  if (m >= 0.1 * AU) return `${sci(m / AU, 3)} AU`;
  if (m >= 1e4) return `${sci(m / 1e3, 3)} km`;
  if (m >= 1) return `${sci(m, 3)} m`;
  if (m >= 1e-3) return `${sci(m * 1e3, 3)} mm`;
  return `${sci(m * 1e6, 3)} µm`;
}

export function duration(s: number): string {
  const a = Math.abs(s);
  if (!Number.isFinite(a)) return "never";
  if (a >= 1e6 * YR) return `${sci(s / (1e6 * YR), 3)} Myr`;
  if (a >= 1e4 * YR) return `${sci(s / (1e3 * YR), 3)} kyr`;
  if (a >= YR) return `${sci(s / YR, 3)} yr`;
  if (a >= DAY) return `${sci(s / DAY, 3)} days`;
  if (a >= 3600) return `${sci(s / 3600, 3)} h`;
  if (a >= 60) return `${sci(s / 60, 3)} min`;
  if (a >= 1) return `${sci(s, 3)} s`;
  if (a >= 1e-3) return `${sci(s * 1e3, 3)} ms`;
  return `${sci(s * 1e6, 3)} µs`;
}

export function lightTime(m: number): string {
  return duration(m / C_LIGHT);
}

export function distanceWithLight(m: number): string {
  return `${length(m)} (${lightTime(m)} of light)`;
}

export function speed(mps: number): string {
  if (mps >= 0.01 * C_LIGHT) return `${sci(mps / C_LIGHT, 3)} c`;
  if (mps >= 1e3) return `${sci(mps / 1e3, 3)} km/s`;
  return `${sci(mps, 3)} m/s`;
}

export function dataRate(bps: number): string {
  if (bps >= 1e9) return `${sci(bps / 1e9, 3)} Gbit/s`;
  if (bps >= 1e6) return `${sci(bps / 1e6, 3)} Mbit/s`;
  if (bps >= 1e3) return `${sci(bps / 1e3, 3)} kbit/s`;
  if (bps >= 1) return `${sci(bps, 3)} bit/s`;
  return "no usable link";
}

export function decibels(ratio: number): string {
  if (ratio <= 0) return "−∞ dB";
  return `${(10 * Math.log10(ratio)).toFixed(1)} dB`;
}

export function simTime(years: number): string {
  if (years < 1e4) return `${years.toLocaleString("en-US", { maximumFractionDigits: 1 })} yr`;
  if (years < 1e6) return `${(years / 1e3).toLocaleString("en-US", { maximumFractionDigits: 2 })} kyr`;
  return `${(years / 1e6).toLocaleString("en-US", { maximumFractionDigits: 3 })} Myr`;
}
