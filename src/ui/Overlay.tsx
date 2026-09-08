import React, { useEffect, useMemo } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence,
  withSpring, withTiming,
} from "react-native-reanimated";
import { BOONS, DITTO_CAP, MAX_ROUNDS, type Boon } from "../engine/constants";
import type { Ghost } from "../engine/types";
import { Game } from "../engine/world";
import { F, T, fill } from "./theme";

const OUT = Easing.bezier(0.16, 1, 0.3, 1);

/** Content arrives in sequence rather than all at once. */
function Rise({ index = 0, children, style }: {
  index?: number; children: React.ReactNode; style?: object;
}) {
  const k = useSharedValue(0);
  useEffect(() => {
    k.value = withDelay(60 + index * 55, withTiming(1, { duration: 460, easing: OUT }));
  }, [k, index]);
  const s = useAnimatedStyle(() => ({
    opacity: k.value,
    transform: [{ translateY: (1 - k.value) * 16 }],
  }));
  return <Animated.View style={[s, style]}>{children}</Animated.View>;
}

/** Idle film drifting behind the menu, so the first screen is not a still image. */
function Drift() {
  const seeds = useMemo(
    () => Array.from({ length: 9 }, (_, i) => ({
      x: (i * 37) % 90, size: 26 + ((i * 53) % 90), dur: 9000 + i * 1400, delay: i * 700,
    })),
    [],
  );
  return (
    <View style={[fill, { pointerEvents: "none" }]}>
      {seeds.map((s, i) => <Bubble key={i} {...s} />)}
    </View>
  );
}

function Bubble({ x, size, dur, delay }: { x: number; size: number; dur: number; delay: number }) {
  const k = useSharedValue(0);
  useEffect(() => {
    k.value = withDelay(delay, withRepeat(
      withTiming(1, { duration: dur, easing: Easing.linear }), -1, false,
    ));
  }, [k, dur, delay]);
  const s = useAnimatedStyle(() => ({
    opacity: Math.sin(k.value * Math.PI) * 0.16,
    transform: [
      { translateY: (1 - k.value) * 620 - 120 },
      { translateX: Math.sin(k.value * 7) * 22 },
    ],
  }));
  return (
    <Animated.View
      style={[
        styles.bubble,
        { left: `${x}%`, width: size, height: size, borderRadius: size / 2 },
        s,
      ]}
    />
  );
}

function Card({ children, onPress, index }: {
  children: React.ReactNode; onPress?: () => void; index: number;
}) {
  const press = useSharedValue(0);
  const s = useAnimatedStyle(() => ({ transform: [{ scale: 1 - press.value * 0.02 }] }));
  const inner = (
    <Animated.View style={[styles.card, onPress && styles.cardPick, s]}>{children}</Animated.View>
  );
  if (!onPress) return <Rise index={index}>{inner}</Rise>;
  return (
    <Rise index={index}>
      <Pressable
        onPressIn={() => { press.value = withSpring(1, { damping: 16, stiffness: 400 }); }}
        onPressOut={() => { press.value = withSpring(0); }}
        onPress={onPress}
      >
        {inner}
      </Pressable>
    </Rise>
  );
}

function Act({ label, onPress, ghost, index }: {
  label: string; onPress: () => void; ghost?: boolean; index: number;
}) {
  const press = useSharedValue(0);
  const s = useAnimatedStyle(() => ({ transform: [{ scale: 1 - press.value * 0.03 }] }));
  return (
    <Rise index={index}>
      <Pressable
        onPressIn={() => { press.value = withSpring(1, { damping: 16, stiffness: 400 }); }}
        onPressOut={() => { press.value = withSpring(0); }}
        onPress={onPress}
        accessibilityRole="button"
      >
        <Animated.View style={[styles.act, ghost && styles.actGhost, s]}>
          <Text style={[styles.actLabel, ghost && styles.actGhostLabel]}>{label}</Text>
        </Animated.View>
      </Pressable>
    </Rise>
  );
}

