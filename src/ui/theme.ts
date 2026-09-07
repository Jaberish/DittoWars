import { Platform } from "react-native";

/** One committed world: soap-film iridescence on deep ink. */
export const T = {
  void: "#05070F",
  ink: "#080B16",
  ink2: "#101828",
  ink3: "#1A2340",
  line: "#26314F",
  film: "#5EE9D8",
  leaf: "#6BE59A",
  rose: "#FF7BAC",
  ember: "#FF5A3C",
  gold: "#FFD98A",
  chalk: "#E6ECFF",
  mute: "#7D89A8",
} as const;

/**
 * No fonts are bundled, so the type system is built from platform faces: the
 * system display face carries every heading, and the platform monospace carries
 * every label and figure. Both are dependable everywhere the app runs.
 */
export const F = {
  display: Platform.select({
    ios: "System",
    android: "sans-serif-black",
    default: "system-ui, -apple-system, 'Segoe UI', sans-serif",
  }) as string,
  body: Platform.select({
    ios: "System",
    android: "sans-serif",
    default: "system-ui, -apple-system, 'Segoe UI', sans-serif",
  }) as string,
  mono: Platform.select({
    ios: "Menlo",
    android: "monospace",
    default: "ui-monospace, SFMono-Regular, Menlo, monospace",
  }) as string,
};

/** An uppercase micro-label: the game's one recurring typographic device. */
export const label = {
  fontFamily: F.mono,
  fontSize: 10,
  letterSpacing: 1.6,
  color: T.mute,
  textTransform: "uppercase" as const,
};

/** `StyleSheet.absoluteFillObject` is no longer typed in RN 0.86; this replaces it. */
export const fill = {
  position: "absolute" as const,
  top: 0, left: 0, right: 0, bottom: 0,
};
