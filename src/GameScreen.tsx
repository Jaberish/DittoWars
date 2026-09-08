import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Platform, View, useWindowDimensions } from "react-native";
import { Canvas, Picture, createPicture, type SkPicture } from "@shopify/react-native-skia";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { DASH_CD, INTRO_HOLD, INTRO_LIFT, type Boon } from "./engine/constants";
import { audio } from "./engine/audio";
import { install as installDevtools } from "./devtools";
import { countRun, loadRuns, nextIsFlipped } from "./orientation";
import { Game } from "./engine/world";
import type { Phase } from "./engine/types";
import { Renderer, layoutFor } from "./render/draw";
import { AbilityPad, Joystick, STICK_R, type Stick } from "./ui/Controls";
import { Hud, type HudValues } from "./ui/Hud";
import { LevelBackdrop } from "./ui/LevelBackdrop";
import { EndScreen, FinishScreen, MenuScreen } from "./ui/Overlay";
import { T, fill } from "./ui/theme";

const STEP = 1 / 60;

export function GameScreen() {
  const { width: vw, height: vh } = useWindowDimensions();
  const [phase, setPhase] = useState<Phase>("menu");
  const [popped, setPopped] = useState(0);
  const [muted, setMuted] = useState(false);
  const [pipHues, setPipHues] = useState<number[]>([]);
  const [intro, setIntro] = useState(0);

  // The Picture node wants a picture, never null, so both start empty.
  const blank = useMemo(() => createPicture(() => {}), []);
  const worldPic = useSharedValue<SkPicture>(blank);
  const floorPic = useSharedValue<SkPicture>(blank);
  const shake = useSharedValue(0);

  const hud: HudValues = {
    hp: useSharedValue(1),
    pips: useSharedValue(0),
    cdDash: useSharedValue(0),
    cdPop: useSharedValue(0),
  };
  const stick: Stick = {
    x: useSharedValue(0), y: useSharedValue(0),
    ox: useSharedValue(0), oy: useSharedValue(0), on: useSharedValue(0),
  };

  const renderer = useRef(new Renderer()).current;
  const lastFloor = useRef<SkPicture | null>(null);
  const keys = useRef<Record<string, boolean>>({}).current;

  const game = useMemo(
    () =>
      new Game({
        sfx: (n) => audio.play(n),
        haptic: (w) => audio.haptic(w),
        onPhase: (p) => setPhase(p),
      }),
    [],
  );

  /* ---------- input ---------- */

  // The engine reads the screen size through a ref, so it is never a render behind.
  const size = useRef<[number, number]>([vw, vh]);
  size.current = [vw, vh];

  useEffect(() => {
    game.setViewport(() => size.current);
    game.setInput(() => {
      let dx = 0, dy = 0;
      if (keys.a || keys.arrowleft) dx -= 1;
      if (keys.d || keys.arrowright) dx += 1;
      if (keys.w || keys.arrowup) dy -= 1;
      if (keys.s || keys.arrowdown) dy += 1;
      dx += stick.x.value;
      dy += stick.y.value;
      const m = Math.hypot(dx, dy);
      return m > 1 ? [dx / m, dy / m] : [dx, dy];
    });
  }, [game, keys, stick]);

  // A keyboard makes the web build playable and makes testing on a laptop bearable.
  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    const down = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      keys[k] = true;
      if (k === " " || k.startsWith("arrow")) e.preventDefault();
      if (k === " ") game.doDash();
      if (k === "e") game.doPop();
    };
    const up = (e: KeyboardEvent) => { keys[e.key.toLowerCase()] = false; };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [game, keys]);

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .onBegin((e) => {
          "worklet";
          stick.ox.value = e.x;
          stick.oy.value = e.y;
          stick.x.value = 0;
          stick.y.value = 0;
          stick.on.value = withTiming(1, { duration: 110 });
        })
        .onUpdate((e) => {
          "worklet";
          const dx = e.translationX, dy = e.translationY;
          const m = Math.hypot(dx, dy);
          const k = m > STICK_R ? STICK_R / m : 1;
          stick.x.value = (dx * k) / STICK_R;
          stick.y.value = (dy * k) / STICK_R;
        })
        .onFinalize(() => {
          "worklet";
          stick.x.value = 0;
          stick.y.value = 0;
          stick.on.value = withTiming(0, { duration: 160 });
        }),
    [stick],
  );

  /* ---------- the loop ---------- */

  useEffect(() => {
    audio.init();
    loadRuns();
    return () => audio.dispose();
  }, []);

  useEffect(() => {
    let raf = 0, last = 0, acc = 0, hudAcc = 0;

    const frame = (ts: number) => {
      raf = requestAnimationFrame(frame);
      if (!last) last = ts;
      const dt = Math.min(0.05, (ts - last) / 1000);
      last = ts;

      const R = game.R;
      if (!R) return;

      if (game.phase === "playing" || game.phase === "intro") {
        acc += dt;
        let guard = 0;
        while (acc >= STEP && guard++ < 8 &&
          (game.phase === "playing" || game.phase === "intro")) {
          acc -= STEP;
          game.step(STEP);
        }
        if (acc > 0.5) acc = 0;
      }

      // the same live source the engine sizes the arena from, so the two cannot
      // disagree about how big the screen is
      const [lw, lh] = size.current;
      const lay = layoutFor(lw, lh, R.W, R.H);
      const fp = renderer.floor(game, lay);
      if (fp !== lastFloor.current) { lastFloor.current = fp; floorPic.value = fp; }
      worldPic.value = renderer.world(game, lay);
      shake.value = R.shake;

      const p = R.player;
      hud.hp.value = Math.max(0, p.hp / p.max);
      hud.cdDash.value = p.dashCd / DASH_CD;
      hud.cdPop.value = p.novaCd / p.st.novaCd;
      let mask = 0;
      for (let i = 1; i < R.units.length && i <= 32; i++)
        if (R.units[i].alive) mask |= 1 << (i - 1);
      hud.pips.value = mask;

      // The counter is text, so it rides React rather than the UI thread. Eight
      // updates a second reads as live and costs nothing.
      hudAcc += dt;
      if (hudAcc > 0.125) { hudAcc = 0; setPopped(game.run.popped); }
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [game, renderer, floorPic, worldPic, shake, hud]);

  /* ---------- shake ---------- */

  const shakeStyle = useAnimatedStyle(() => {
    const s = shake.value;
    if (s <= 0.05) return { transform: [{ translateX: 0 }, { translateY: 0 }] };
    return {
      transform: [
        { translateX: (Math.random() - 0.5) * s },
        { translateY: (Math.random() - 0.5) * s },
      ],
    };
  });

  /* ---------- transitions ---------- */

  /** Everything the view has to refresh once a round is on the board. */
  const afterStart = useCallback(() => {
    // A round can end with a finger still down; without this the next one opens
    // with the player already walking.
    stick.x.value = 0;
    stick.y.value = 0;
    stick.on.value = 0;
    setPipHues(game.R!.units.slice(1).map((u) => u.hue));
    setIntro((n) => n + 1);
  }, [game, stick]);

  const start = useCallback(() => {
    audio.init();
    audio.play("ui");
    game.startRound();
    afterStart();
  }, [game, afterStart]);

  useEffect(() => {
    installDevtools(game, stick, afterStart);
  }, [game, stick, afterStart]);

  /** Pressing Start is what begins a run, and what decides which way up it plays. */
  const beginRun = useCallback(() => {
    game.newRun();
    game.flipped = nextIsFlipped();
    countRun();
    start();
  }, [game, start]);

  const newRun = useCallback(() => {
    audio.play("ui");
    game.newRun();
    game.setPhase("menu");
  }, [game]);

  const boss = game.isBoss();
  const final = game.isFinal();

  return (
    <View style={{ flex: 1, backgroundColor: T.void }}>
      <GestureDetector gesture={pan}>
        <Animated.View style={[fill, shakeStyle]}>
          <Canvas style={fill}>
            <Picture picture={floorPic} />
          </Canvas>
          {intro > 0 && (phase === "intro" || phase === "playing") && (
            <LevelBackdrop
              key={intro}
              round={game.run.round}
              boss={boss}
              final={final}
              vw={vw}
              vh={vh}
            />
          )}
          <Canvas style={fill}>
            <Picture picture={worldPic} />
          </Canvas>
        </Animated.View>
      </GestureDetector>

      {(phase === "intro" || phase === "playing") && (
        <>
          <Joystick s={stick} />
          <Hud
            v={hud}
            round={game.run.round}
            kind={final ? "Final" : boss ? "Deathmatch" : "Level"}
            boss={boss}
            popped={popped}
            lives={game.run.lives}
            pipHues={pipHues}
            muted={muted}
            onMute={() => {
              audio.muted = !audio.muted;
              setMuted(audio.muted);
              if (!audio.muted) audio.play("ui");
            }}
          />
          <AbilityPad
            cdDash={hud.cdDash}
            cdPop={hud.cdPop}
            onDash={() => game.doDash()}
            onPop={() => game.doPop()}
          />
        </>
      )}

      {phase === "menu" && <MenuScreen onStart={beginRun} />}

      {phase === "end" && (
        <EndScreen
          round={game.run.round}
          reason={game.R!.reason}
          ghost={game.pendingGhost}
          ghosts={game.run.ghosts}
          popped={game.R!.popped}
          lives={game.run.lives}
          canRetry={game.canRetry()}
          boss={boss}
          final={final}
          build={game.run.build}
          onAdvance={(b: Boon) => {
            audio.play("ui");
            game.advance(b.id);
            afterStart();
          }}
          onRetry={() => {
            audio.play("ui");
            game.retry();
            afterStart();
          }}
          onRestart={newRun}
        />
      )}

      {phase === "finish" && (
        <FinishScreen
          round={game.run.round}
          won={game.R!.reason === "cleared"}
          ghosts={game.run.ghosts}
          popped={game.run.popped}
          standing={game.R!.enemies.length}
          onAgain={newRun}
        />
      )}
    </View>
  );
}
