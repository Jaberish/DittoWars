import React, { useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withSpring,
  withTiming, type SharedValue,
} from "react-native-reanimated";
import { useSafeArea } from "./useSafeArea";
import { F, T, fill } from "./theme";

export interface Stick {
  x: SharedValue<number>;
  y: SharedValue<number>;
  ox: SharedValue<number>;
  oy: SharedValue<number>;
  on: SharedValue<number>;
}

export const STICK_R = 62;

/**
 * The stick is wherever your thumb lands. Drawing it only once you touch keeps the
 * arena clear, and putting it under your thumb rather than in a fixed corner is the
 * difference between a phone game and a phone game you can actually steer.
 */
export function Joystick({ s }: { s: Stick }) {
  const ring = useAnimatedStyle(() => ({
    opacity: s.on.value * 0.22,
    transform: [
      { translateX: s.ox.value - STICK_R },
      { translateY: s.oy.value - STICK_R },
      { scale: 0.9 + s.on.value * 0.1 },
    ],
  }));
  const knob = useAnimatedStyle(() => ({
    opacity: s.on.value * 0.5,
    transform: [
      { translateX: s.ox.value + s.x.value * STICK_R - 22 },
      { translateY: s.oy.value + s.y.value * STICK_R - 22 },
    ],
  }));
  return (
    <View style={[fill, { pointerEvents: "none" }]}>
      <Animated.View style={[styles.ring, ring]} />
      <Animated.View style={[styles.knob, knob]} />
    </View>
  );
}

interface BtnProps {
  label: string;
  glyph: string;
  tint: string;
  cd: SharedValue<number>;
  onPress: () => void;
}

function Ability({ label, glyph, tint, cd, onPress }: BtnProps) {
  const press = useSharedValue(0);
  const pulse = useSharedValue(0);

  useEffect(() => {
    // A slow breath on the ready ring. It costs nothing and it makes the pad feel
    // alive between cooldowns instead of sitting there as three dead circles.
    pulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: 1200, easing: Easing.inOut(Easing.quad) }),
      ),
      -1, false,
    );
  }, [pulse]);

  const body = useAnimatedStyle(() => {
    const ready = cd.value <= 0.001;
    return {
      borderColor: ready ? tint : T.line,
      transform: [{ scale: 1 - press.value * 0.07 }],
    };
  });
  const halo = useAnimatedStyle(() => ({
    opacity: cd.value <= 0.001 ? 0.1 + pulse.value * 0.16 : 0,
    transform: [{ scale: 1 + pulse.value * 0.08 }],
  }));
  const veil = useAnimatedStyle(() => ({ height: `${Math.max(0, cd.value) * 100}%` }));
  const text = useAnimatedStyle(() => ({ color: cd.value <= 0.001 ? tint : T.mute }));

  return (
    <Pressable
      accessibilityLabel={label}
      onPressIn={() => { press.value = withSpring(1, { damping: 14, stiffness: 420 }); onPress(); }}
      onPressOut={() => { press.value = withSpring(0, { damping: 14, stiffness: 300 }); }}
    >
      <Animated.View style={[styles.halo, { backgroundColor: tint }, halo]} />
      <Animated.View style={[styles.btn, body]}>
        <Animated.View style={[styles.veil, veil]} />
        <Animated.Text style={[styles.glyph, text]}>{glyph}</Animated.Text>
        <Animated.Text style={[styles.btnLabel, text]}>{label}</Animated.Text>
      </Animated.View>
    </Pressable>
  );
}

interface PadProps {
  cdDash: SharedValue<number>;
  cdPop: SharedValue<number>;
  cdDoze: SharedValue<number>;
  onDash: () => void;
  onPop: () => void;
  onDoze: () => void;
}

export function AbilityPad({ cdDash, cdPop, cdDoze, onDash, onPop, onDoze }: PadProps) {
  const inset = useSafeArea();
  return (
    <View style={[styles.pad, { bottom: inset.bottom + 32 }]}>
      <Ability label="Doze" glyph="▮▶" tint={T.rose} cd={cdDoze} onPress={onDoze} />
      <Ability label="Pop" glyph="◎" tint={T.gold} cd={cdPop} onPress={onPop} />
      <Ability label="Dash" glyph="≫" tint={T.film} cd={cdDash} onPress={onDash} />
    </View>
  );
}

const styles = StyleSheet.create({
  ring: {
    position: "absolute", width: STICK_R * 2, height: STICK_R * 2,
    borderRadius: STICK_R, borderWidth: 2, borderColor: T.chalk,
  },
  knob: {
    position: "absolute", width: 44, height: 44, borderRadius: 22,
    backgroundColor: T.film,
  },
  pad: { position: "absolute", right: 16, flexDirection: "row", gap: 10, alignItems: "flex-end" },
  halo: { position: "absolute", left: -6, top: -6, width: 78, height: 78, borderRadius: 39 },
  btn: {
    width: 66, height: 66, borderRadius: 33, borderWidth: 1.5,
    backgroundColor: T.ink2, alignItems: "center", justifyContent: "center",
    overflow: "hidden", gap: 2,
  },
  veil: { position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: "rgba(8,11,22,0.74)" },
  glyph: { fontFamily: F.mono, fontSize: 15, lineHeight: 18 },
  btnLabel: { fontFamily: F.mono, fontSize: 9, letterSpacing: 1.1, textTransform: "uppercase" },
});
