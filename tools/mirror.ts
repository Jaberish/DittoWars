/**
 * Proves that turning the board changes nothing you can measure.
 *
 * A flipped run is played with mirrored input against a mirrored board. If the turn
 * is honest, the two runs are the same run seen upside down: same enemies, same
 * order, same counts, same timings, same distances — and every position in the
 * flipped run is the 180° image of its twin.
 *
 * `Math.random` is seeded identically for both so the incidental jitter (spawn wobble,
 * juke timing) matches and the comparison is exact rather than statistical.
 *
 * Run with `npm run mirror`.
 */
import { Game } from "../src/engine/world";
import { mkRng } from "../src/engine/rng";
import type { RoundState } from "../src/engine/types";

const STEP = 1 / 60;
const LEVELS = Number(process.argv[2] || 6);
const VIEW: [number, number] = [390, 780];

interface Sample {
  t: number;
  enemies: number;
  popped: number;
  hp: number;
  enemyHp: number;
  bullets: number;
  mines: number;
  W: number;
  H: number;
  /** every enemy, sorted, so the two boards can be compared point for point */
  pos: number[];
  bloom: string;
}

function play(flipped: boolean) {
  // one shared stream, reset per run, so both runs draw the same jitter
  const rnd = mkRng(20260907);
  const real = Math.random;
  Math.random = rnd;

  const g = new Game({ sfx: () => {}, haptic: () => {}, onPhase: () => {} });
  g.setViewport(() => VIEW);
  g.flipped = flipped;
  g.newRun();

  let dir: [number, number] = [0, 0];
  g.setInput(() => dir);

  const levels: string[] = [];
  const samples: Sample[] = [];

  for (let lv = 1; lv <= LEVELS; lv++) {
    g.startRound();
    const R = g.R as RoundState;
    let guard = 0, nextSample = 0;
    while (g.phase === "intro" || g.phase === "playing") {
      if (guard++ > 60 * 400) throw new Error("round never ended");
      // the mirrored run walks the mirrored path
      const m = flipped ? -1 : 1;
      dir = [m * Math.cos(R.t * 0.7), m * Math.sin(R.t * 0.9)];
      if (g.phase === "playing" && R.player.novaCd <= 0 && R.enemies.length > 3) g.doPop();
      g.step(STEP);
      if (R.t >= nextSample) {
        nextSample += 1;
        let ehp = 0;
        for (const e of R.enemies) ehp += e.hp;
        const pos = R.enemies
          .map((e) => (flipped ? [R.W - e.x, R.H - e.y] : [e.x, e.y]))
          .sort((u, v) => u[0] - v[0] || u[1] - v[1])
          .flat();
        samples.push({
          t: Math.round(R.t), enemies: R.enemies.length, popped: R.popped,
          hp: R.player.hp, enemyHp: ehp, bullets: R.bullets.length,
          mines: R.mines.length, W: R.W, H: R.H, pos,
          bloom: R.bloom
            ? `${R.bloom.kind}@${(flipped ? R.W - R.bloom.x : R.bloom.x).toFixed(3)},` +
              `${(flipped ? R.H - R.bloom.y : R.bloom.y).toFixed(3)}`
            : "-",
        });
      }
    }
    levels.push(`${R.t.toFixed(2)}|${R.reason}|${R.popped}|${R.enemies.length}`);
    if (g.phase === "finish" || !g.pendingGhost) break;
    g.advance("punch");
  }

  Math.random = real;
  return { levels, samples, W: g.R!.W, H: g.R!.H };
}

/**
 * Positions are compared to a hundredth of an arena unit — around a hundred-thousandth
 * of the arena's width. Exact equality is unreachable and not the point: `W - x` and
 * `x` round differently, so a mirrored run accumulates float noise that no player and
 * no game rule can see. Everything countable is still compared exactly.
 */
const POS_TOLERANCE = 0.01;

const a = play(false);
const b = play(true);

let fails = 0;
const fail = (msg: string) => { console.log("  MISMATCH " + msg); fails++; };

console.log(`${LEVELS} levels, upright vs turned\n`);
console.log("level   time      outcome     popped  left    turned run matches");
for (let i = 0; i < Math.max(a.levels.length, b.levels.length); i++) {
  const same = a.levels[i] === b.levels[i];
  if (!same) fails++;
  const [t, reason, popped, left] = (a.levels[i] ?? "").split("|");
  console.log(
    String(i + 1).padStart(5) + "   " + (t + "s").padStart(7) + "   " +
    (reason ?? "").padEnd(10) + "  " + (popped ?? "").padStart(6) + "  " +
    (left ?? "").padStart(4) + "    " + (same ? "yes" : `NO  ${b.levels[i]}`));
}

// every sampled second must agree, and the crowd's centre must be the mirror image
const n = Math.min(a.samples.length, b.samples.length);
if (a.samples.length !== b.samples.length)
  fail(`sample counts differ (${a.samples.length} vs ${b.samples.length})`);
let worst = 0, compared = 0;
for (let i = 0; i < n; i++) {
  const x = a.samples[i], y = b.samples[i];
  for (const k of ["enemies", "popped", "bullets", "mines"] as const)
    if (x[k] !== y[k]) fail(`${k} at sample ${i}: ${x[k]} vs ${y[k]}`);
  for (const k of ["hp", "enemyHp"] as const)
    if (Math.abs(x[k] - y[k]) > 1e-6) fail(`${k} at sample ${i}: ${x[k]} vs ${y[k]}`);
  if (x.bloom !== y.bloom) fail(`bloom at sample ${i}: ${x.bloom} vs ${y.bloom}`);
  if (x.W !== y.W || x.H !== y.H) fail(`arena at sample ${i}`);
  // both lists are already in upright coordinates, so they should agree point for point
  if (x.pos.length !== y.pos.length) { fail(`enemy list length at sample ${i}`); continue; }
  for (let j = 0; j < x.pos.length; j++) {
    worst = Math.max(worst, Math.abs(x.pos[j] - y.pos[j]));
    compared++;
  }
}

console.log(`\nsampled seconds compared: ${n}`);
console.log(`enemy coordinates compared:  ${compared}`);
console.log(`worst departure from a true 180° image: ${worst.toExponential(2)} units`);
const ok = fails === 0 && worst < POS_TOLERANCE;
console.log(`tolerance:                   ${POS_TOLERANCE} units ` +
  `(${((POS_TOLERANCE / a.W) * 100).toExponential(1)}% of the arena)`);
console.log(ok
  ? "\nIDENTICAL — the turned board is the same board, upside down."
  : `\nFAILED: ${fails} mismatch(es), worst position error ${worst.toExponential(2)}.`);
process.exit(ok ? 0 : 1);
