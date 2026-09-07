import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "dittowars.runs";

/**
 * Which way up the next run is played.
 *
 * Every board in the game comes from a seed, which is what holds the difficulty
 * steady from one playthrough to the next — and also what makes the second
 * playthrough look like the first. So alternate runs are played through a half turn:
 * the same board, upside down. Nothing measurable changes (see `npm run mirror`),
 * but nothing looks where you left it.
 *
 * The count is kept on the device so the alternation survives closing the app. If
 * storage is unavailable it falls back to counting in memory, which still alternates
 * for as long as the app is open.
 */
let runs = 0;
let loaded = false;

export async function loadRuns() {
  if (loaded) return runs;
  loaded = true;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const n = raw === null ? 0 : Number.parseInt(raw, 10);
    if (Number.isFinite(n) && n >= 0) runs = n;
  } catch {
    /* first launch, private mode, a device that refuses to store — count in memory */
  }
  return runs;
}

/** True when the run about to start is played upside down. */
export function nextIsFlipped() {
  return runs % 2 === 1;
}

/** Call as a run begins, not as a level does. */
export function countRun() {
  runs++;
  AsyncStorage.setItem(KEY, String(runs)).catch(() => {});
}

/** For the dev console, so either orientation can be looked at on demand. */
export function setRuns(n: number) {
  runs = n;
}
