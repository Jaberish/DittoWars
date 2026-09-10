import React, { useEffect, useMemo, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence,
  withSpring, withTiming,
} from "react-native-reanimated";
import { BOONS, DITTO_CAP, MAX_ROUNDS, type Boon } from "../engine/constants";
import type { Ghost } from "../engine/types";
import { Game } from "../engine/world";
import { getBest, loadBest, type Best } from "../highscore";
import { EnemyGallery } from "./EnemyGallery";
import { MenuDiagram } from "./MenuDiagram";
import { F, T, fill } from "./theme";
import { BoonIcon, MenuIcon, SoundIcon } from "./Icon";

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

/**
 * One boon, said plainly: what it does, what it costs, and the number this pick is
 * actually worth. Compact enough that three of them sit in thumb reach at the bottom
 * of the screen, which is where a choice you make every single level belongs.
 */
function BoonRow({ boon, have, gain, cost, onPress }: {
  boon: Boon; have: number; gain: string; cost: string; onPress: () => void;
}) {
  const press = useSharedValue(0);
  const s = useAnimatedStyle(() => ({ transform: [{ scale: 1 - press.value * 0.02 }] }));
  const tint = `hsl(${boon.hue},72%,66%)`;
  return (
    <Pressable
      onPressIn={() => { press.value = withSpring(1, { damping: 16, stiffness: 400 }); }}
      onPressOut={() => { press.value = withSpring(0); }}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${boon.name}. ${boon.desc}. ${gain}, ${cost}`}
    >
      <Animated.View style={[styles.boon, s]}>
        <BoonIcon id={boon.id} tint={tint} size={24} />
        <View style={styles.boonText}>
          <Text style={styles.boonName}>
            {boon.desc}
            {have ? <Text style={styles.boonHave}>{`  ${boon.name} ×${have + 1}`}</Text> : null}
          </Text>
        </View>
        {/* what it gives over what it takes, stacked, so the trade reads as one thing */}
        <View style={styles.boonTrade}>
          <Text style={[styles.boonGain, { color: tint }]}>{gain}</Text>
          <Text style={styles.boonCost}>{cost}</Text>
        </View>
      </Animated.View>
    </Pressable>
  );
}

function Act({ label, onPress, ghost, index, big }: {
  label: string; onPress: () => void; ghost?: boolean; index: number; big?: boolean;
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
        <Animated.View style={[styles.act, big && styles.actBig, ghost && styles.actGhost, s]}>
          <Text style={[styles.actLabel, big && styles.actBigLabel, ghost && styles.actGhostLabel]}>
            {label}
          </Text>
        </Animated.View>
      </Pressable>
    </Rise>
  );
}

function Screen({ eyebrow, title, children, footer, gold, onRestart }: {
  eyebrow: string; title: string; children: React.ReactNode;
  footer?: React.ReactNode; gold?: boolean; onRestart?: () => void;
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
      {footer}
      {onRestart && (
        <Pressable
          onPress={onRestart}
          hitSlop={12}
          accessibilityLabel="Menu"
          style={styles.corner}
        >
          <MenuIcon size={17} tint={T.mute} />
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
        <Text style={styles.cardTitle}>{fresh ? "New replay" : `Replay ${g.round}`}</Text>
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
  // Read from the device, which lands a tick after the menu first paints — so it has
  // to be state, not a plain read, or the best run never shows on a cold start.
  const [best, setBest] = useState<Best>({ score: 0, level: 0 });
  useEffect(() => {
    let live = true;
    loadBest().then((b) => { if (live) setBest(b); });
    return () => { live = false; };
  }, []);
  return (
    <Screen
      eyebrow="Arena bubble shooter"
      title="Ditto Wars"
      footer={
        <View style={styles.startBar}>
          {best.score > 0 && (
            <View style={styles.best}>
              <Text style={styles.bestK}>Best</Text>
              <Text style={styles.bestV}>{best.score.toLocaleString()}</Text>
              <View style={styles.bestGap} />
              <Text style={styles.bestK}>Reached</Text>
              <Text style={styles.bestV}>Level {best.level}</Text>
            </View>
          )}
          <Act label="Start game" onPress={onStart} index={0} big />
        </View>
      }
    >
      <Body index={1}>Your past selves fight beside you.</Body>
      <Rise index={2}><MenuDiagram /></Rise>
      <Rise index={3} style={styles.rules}>
        <Rule tint={T.leaf} title="Your replays play on your side" />
      </Rise>
      <Rise index={4}>
        <View style={styles.moves}>
          <Move tint={T.gold} glyph="◎" name="Pop" note="Blast everything near you" />
          <Move tint={T.film} glyph="≫" name="Dash" note="Make a quick dash" />
        </View>
      </Rise>
    </Screen>
  );
}

/** One of the two things you actually press, shown as the button it will be. */
function Move({ tint, glyph, name, note }: {
  tint: string; glyph: string; name: string; note: string;
}) {
  return (
    <View style={styles.move}>
      <View style={[styles.moveBtn, { borderColor: tint }]}>
        <Text style={[styles.moveGlyph, { color: tint }]}>{glyph}</Text>
      </View>
      <View style={styles.moveText}>
        <Text style={styles.moveName}>{name}</Text>
        <Text style={styles.moveNote}>{note}</Text>
      </View>
    </View>
  );
}

function Rule({ tint, title, children }: {
  tint: string; title: string; children?: string;
}) {
  return (
    <View style={styles.rule}>
      <View style={[styles.ruleDot, { backgroundColor: tint }]} />
      <Text style={styles.ruleText}>
        <Text style={styles.strong}>{title}</Text>
        {children ? <Text style={styles.ruleDash}> — </Text> : null}
        {children}
      </Text>
    </View>
  );
}

/**
 * The one setting the game has. It used to sit in the corner of the arena, where it
 * was a permanent button for something you press about twice; behind the pause it
 * costs one extra tap and stops competing with the score for the top of the screen.
 */
function SoundRow({ muted, onPress, index }: {
  muted: boolean; onPress: () => void; index: number;
}) {
  const press = useSharedValue(0);
  const s = useAnimatedStyle(() => ({ transform: [{ scale: 1 - press.value * 0.02 }] }));
  const tint = muted ? T.mute : T.film;
  return (
    <Rise index={index}>
      <Pressable
        onPressIn={() => { press.value = withSpring(1, { damping: 16, stiffness: 400 }); }}
        onPressOut={() => { press.value = withSpring(0); }}
        onPress={onPress}
        accessibilityRole="switch"
        accessibilityState={{ checked: !muted }}
        accessibilityLabel="Sound"
      >
        <Animated.View style={[styles.card, s]}>
          <SoundIcon size={22} tint={tint} off={muted} />
          <View style={styles.cardText}>
            <Text style={styles.cardTitle}>Sound</Text>
            <Text style={styles.cardSub}>Effects and vibration</Text>
          </View>
          <View style={[styles.pill, !muted && { borderColor: T.film }]}>
            <Text style={[styles.pillText, !muted && { color: T.film }]}>
              {muted ? "Off" : "On"}
            </Text>
          </View>
        </Animated.View>
      </Pressable>
    </Rise>
  );
}

/**
 * The round, held.
 *
 * Reached from the arena's one button, and the only screen that interrupts a level
 * rather than following one — so Resume is the big target and leaving is the quiet
 * one, which is the opposite weighting to every other screen here.
 */
export function PauseScreen({ round, score, muted, onMute, onResume, onQuit }: {
  round: number; score: number; muted: boolean;
  onMute: () => void; onResume: () => void; onQuit: () => void;
}) {
  // Already loaded by the time a round is running, but a pause can also be the first
  // thing that asks for it on a hot reload, so it is read the same way the menu does.
  const [best, setBest] = useState<Best>(getBest());
  useEffect(() => {
    let live = true;
    loadBest().then((b) => { if (live) setBest(b); });
    return () => { live = false; };
  }, []);

  // Banked at every level end, so this is the best *completed* run — the level under
  // way is the eyebrow's business, and conflating the two would double-count it.
  const has = best.score > 0;

  return (
    <Screen
      eyebrow={`Level ${round} · ${score.toLocaleString()} score`}
      title="Paused"
      footer={
        <View style={styles.startBar}>
          <Act label="Resume" onPress={onResume} index={0} big />
        </View>
      }
    >
      <Rise index={1}>
        <View style={styles.best}>
          <Text style={styles.bestK}>Best</Text>
          <Text style={styles.bestV}>{has ? best.score.toLocaleString() : "—"}</Text>
          <View style={styles.bestGap} />
          <Text style={styles.bestK}>Reached</Text>
          <Text style={styles.bestV}>{has ? `Level ${best.level}` : "—"}</Text>
        </View>
      </Rise>
      <SoundRow muted={muted} onPress={onMute} index={2} />
      <Act index={3} label="Quit to menu" onPress={onQuit} ghost />
    </Screen>
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
    // only what you are allowed to take: no boon may run far ahead of the rest
    const pool = Game.offerable(build), out: Boon[] = [];
    while (out.length < 3 && pool.length)
      out.push(pool.splice((Math.random() * pool.length) | 0, 1)[0]);
    return out;
  }, [round, reason]);

  const body = reason === "wiped"
    ? "A wipe leaves **no recording**. Spend a life and walk back in."
    : wipes
      ? "The board is wiped — **a fresh cast** for the next ten levels. Your replays stay."
      : ghost?.full
        ? ""
        : "Cut short. This replay only ever fights **part** of a level — spend a life to run it again.";

  const title = reason === "wiped" ? "Your team was wiped out"
    : reason === "cleared" ? "Deathmatch won"
      : ghost?.full ? "Level survived" : "You got popped";

  let i = 1;
  return (
    <Screen
      eyebrow={`Level ${round} · ${popped.toLocaleString()} score · ` +
        `${Math.min(DITTO_CAP, ghosts.length + (ghost ? 1 : 0))} replays · ` +
        `${lives} ${lives === 1 ? "life" : "lives"}`}
      title={title}
      gold={reason === "cleared"}
      onRestart={onRestart}
      footer={ghost ? (
        <View style={styles.footer}>
          <Text style={styles.step}>
            {final ? "One last boon" : `Pick one to start level ${next}`}
          </Text>
          {pick.map((b) => {
            const have = build[b.id] || 0;
            return (
              <BoonRow
                key={b.id}
                boon={b}
                have={have}
                gain={Game.boonGain(b.id, build)}
                cost={Game.boonCost(b.id, build)}
                onPress={() => onAdvance(b)}
              />
            );
          })}
        </View>
      ) : undefined}
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

    </Screen>
  );
}

export function FinishScreen({ round, won, ghosts, popped, standing, onAgain }: {
  round: number; won: boolean; ghosts: Ghost[];
  popped: number; standing: number; onAgain: () => void;
}) {
  // Reaching this screen without a win means the last life is gone.
  if (!won) {
    return (
      <Screen
        eyebrow={`Level ${round} of ${MAX_ROUNDS} · ${popped.toLocaleString()} score`}
        title="Your team was wiped out"
        footer={
          <View style={styles.startBar}>
            <Act label="Back to menu" onPress={onAgain} index={0} big />
          </View>
        }
      >
        <Body index={1}>
          {`Level **${round}** outlasted your whole team, with **${standing}** still standing — and that was the last life.`}
        </Body>
        <Squad ghosts={ghosts} label="Your squad" index={2} />
      </Screen>
    );
  }

  return (
    <Screen
      eyebrow="All one hundred levels"
      title="You held the arena"
      gold
      footer={
        <View style={styles.startBar}>
          <Act label="Back to menu" onPress={onAgain} index={0} big />
        </View>
      }
    >
      <Rise index={1}>
        <View style={styles.trophy}>
          {[
            [popped.toLocaleString(), "score"],
            [String(ghosts.length), "replays"],
            [String(MAX_ROUNDS), "levels"],
          ].map(([n, l]) => (
            <View key={l} style={styles.trophyCell}>
              <Text style={styles.trophyN}>{n}</Text>
              <Text style={styles.trophyL}>{l}</Text>
            </View>
          ))}
        </View>
      </Rise>
      <Body index={2}>
        The last board is clear. **Nothing left standing.**
      </Body>
      <Rise index={3}>
        <View style={styles.stepRow}>
          <Text style={styles.step}>Everything you beat</Text>
          <View style={styles.hair} />
        </View>
      </Rise>
      <Rise index={4}><EnemyGallery /></Rise>
      <Squad ghosts={ghosts} label="Your squad" index={5} />
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
  actBig: { paddingVertical: 20, borderRadius: 16 },
  actBigLabel: { fontSize: 17, letterSpacing: 0.3 },
  actGhost: { backgroundColor: "transparent", borderWidth: 1, borderColor: T.line },

  // The one button that starts everything, kept off the scroll and under the thumb.
  startBar: {
    paddingHorizontal: 22, paddingTop: 10, paddingBottom: 26,
    borderTopWidth: 1, borderTopColor: T.line, backgroundColor: T.void,
    maxWidth: 560, width: "100%", alignSelf: "center",
  },

  moves: { flexDirection: "row", gap: 18, marginVertical: 4 },
  move: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10 },
  moveBtn: {
    width: 38, height: 38, borderRadius: 19, borderWidth: 1.5,
    backgroundColor: T.ink2, alignItems: "center", justifyContent: "center",
  },
  moveGlyph: { fontFamily: F.mono, fontSize: 15, lineHeight: 18 },
  moveText: { flex: 1 },
  moveName: { fontFamily: F.body, fontWeight: "700", fontSize: 13, color: T.chalk },
  moveNote: { fontFamily: F.body, fontSize: 11, lineHeight: 15, color: T.mute },

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

  best: {
    flexDirection: "row", alignItems: "baseline", gap: 8,
    borderWidth: 1, borderColor: T.line, borderRadius: 12,
    paddingVertical: 11, paddingHorizontal: 14, marginBottom: 10,
  },
  bestK: {
    fontFamily: F.mono, fontSize: 9, letterSpacing: 1.4, color: T.mute,
    textTransform: "uppercase",
  },
  bestV: {
    fontFamily: F.body, fontWeight: "700", fontSize: 15, color: T.gold,
    fontVariant: ["tabular-nums"],
  },
  bestGap: { flex: 1 },

  pill: {
    minWidth: 48, borderWidth: 1, borderColor: T.line, borderRadius: 9,
    paddingVertical: 5, paddingHorizontal: 10, alignItems: "center",
  },
  pillText: {
    fontFamily: F.mono, fontSize: 11, letterSpacing: 1.2, color: T.mute,
    textTransform: "uppercase",
  },


  // The choice you make every level, kept where a thumb already is.
  footer: {
    paddingHorizontal: 22, paddingTop: 12, paddingBottom: 26, gap: 8,
    borderTopWidth: 1, borderTopColor: T.line, backgroundColor: T.void,
    maxWidth: 560, width: "100%", alignSelf: "center",
  },
  boon: {
    flexDirection: "row", alignItems: "center", gap: 11,
    backgroundColor: T.ink2, borderRadius: 13, borderWidth: 1, borderColor: "#33415F",
    paddingVertical: 12, paddingHorizontal: 14,
  },
  boonText: { flex: 1 },
  boonTrade: { alignItems: "flex-end", gap: 2 },
  boonName: { fontFamily: F.body, fontWeight: "700", fontSize: 15, color: T.chalk },
  boonHave: { fontFamily: F.mono, fontSize: 11, fontWeight: "400", color: T.mute },
  boonCost: { fontFamily: F.mono, fontSize: 11, color: T.mute, fontVariant: ["tabular-nums"] },
  boonGain: { fontFamily: F.mono, fontSize: 12, fontVariant: ["tabular-nums"] },

  trophy: {
    flexDirection: "row", gap: 10, marginVertical: 8,
  },
  trophyCell: {
    flex: 1, alignItems: "center", paddingVertical: 14,
    borderWidth: 1, borderColor: T.line, borderRadius: 14, backgroundColor: T.ink2,
  },
  trophyN: {
    fontFamily: F.display, fontWeight: "900", fontSize: 24, lineHeight: 27,
    color: T.gold, fontVariant: ["tabular-nums"],
  },
  trophyL: {
    fontFamily: F.mono, fontSize: 9, letterSpacing: 1.3, color: T.mute,
    textTransform: "uppercase", marginTop: 4,
  },

  stepRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 16 },
  step: {
    fontFamily: F.mono, fontSize: 10, letterSpacing: 1.6, color: T.mute,
    textTransform: "uppercase",
  },
  hair: { flex: 1, height: 1, backgroundColor: T.line },
  stepSub: { fontFamily: F.body, fontSize: 13, lineHeight: 19, color: T.mute, marginTop: 5 },
});
