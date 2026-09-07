import { Platform, StatusBar } from "react-native";

/**
 * A dependency-free stand-in for safe-area insets. The HUD only needs to clear the
 * status bar and the home indicator, which these cover on every device the game
 * targets — not worth pulling a native module in for.
 */
export function useSafeArea() {
  if (Platform.OS === "android")
    return { top: (StatusBar.currentHeight ?? 24) + 4, bottom: 12 };
  if (Platform.OS === "ios") return { top: 54, bottom: 26 };
  return { top: 16, bottom: 16 };
}