function Screen({ eyebrow, title, children, gold, onRestart }: {
  eyebrow: string; title: string; children: React.ReactNode;
  gold?: boolean; onRestart?: () => void;
}) {
  const k = useSharedValue(0);
  useEffect(() => { k.value = withTiming(1, { duration: 320, easing: OUT }); }, [k]);
  const scrim = useAnimatedStyle(() => ({ opacity: k.value }));
  const heading = useAnimatedStyle(() => ({
    opacity: k.value,
    transform: [{ translateY: (1 - k.value) * 22 }],
  }));
  return (
    <Animated.View style={[fill, styles.scrim, scrim]}>
      <Drift />
      <ScrollView
        contentContainerStyle={styles.sheet}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <Animated.View style={heading}>
          <Text style={styles.eyebrow}>{eyebrow}</Text>
          <Text style={[styles.title, gold && { color: T.gold }]}>{title}</Text>
        </Animated.View>
        {children}
      </ScrollView>
      {onRestart && (
        <Pressable
          onPress={onRestart}
          hitSlop={12}
          accessibilityLabel="Menu"
          style={styles.corner}
        >
          <Text style={styles.cornerGlyph}>☰</Text>
        </Pressable>
      )}
    </Animated.View>
  );
}

/** Rich text without a markdown parser: **bold** is the only mark the copy uses. */
function Body({ children, index = 1 }: { children: string; index?: number }) {
  const parts = children.split("**");
  return (
    <Rise index={index}>
      <Text style={styles.sub}>
        {parts.map((p, i) =>
          i % 2 ? <Text key={i} style={styles.strong}>{p}</Text> : <Text key={i}>{p}</Text>,
        )}
      </Text>
    </Rise>
  );
}

function GhostCard({ g, fresh, index }: { g: Ghost; fresh?: boolean; index: number }) {
  return (
    <Card index={index}>
      <View style={[styles.dot, { backgroundColor: `hsl(${g.hue},58%,64%)` }]} />
      <View style={styles.cardText}>
        <Text style={styles.cardTitle}>{fresh ? "New ditto" : `Ditto ${g.round}`}</Text>
        <Text style={styles.cardSub} numberOfLines={1}>
          {g.full ? "" : "cut short · "}{Game.buildLabel(g.build)}
        </Text>
      </View>
      <Text style={styles.cardMeta}>Lv{g.level}</Text>
    </Card>
  );
}

function Squad({ ghosts, label, index }: { ghosts: Ghost[]; label: string; index: number }) {
  if (!ghosts.length) return null;
  return (
    <Rise index={index}>
      <Text style={styles.squadLabel}>{label}</Text>
      <View style={styles.squad}>
        {ghosts.map((g, i) => (
          <View
            key={i}
            style={[
              styles.chip,
              { backgroundColor: `hsl(${g.hue},58%,64%)` },
              !g.full && styles.chipShort,
            ]}
          >
            <Text style={styles.chipText}>{g.level}</Text>
          </View>
        ))}
      </View>
    </Rise>
  );
}

/* ================= screens ================= */

export function MenuScreen({ onStart }: { onStart: () => void }) {
  return (
    <Screen eyebrow="Arena shooter" title="Ditto Wars">
      <Body index={1}>Your past selves fight beside you.</Body>
      <Rise index={2} style={styles.rules}>
        <Rule tint={T.film} title="You">Move. The gun aims itself.</Rule>
        <Rule tint={T.leaf} title="Dittos">
          Every round is recorded and replays on your side, for the rest of the run.
        </Rule>
        <Rule tint={T.ember} title="Waves">
          Each level adds its wave. Every tenth is a deathmatch.
        </Rule>
      </Rise>
      <Rise index={3}>
        <View style={styles.facts}>
          {[["100", "levels"], ["3", "lives"], ["41", "enemies"]].map(([n, l]) => (
            <View key={l} style={styles.fact}>
              <Text style={styles.factN}>{n}</Text>
              <Text style={styles.factL}>{l}</Text>
            </View>
          ))}
        </View>
      </Rise>
      <Act label="Start run" onPress={onStart} index={4} />
    </Screen>
  );
}

function Rule({ tint, title, children }: { tint: string; title: string; children: string }) {
  return (
    <View style={styles.rule}>
      <View style={[styles.ruleDot, { backgroundColor: tint }]} />
      <Text style={styles.ruleText}>
        <Text style={styles.strong}>{title}</Text>
        <Text style={styles.ruleDash}> — </Text>
        {children}
      </Text>
    </View>
  );
}

