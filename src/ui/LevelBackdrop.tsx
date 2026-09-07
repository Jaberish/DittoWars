import React, { useEffect } from "react";
import { Platform, StyleSheet, View } from "react-native";
import Animated, {
  Easing, useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming,
} from "react-native-reanimated";
import { INTRO_HOLD, INTRO_LIFT, MAX_ROUNDS } from "../engine/constants";
import { F, T, fill } from "./theme";

interface Props {
  round: number;
  boss: boolean;
  final: boolean;
  vw: number;
  vh: number;
}

const OUT = Easing.bezier(0.16, 1, 0.3, 1);

/** The numeral's halo. Web wants the shorthand; native wants the discrete props. */
const glowFor = (tint: string) =>
  Platform.OS === "web"
    ? ({ textShadow: `0 0 46px ${tint}` } as const)
    : ({
        textShadowColor: tint,
        textShadowOffset: { width: 0, height: 0 },
        textShadowRadius: 46,
      } as const);
const IN = Easing.bezier(0.5, 0, 0.75, 0);

/**
 * The level number, painted across the arena floor.
 *
 * It lives between the floor canvas and the world canvas, so units, bullets and
 * effects all pass over the top of it — it is the backdrop the round is played
 * against, not a card laid over the game. It settles as the round is dealt, holds
 * while you find your feet, then lifts away exactly as play begins.
 */
export function LevelBackdrop({ round, boss, final, vw, vh }: Props) {
  const digits = String(round).length;
  // Big enough to be the wall behind the fight, never wide enough to clip: the
  // divisor is the advance width of one black-weight digit, so "100" is set at
  // roughly half the size of "1" and both keep a margin off the arena wall.
  const size = Math.min((vw * 0.86) / (digits * 0.66), vh * 0.44);

  const fade = useSharedValue(0);
  const grow = useSharedValue(1.34);
  const rise = useSharedValue(26);
  const kern = useSharedValue(2);
  const rule = useSharedValue(0);

  useEffect(() => {
    const hold = INTRO_HOLD * 1000;
    const lift = INTRO_LIFT * 1000;
    fade.value = 0; grow.value = 1.34; rise.value = 26; kern.value = 2; rule.value = 0;
    fade.value = withSequence(
      withTiming(1, { duration: 300, easing: OUT }),
      withDelay(hold - 300, withTiming(0, { duration: lift * 0.82, easing: IN })),
    );
    grow.value = withSequence(
      withTiming(1, { duration: 540, easing: OUT }),
      withDelay(hold - 540, withTiming(1.26, { duration: lift, easing: OUT })),
    );
    rise.value = withSequence(
      withTiming(0, { duration: 540, easing: OUT }),
      withDelay(hold - 540, withTiming(-20, { duration: lift, easing: OUT })),
    );
    // the kicker keeps drifting wider the whole time, so the card never sits still
    kern.value = withTiming(10, { duration: hold + lift, easing: Easing.out(Easing.quad) });
    rule.value = withSequence(
      withDelay(180, withTiming(1, { duration: 620, easing: OUT })),
      withDelay(hold - 800, withTiming(0, { duration: lift * 0.7, easing: IN })),
    );
  }, [round, fade, grow, rise, kern, rule]);

  const numeral = useAnimatedStyle(() => ({
    opacity: fade.value * 0.5,
    transform: [{ translateY: rise.value }, { scale: grow.value }],
  }));
  const kicker = useAnimatedStyle(() => ({
    opacity: fade.value,
    letterSpacing: kern.value,
    transform: [{ translateY: rise.value * 0.5 }],
  }));
  const ruleStyle = useAnimatedStyle(() => ({
    opacity: fade.value * 0.7,
    transform: [{ scaleX: rule.value }],
  }));

  const kick = final ? "The last one" : boss ? "Deathmatch" : "Level";
  const note = final
    ? "one way or the other"
    : boss
      ? "no clock · last team standing"
      : `${round} of ${MAX_ROUNDS}`;
  const tint = boss || final ? T.gold : T.film;

  return (
    <View style={[styles.wrap, { pointerEvents: "none" }]}>
      <Animated.Text style={[styles.kicker, { color: tint }, kicker]}>
        {kick.toUpperCase()}
      </Animated.Text>
      <Animated.View style={[styles.rule, { backgroundColor: tint }, ruleStyle]} />
      <Animated.Text
        style={[
          styles.numeral,
          { fontSize: size, lineHeight: size * 1.02, color: tint },
          glowFor(tint),
          numeral,
        ]}
        allowFontScaling={false}
      >
        {round}
      </Animated.Text>
      <Animated.View style={[styles.rule, { backgroundColor: tint }, ruleStyle]} />
      <Animated.Text style={[styles.note, kicker]}>{note}</Animated.Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { ...fill, alignItems: "center", justifyContent: "center" },
  kicker: {
    fontFamily: F.mono, fontSize: 13, fontWeight: "500",
    textTransform: "uppercase", marginBottom: 10,
  },
  rule: { height: 1, width: "56%", opacity: 0.7 },
  numeral: {
    fontFamily: F.display, fontWeight: "900", textAlign: "center",
    fontVariant: ["tabular-nums"], includeFontPadding: false,
    marginVertical: -6,
  },
  note: {
    fontFamily: F.mono, fontSize: 10, color: T.mute,
    textTransform: "uppercase", marginTop: 10,
  },
});
