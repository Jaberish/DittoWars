import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "dittowars.best";

export interface Best {
  score: number;
  level: number;
}

/**
 * The best run this device has seen.
 *
 * Written on every level end rather than only when a run finishes, so a run that is
 * abandoned still counts for what it actually cleared. Falls back to memory if the
 * device refuses to store anything, which still holds for the session.
 */
let best: Best = { score: 0, level: 0 };
let loaded = false;

export async function loadBest(): Promise<Best> {
  if (loaded) return best;
  loaded = true;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) {
      const v = JSON.parse(raw) as Partial<Best>;
      if (typeof v.score === "number" && typeof v.level === "number") best = v as Best;
    }
  } catch {
    /* first launch, or a device that will not keep anything */
  }
  return best;
}

export function getBest(): Best {
  return best;
}

/** Returns true when this run has just become the best one. */
export function submit(score: number, level: number): boolean {
  if (score <= best.score) return false;
  best = { score, level };
  AsyncStorage.setItem(KEY, JSON.stringify(best)).catch(() => {});
  return true;
}
