import { Platform } from "react-native";
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from "expo-audio";
import * as Haptics from "expo-haptics";
import type { SfxName } from "./types";

/**
 * Sound is baked, not synthesised: `npm run sfx` renders assets/sfx from the same
 * oscillator recipes the web build used live. Each clip gets a small pool of
 * players so overlapping shots layer instead of cutting each other off.
 */
const SOURCES: Record<SfxName, number> = {
  shoot: require("../../assets/sfx/shoot.wav"),
  pop: require("../../assets/sfx/pop.wav"),
  hurt: require("../../assets/sfx/hurt.wav"),
  dash: require("../../assets/sfx/dash.wav"),
  doze: require("../../assets/sfx/doze.wav"),
  crush: require("../../assets/sfx/crush.wav"),
  nova: require("../../assets/sfx/nova.wav"),
  bloom: require("../../assets/sfx/bloom.wav"),
  bloom3: require("../../assets/sfx/bloom3.wav"),
  mine: require("../../assets/sfx/mine.wav"),
  boom: require("../../assets/sfx/boom.wav"),
  ui: require("../../assets/sfx/ui.wav"),
  round: require("../../assets/sfx/round.wav"),
  form: require("../../assets/sfx/form.wav"),
  win: require("../../assets/sfx/win.wav"),
  lose: require("../../assets/sfx/lose.wav"),
};

/** Voices per clip, and the shortest gap between two of them. */
const VOICES: Partial<Record<SfxName, number>> = { shoot: 4, pop: 5, mine: 3, crush: 3 };
const GAP: Partial<Record<SfxName, number>> = { shoot: 70, pop: 45, mine: 60, crush: 60 };
const LEVEL: Partial<Record<SfxName, number>> = {
  shoot: 0.22, pop: 0.3, mine: 0.28, crush: 0.4, hurt: 0.7, boom: 0.6,
  doze: 0.55, nova: 0.6, form: 0.5, round: 0.6, win: 0.7, lose: 0.7,
};

type Pool = { players: AudioPlayer[]; next: number; last: number };

class Audio {
  private pools = new Map<SfxName, Pool>();
  private ready = false;
  muted = false;

  async init() {
    if (this.ready) return;
    this.ready = true;
    try {
      // Play through the silent switch and alongside other audio: this is a game,
      // not a music app, and it should never seize the session.
      await setAudioModeAsync({
        playsInSilentMode: true,
        shouldPlayInBackground: false,
        interruptionMode: "mixWithOthers",
      });
    } catch {
      /* an unavailable audio session is not a reason to stop the game */
    }
    for (const key of Object.keys(SOURCES) as SfxName[]) {
      const n = VOICES[key] ?? 1;
      const players: AudioPlayer[] = [];
      for (let i = 0; i < n; i++) {
        try {
          const pl = createAudioPlayer(SOURCES[key]);
          pl.volume = LEVEL[key] ?? 0.5;
          players.push(pl);
        } catch {
          /* skip a clip that will not load rather than fail the whole set */
        }
      }
      if (players.length) this.pools.set(key, { players, next: 0, last: 0 });
    }
  }

  play(name: SfxName) {
    if (this.muted || !this.ready) return;
    const pool = this.pools.get(name);
    if (!pool) return;
    const now = Date.now();
    const gap = GAP[name];
    // Ten shooters would otherwise be a drone rather than a rhythm.
    if (gap && now - pool.last < gap) return;
    pool.last = now;
    const pl = pool.players[pool.next];
    pool.next = (pool.next + 1) % pool.players.length;
    try {
      pl.seekTo(0);
      pl.play();
    } catch {
      /* a voice that refuses to restart simply drops this hit */
    }
  }

  haptic(weight: "light" | "medium" | "heavy") {
    if (this.muted || Platform.OS === "web") return;
    const style =
      weight === "heavy" ? Haptics.ImpactFeedbackStyle.Heavy
        : weight === "medium" ? Haptics.ImpactFeedbackStyle.Medium
          : Haptics.ImpactFeedbackStyle.Light;
    Haptics.impactAsync(style).catch(() => {});
  }

  dispose() {
    for (const pool of this.pools.values())
      for (const pl of pool.players) { try { pl.remove(); } catch { /* already gone */ } }
    this.pools.clear();
    this.ready = false;
  }
}

export const audio = new Audio();