export function EndScreen({
  round, reason, ghost, ghosts, popped, lives, canRetry, boss, final, build,
  onAdvance, onRetry, onRestart,
}: {
  round: number;
  reason: string;
  ghost: Ghost | null;
  ghosts: Ghost[];
  popped: number;
  lives: number;
  canRetry: boolean;
  boss: boolean;
  final: boolean;
  build: Record<string, number | undefined>;
  onAdvance: (b: Boon) => void;
  onRetry: () => void;
  onRestart: () => void;
}) {
  const wipes = round % 10 === 0 && reason === "cleared";
  const nextIsBoss = (round + 1) % 10 === 0;
  const next = round + 1;

  // three of the five, drawn fresh for the level ahead
  const pick = useMemo(() => {
    const pool = BOONS.slice(), out: Boon[] = [];
    while (out.length < 3 && pool.length)
      out.push(pool.splice((Math.random() * pool.length) | 0, 1)[0]);
    return out;
  }, [round, reason]);

  const body = reason === "wiped"
    ? "A wipe leaves **no recording**. Spend a life and walk back in."
    : wipes
      ? "The board is wiped — **a fresh cast** for the next ten levels. Your dittos stay."
      : ghost?.full
        ? ""
        : "Cut short. This ditto only ever fights **part** of a level — spend a life to run it again.";

  const title = reason === "wiped" ? "Your team was wiped out"
    : reason === "cleared" ? "Deathmatch won"
      : ghost?.full ? "Level survived" : "You got popped";

  let i = 1;
  return (
    <Screen
      eyebrow={`Level ${round} · ${popped} popped · ` +
        `${Math.min(DITTO_CAP, ghosts.length + (ghost ? 1 : 0))} dittos · ` +
        `${lives} ${lives === 1 ? "life" : "lives"}`}
      title={title}
      gold={reason === "cleared"}
      onRestart={onRestart}
    >
      {!!body && <Body index={i++}>{body}</Body>}
      {ghost && <GhostCard g={ghost} fresh index={i++} />}
      <Squad ghosts={ghosts} label="Squad so far" index={i++} />

      {canRetry && (
        <Act
          index={i++}
          label={`Retry level ${round} · ${lives} left`}
          onPress={onRetry}
          ghost={!!ghost}
        />
      )}

      {ghost && (
        <>
          <Rise index={i++}>
            <View style={styles.stepRow}>
              <Text style={styles.step}>
                {final ? "One last boon" : nextIsBoss ? `Deathmatch · level ${next}` : `Level ${next}`}
              </Text>
              <View style={styles.hair} />
            </View>
            <Text style={styles.stepSub}>Permanent. Your ditto keeps it too.</Text>
          </Rise>
          {pick.map((b) => {
            const have = build[b.id] || 0;
            return (
              <Card key={b.id} index={i++} onPress={() => onAdvance(b)}>
                <View style={[styles.dot, { backgroundColor: `hsl(${b.hue},72%,64%)` }]} />
                <View style={styles.cardText}>
                  <Text style={styles.cardTitle}>{b.name}{have ? ` \u00d7${have + 1}` : ""}</Text>
                  <Text style={styles.cardSub}>
                    <Text style={{ color: `hsl(${b.hue},72%,70%)` }}>
                      {Game.boonGain(b.id, build)}
                    </Text>
                    {"  ·  less " + b.cost}
                  </Text>
                </View>
              </Card>
            );
          })}
        </>
      )}

    </Screen>
  );
}

