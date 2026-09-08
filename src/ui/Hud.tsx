import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  interpolateColor, useAnimatedStyle, type SharedValue,
} from "react-native-reanimated";
import { useSafeArea } from "./useSafeArea";
import { F, T } from "./theme";

export interface HudValues {
  hp: SharedValue<number>;
  pips: SharedValue<number>;
  cdDash: SharedValue<number>;
  cdPop: SharedValue<number>;
}

interface Props {
  v: HudValues;
  round: number;
  kind: string;
  boss: boolean;
  popped: number;
  lives: number;
  pipHues: number[];
  muted: boolean;
  onMute: () => void;
}

/** One ditto, lit while it is still fighting. */
function Pip({ pips, index, hue }: { pips: SharedValue<number>; index: number; hue: number }) {
  const style = useAnimatedStyle(() => {
    const alive = (pips.value >> index) & 1;
    return {
      opacity: alive ? 1 : 0.28,
      backgroundColor: alive ? `hsla(${hue},58%,66%,0.3)` : "transparent",
      borderColor: alive ? `hsl(${hue},58%,66%)` : T.line,
      transform: [{ scale: alive ? 1 : 0.78 }],
    };
  });
  return <Animated.View style={[styles.pip, style]} />;
}

export function Hud({ v, round, kind, boss, popped, lives, pipHues, muted, onMute }: Props) {
  const inset = useSafeArea();

  const health = useAnimatedStyle(() => ({
    transform: [{ scaleX: Math.max(0.001, v.hp.value) }],
    backgroundColor: interpolateColor(
      Math.min(1, v.hp.value / 0.34), [0, 1], [T.rose, T.film],
    ),
  }));

  // Deliberately not one full-screen container: a view spanning the arena
  // intercepts the drag that steers, whatever its pointerEvents says. Each piece
  // is placed on its own and marked inert, and only the mute button takes touches.
  return (
    <>
      <View style={[styles.top, { paddingTop: inset.top + 14 }]}>
        <View>
          <Text style={styles.k}>{kind}</Text>
          <Text style={[styles.v, boss && { color: T.gold }]}>{round}</Text>
          <View style={styles.lives}>
            {[0, 1, 2].map((n) => (
              <View key={n} style={[styles.life, n >= lives && styles.lifeSpent]} />
            ))}
          </View>
          <View style={styles.pips}>
            {pipHues.map((hue, i) => (
              <Pip key={i} pips={v.pips} index={i} hue={hue} />
            ))}
          </View>
        </View>

        <View style={styles.right}>
          <Text style={[styles.k, styles.rightText]}>Popped</Text>
          <Text style={[styles.v, styles.rightText]}>{popped}</Text>
        </View>
      </View>

      <Pressable
        onPress={onMute}
        hitSlop={10}
        accessibilityLabel={muted ? "Unmute sound" : "Mute sound"}
        style={[styles.mute, { top: inset.top + 12 }]}
      >
        <Text style={[styles.muteGlyph, { color: muted ? T.mute : T.film }]}>
          {muted ? "✕" : "♪"}
        </Text>
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
    flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start",
    paddingHorizontal: 16, paddingRight: 58, pointerEvents: "none",
  },
  k: { fontFamily: F.mono, fontSize: 10, letterSpacing: 1.6, color: T.mute, textTransform: "uppercase" },
  v: {
    fontFamily: F.display, fontWeight: "900", fontSize: 30, lineHeight: 33,
    color: T.chalk, fontVariant: ["tabular-nums"], marginTop: 3,
  },
  right: { alignItems: "flex-end" },
  rightText: { textAlign: "right" },
  // Diamonds, not circles: retries are yours, the circles below are the squad's.
  lives: { flexDirection: "row", gap: 6, marginTop: 9, paddingLeft: 2 },
  life: {
    width: 8, height: 8, backgroundColor: T.rose,
    transform: [{ rotate: "45deg" }],
  },
  lifeSpent: { backgroundColor: "transparent", borderWidth: 1, borderColor: T.line },
  pips: { flexDirection: "row", flexWrap: "wrap", gap: 5, marginTop: 10, maxWidth: 154 },
  pip: { width: 11, height: 11, borderRadius: 6, borderWidth: 1.5 },
  mute: {
    position: "absolute", right: 14, width: 34, height: 34, borderRadius: 17,
    borderWidth: 1, borderColor: T.line, alignItems: "center", justifyContent: "center",
  },
  muteGlyph: { fontFamily: F.mono, fontSize: 14 },
  hpTrack: {
    position: "absolute", left: 16, right: 16, height: 5, borderRadius: 99,
    backgroundColor: T.ink3, overflow: "hidden", pointerEvents: "none",
  },
  hpFill: { width: "100%", height: "100%", borderRadius: 99, transformOrigin: "left center" },
});
