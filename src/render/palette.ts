import type { SkColor } from "@shopify/react-native-skia";

/**
 * Ditto Wars keeps one committed visual world: soap-film iridescence on deep ink.
 * Cyan is you, green is a friend, red is a threat. Nothing else gets a hue.
 */
export const C = {
  void: "#05070F",
  ink: "#080B16",
  ink2: "#101828",
  floor0: "#182443",
  floor1: "#090E1E",
  line: "#26314F",
  line2: "#3A4770",
  film: "#5EE9D8",
  leaf: "#6BE59A",
  rose: "#FF7BAC",
  ember: "#FF5A3C",
  gold: "#FFD98A",
  chalk: "#E6ECFF",
  mute: "#7D89A8",
  violet: "#C4A8FF",
} as const;

/**
 * An SkColor is a Float32Array of RGBA in 0..1 on every platform, so colours are
 * built here rather than handed to `Skia.Color` as CSS strings: no per-draw string
 * parse, and no dependence on what the native colour parser happens to accept.
 */
function rgba(r: number, g: number, b: number, a: number): SkColor {
  return Float32Array.of(r, g, b, a);
}

function hueToChannel(m1: number, m2: number, h: number) {
  if (h < 0) h += 1;
  else if (h > 1) h -= 1;
  if (h * 6 < 1) return m1 + (m2 - m1) * h * 6;
  if (h * 2 < 1) return m2;
  if (h * 3 < 2) return m1 + (m2 - m1) * (2 / 3 - h) * 6;
  return m1;
}

const hslCache = new Map<number, SkColor>();

/** HSL to a Skia colour, memoised — enemy hues repeat constantly. */
export function hsl(h: number, s: number, l: number, a = 1): SkColor {
  const hq = ((Math.round(h) % 360) + 360) % 360;
  const sq = Math.max(0, Math.min(100, Math.round(s)));
  const lq = Math.max(0, Math.min(100, Math.round(l)));
  const aq = Math.max(0, Math.min(255, Math.round(a * 255)));
  const key = ((hq * 101 + sq) * 101 + lq) * 256 + aq;
  const hit = hslCache.get(key);
  if (hit) return hit;
  const S = sq / 100, L = lq / 100;
  const m2 = L <= 0.5 ? L * (S + 1) : L + S - L * S;
  const m1 = L * 2 - m2;
  const H = hq / 360;
  const out = rgba(
    hueToChannel(m1, m2, H + 1 / 3),
    hueToChannel(m1, m2, H),
    hueToChannel(m1, m2, H - 1 / 3),
    aq / 255,
  );
  if (hslCache.size < 8000) hslCache.set(key, out);
  return out;
}

const hexCache = new Map<string, SkColor>();

/** A `#RRGGBB` colour with an alpha applied, memoised the same way. */
export function col(hex: string, a = 1): SkColor {
  const key = hex + "|" + Math.round(a * 255);
  const hit = hexCache.get(key);
  if (hit) return hit;
  const n = parseInt(hex.slice(1), 16);
  const out = rgba(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, a);
  hexCache.set(key, out);
  return out;
}