export function FinishScreen({ round, won, ghosts, popped, standing, onAgain }: {
  round: number; won: boolean; ghosts: Ghost[];
  popped: number; standing: number; onAgain: () => void;
}) {
  // Reaching this screen without a win means the last life is gone.
  return (
    <Screen
      eyebrow={`Level ${round} of ${MAX_ROUNDS} · ${popped} popped this run`}
      title={won ? "You held the arena" : "Your team was wiped out"}
      gold={won}
    >
      <Body index={1}>
        {won
          ? `All **${MAX_ROUNDS} levels**, and **${ghosts.length} dittos** behind you. Every wave any of you ever fought came back at once, and every one of them is gone.`
          : `Level **${round}** outlasted your whole team, with **${standing}** still standing — and that was the last life.`}
      </Body>
      <Squad ghosts={ghosts} label="Your squad" index={2} />
      <Act label="Play again" onPress={onAgain} index={3} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  scrim: { backgroundColor: "rgba(5,7,15,0.93)" },
  sheet: {
    paddingHorizontal: 22, paddingTop: Platform.OS === "ios" ? 76 : 56,
    paddingBottom: 52, gap: 10, maxWidth: 560, width: "100%", alignSelf: "center",
  },
  bubble: { position: "absolute", borderWidth: 1, borderColor: "#8FD9FF", top: 0 },
  eyebrow: {
    fontFamily: F.mono, fontSize: 10, letterSpacing: 1.4, color: T.mute,
    textTransform: "uppercase", marginBottom: 8, paddingRight: 44,
  },
  title: {
    fontFamily: F.display, fontWeight: "900", fontSize: 38, lineHeight: 41,
    color: T.chalk, letterSpacing: -0.8, marginBottom: 6,
  },
  sub: { fontFamily: F.body, fontSize: 15, lineHeight: 22, color: T.mute, marginBottom: 6 },
  strong: { color: T.chalk, fontWeight: "700" },
  card: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: T.ink2, borderRadius: 14, borderWidth: 1, borderColor: T.line,
    paddingVertical: 13, paddingHorizontal: 14,
  },
  cardPick: { borderColor: "#33415F" },
  cardText: { flex: 1, gap: 2 },
  cardTitle: { fontFamily: F.body, fontWeight: "700", fontSize: 15, color: T.chalk },
  cardSub: { fontFamily: F.mono, fontSize: 11, color: T.mute },
  cardMeta: { fontFamily: F.mono, fontSize: 11, color: T.mute },
  dot: { width: 12, height: 12, borderRadius: 6 },
  squadLabel: {
    fontFamily: F.mono, fontSize: 10, letterSpacing: 1.6, color: T.mute,
    textTransform: "uppercase", marginTop: 8, marginBottom: 8,
  },
  squad: { flexDirection: "row", flexWrap: "wrap", gap: 5 },
  chip: {
    minWidth: 24, height: 22, borderRadius: 6, alignItems: "center",
    justifyContent: "center", paddingHorizontal: 5,
  },
  chipShort: { opacity: 0.5 },
  chipText: { fontFamily: F.mono, fontSize: 10, color: T.ink, fontWeight: "700" },
  rules: { gap: 12, marginVertical: 6 },
  rule: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  ruleDot: { width: 9, height: 9, borderRadius: 5, marginTop: 6 },
  ruleText: { flex: 1, fontFamily: F.body, fontSize: 14, lineHeight: 20, color: T.mute },
  ruleDash: { color: T.line },
  note: {
    fontFamily: F.body, fontSize: 13, lineHeight: 19, color: T.mute,
    borderLeftWidth: 2, borderLeftColor: T.line, paddingLeft: 12, marginVertical: 4,
  },
  act: {
    backgroundColor: T.film, borderRadius: 13, paddingVertical: 16,
    alignItems: "center", marginTop: 6,
  },
  actGhost: { backgroundColor: "transparent", borderWidth: 1, borderColor: T.line },
  actLabel: {
    fontFamily: F.body, fontWeight: "700", fontSize: 15, color: T.ink,
    letterSpacing: 0.2,
  },
  actGhostLabel: { color: T.mute },
  // Leaving the run is a way out, not a thing to weigh against the boons, so it sits
  // in the corner where the mute button does rather than under the choice.
  corner: {
    position: "absolute", top: 46, right: 18,
    width: 36, height: 36, borderRadius: 18,
    borderWidth: 1, borderColor: T.line,
    alignItems: "center", justifyContent: "center",
    backgroundColor: T.ink,
  },
  cornerGlyph: { fontFamily: F.mono, fontSize: 16, color: T.mute, lineHeight: 20 },

  facts: { flexDirection: "row", gap: 26, marginVertical: 10 },
  fact: { alignItems: "flex-start" },
  factN: {
    fontFamily: F.display, fontWeight: "900", fontSize: 26, color: T.chalk,
    fontVariant: ["tabular-nums"], lineHeight: 29,
  },
  factL: {
    fontFamily: F.mono, fontSize: 9, letterSpacing: 1.4, color: T.mute,
    textTransform: "uppercase", marginTop: 3,
  },

  stepRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 16 },
  step: {
    fontFamily: F.mono, fontSize: 10, letterSpacing: 1.6, color: T.mute,
    textTransform: "uppercase",
  },
  hair: { flex: 1, height: 1, backgroundColor: T.line },
  stepSub: { fontFamily: F.body, fontSize: 13, lineHeight: 19, color: T.mute, marginTop: 5 },
});
