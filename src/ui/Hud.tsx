import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  interpolateColor, useAnimatedStyle, type SharedValue,
} from "react-native-reanimated";
import { useSafeArea } from "./useSafeArea";
import { F, T } from "./theme";
import { MenuIcon } from "./Icon";

export interface HudValues {
  hp: SharedValue<number>;
  cdDash: SharedValue<number>;
  cdPop: SharedValue<number>;
}

interface Props {
  v: HudValues;
  score: number;
  lives: number;
  onMenu: () => void;
}

export function Hud({ v, score, lives, onMenu }: Props) {
  const inset = useSafeArea();

  const health = useAnimatedStyle(() => ({
    transform: [{ scaleX: Math.max(0.001, v.hp.value) }],
    backgroundColor: interpolateColor(
      Math.min(1, v.hp.value / 0.34), [0, 1], [T.rose, T.film],
    ),
  }));

  // Deliberately not one full-screen container: a view spanning the arena
  // intercepts the drag that steers, whatever its pointerEvents says. Each piece
  // is placed on its own and marked inert, and only the menu button takes touches.
  return (
    <>
      <View style={[styles.top, { paddingTop: inset.top + 14 }]}>
        <View style={styles.lives}>
          {Array.from({ length: Math.max(3, lives) }, (_, n) => (
            <Text key={n} style={[styles.life, n >= lives && styles.lifeSpent]}>
              ♥
            </Text>
          ))}
        </View>

        {/* one line rather than a stack: the figure earns the height more than the
            word above it does */}
        <View style={styles.right}>
          <Text style={styles.k}>Score</Text>
          <Text style={styles.v}>{score.toLocaleString()}</Text>
        </View>
      </View>

      <Pressable
        onPress={onMenu}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel="Pause and open menu"
        style={[styles.menu, { top: inset.top + 12 }]}
      >
        <MenuIcon size={17} tint={T.mute} />
      </Pressable>

      <View style={[styles.hpTrack, { bottom: inset.bottom + 14 }]}>
        <Animated.View style={[styles.hpFill, health]} />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  top: {
    position: "absolute", top: 0, left: 0, right: 0,
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: 16, paddingRight: 58, pointerEvents: "none",
  },
  k: { fontFamily: F.mono, fontSize: 10, letterSpacing: 1.6, color: T.mute, textTransform: "uppercase" },
  v: {
    fontFamily: F.display, fontWeight: "900", fontSize: 30, lineHeight: 33,
    color: T.chalk, fontVariant: ["tabular-nums"],
  },
  right: { flexDirection: "row", alignItems: "baseline", gap: 8 },
  // Off the screen edge by the same 16 as everything else, then off the arena's
  // outline by this: the hearts alone move, the gutter they sit in does not.
  lives: { flexDirection: "row", gap: 5, marginLeft: 12 },
  life: { fontSize: 15, lineHeight: 18, color: T.rose },
  lifeSpent: { color: T.line },
  menu: {
    position: "absolute", right: 14, width: 34, height: 34, borderRadius: 17,
    borderWidth: 1, borderColor: T.line, backgroundColor: T.ink,
    alignItems: "center", justifyContent: "center",
  },
  hpTrack: {
    position: "absolute", left: 16, right: 16, height: 5, borderRadius: 99,
    backgroundColor: T.ink3, overflow: "hidden", pointerEvents: "none",
  },
  hpFill: { width: "100%", height: "100%", borderRadius: 99, transformOrigin: "left center" },
});
