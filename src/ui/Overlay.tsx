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

function Screen({ eyebrow, title, children, gold }: {
  eyebrow: string; title: string; children: React.ReactNode; gold?: boolean;
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
      <Body index={1}>An arena shooter where your past selves fight beside you.</Body>
      <Rise index={2} style={styles.rules}>
        <Rule tint={T.film} title="You.">
          You move. The gun aims and fires on its own.
        </Rule>
        <Rule tint={T.leaf} title="Your dittos.">
          Every round is recorded and replayed the next round, fighting on your side.
          Go down early and you get a short ditto — forever.
        </Rule>
        <Rule tint={T.ember} title="The waves.">
          Every level you play adds its wave to the fight. 100 levels in blocks of
          ten: each tenth is a boss deathmatch, and clearing it wipes every enemy
          away — a fresh cast and new blooms for the next ten. Your dittos keep coming.
        </Rule>
      </Rise>
      <Rise index={3}>
        <Text style={styles.note}>
          Drag anywhere to move. Stand in a <Text style={styles.strong}>bloom</Text> for
          faster fire or a triple shot — they land in the same places every level, and
          your dittos pick them up too.
        </Text>
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
        <Text style={styles.strong}>{title}</Text> {children}
      </Text>
    </View>
  );
}

export function BoonScreen({ round, boss, final, build, onPick }: {
  round: number; boss: boolean; final: boolean;
  build: Record<string, number | undefined>;
  onPick: (b: Boon) => void;
}) {
  // three of the five, drawn fresh each level
  const pick = useMemo(() => {
    const pool = BOONS.slice(), out: Boon[] = [];
    while (out.length < 3 && pool.length)
      out.push(pool.splice((Math.random() * pool.length) | 0, 1)[0]);
    return out;
  }, [round]);

  return (
    <Screen
      eyebrow={`Level ${round} of ${MAX_ROUNDS}${final ? " · the last one" : boss ? " · deathmatch" : ""}`}
      title="Pick a boon"
      gold={boss}
    >
      <Body index={1}>
        {final
          ? "Last pick of the run. Spend it on holding the arena."
          : "Small, and permanent. It shapes the level you are about to play, and **the ditto it records keeps it forever**."}
      </Body>
      {pick.map((b, i) => {
        const have = build[b.id] || 0;
        return (
          <Card key={b.id} index={2 + i} onPress={() => onPick(b)}>
            <View style={[styles.dot, { backgroundColor: `hsl(${b.hue},72%,64%)` }]} />
            <View style={styles.cardText}>
              <Text style={styles.cardTitle}>{b.name}{have ? ` ×${have + 1}` : ""}</Text>
              <Text style={styles.cardSub}>{b.desc}</Text>
            </View>
          </Card>
        );
      })}
    </Screen>
  );
}

export function EndScreen({ round, reason, ghost, ghosts, popped, onNext, onRestart }: {
  round: number;
  reason: string;
  ghost: Ghost;
  ghosts: Ghost[];
  popped: number;
  onNext: () => void;
  onRestart: () => void;
}) {
  const wipes = round % 10 === 0;
  const nextIsBoss = (round + 1) % 10 === 0;
  const body = wipes
    ? "Every wave you have been fighting is wiped — **a fresh cast of enemies** for the next ten levels, and blooms in new places. **Your dittos stay**; they just have nothing left to fight from before, so the next ten levels build a new set for them."
    : ghost.full
      ? `A full recording. This ditto fights the whole level at **level ${ghost.level}** size and firepower, frozen there forever — and that level's wave comes back with it.` +
        (nextIsBoss
          ? round + 1 === MAX_ROUNDS
            ? " **Next is level 100** — no clock, and the run ends there one way or the other."
            : " **Next is a deathmatch** — no clock, it runs until one team is wiped, and clearing it wipes the board."
          : "")
      : "You went down early, so this ditto only fights for **part** of every future level — but that level's wave still shows up in full." +
        (nextIsBoss ? " **Next is a deathmatch** — no clock, and clearing it wipes the board." : "");

  return (
    <Screen
      eyebrow={`Level ${round} of ${MAX_ROUNDS} · ${popped} popped · ${Math.min(DITTO_CAP, ghosts.length + 1)} fielded`}
      title={reason === "cleared" ? "Deathmatch won" : ghost.full ? "Level survived" : "You got popped"}
      gold={reason === "cleared"}
    >
      <Body index={1}>{body}</Body>
      <GhostCard g={ghost} fresh index={2} />
      <Squad ghosts={ghosts} label="Squad so far" index={3} />
      <Act
        index={4}
        label={
          wipes ? `New enemies · level ${round + 1}`
            : nextIsBoss ? "Enter the deathmatch"
              : `Start level ${round + 1}`
        }
        onPress={onNext}
      />
      <Act label="Restart run" onPress={onRestart} ghost index={5} />
    </Screen>
  );
}

export function FinishScreen({ round, won, ghosts, popped, standing, onAgain }: {
  round: number; won: boolean; ghosts: Ghost[];
  popped: number; standing: number; onAgain: () => void;
}) {
  return (
    <Screen
      eyebrow={`Level ${round} of ${MAX_ROUNDS} · ${popped} popped this run`}
      title={won ? "You held the arena" : "Your team was wiped out"}
      gold={won}
    >
      <Body index={1}>
        {won
          ? `All **${MAX_ROUNDS} levels**, and **${ghosts.length} dittos** behind you. Every wave any of you ever fought came back at once, and every one of them is gone.`
          : `Level **${round}** outlasted your whole team, with **${standing}** still standing.`}
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
    fontFamily: F.mono, fontSize: 10, letterSpacing: 1.6, color: T.mute,
    textTransform: "uppercase", marginBottom: 8,
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
});
