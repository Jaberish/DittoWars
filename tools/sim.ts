import { Game } from "../src/engine/world";
import { ROUND_TIME } from "../src/engine/constants";

const g = new Game({ sfx: () => {}, haptic: () => {}, onPhase: () => {} });
g.setViewport(() => [390, 780]);
g.newRun();

let dir: [number, number] = [0, 0];
g.setInput(() => dir);

const STEP = 1 / 60;
const LEVELS = Number(process.argv[2] || 25);
let peakField = 0, totalFrames = 0;

function pumpRound() {
  const R = g.R!;
  let guard = 0;
  // walk a lazy circle so the recording is a real path, and pop on cooldown
  while (g.phase === "intro" || g.phase === "playing") {
    if (guard++ > 60 * 400) throw new Error("round never ended at level " + g.run.round);
    const t = R.t;
    dir = [Math.cos(t * 0.7), Math.sin(t * 0.9)];
    const p = R.player;

    // Step out of a sweep's lane. A player can react to this; a recording cannot,
    // which is the whole point of the hazard — so the bot has to react too or the
    // measurement is of something no one will ever play.
    const sw = R.sweep;
    if (sw && p.alive) {
      const c = sw.horiz ? p.x : p.y;
      const span = sw.horiz ? R.W : R.H;
      const close = Math.abs(c - sw.pos);
      // dash over the band when it is about to reach you, walk clear otherwise
      if (sw.warn <= 0 && close < sw.width * 0.75 + p.r) g.doDash();
      if (close < sw.width * 1.4 + p.r) {
        const away = c < span / 2 ? -1 : 1;
        dir = sw.horiz ? [away, dir[1] * 0.3] : [dir[0] * 0.3, away];
      }
    } else if (p.alive && R.pickups.length) {
      // and walk out to the wall for relief when it is worth the trip
      const want = p.hp < p.max * 0.7;
      const pk = R.pickups.find((q) => want || q.kind === "shield");
      if (pk) {
        const dx = pk.x - p.x, dy = pk.y - p.y, m = Math.hypot(dx, dy) || 1;
        dir = [dx / m, dy / m];
      }
    }
    if (g.phase === "playing") {
      if (R.player.novaCd <= 0 && R.enemies.length > 3) g.doPop();
      if (R.player.dashCd <= 0 && Math.random() < 0.02) g.doDash();
    }
    g.step(STEP);
    totalFrames++;
    if (g.R) peakField = Math.max(peakField, g.R.enemies.length);
  }
}

let attempts = 0;
// One retry per level. The board is deterministic, so a bot that plays the same way
// gets the same result — banging on the same level four times says nothing.
const retried = new Set<number>();
for (let lv = 1; lv <= LEVELS; lv++) {
  g.startRound();
  attempts++;
  const R = g.R!;
  const waves = R.waves.map((w) => w.k);
  const fielded = R.units.length - 1;
  pumpRound();
  const line =
    `L${String(g.run.round).padStart(3)} ` +
    `dittos=${String(g.run.ghosts.length).padStart(2)} ` +
    `fielded=${String(fielded).padStart(2)} ` +
    `waves=[${waves[0]}..${waves[waves.length - 1]}](${waves.length}) ` +
    `t=${R.t.toFixed(1).padStart(5)}s ` +
    `reason=${R.reason.padEnd(9)} ` +
    `left=${String(R.enemies.length).padStart(3)} ` +
    `popped=${String(R.popped).padStart(4)}` +
    // killed, not merely finished: a recording that ran out is not a casualty
    `  killed=${String(R.units.filter((u, n) => n > 0 && !u.alive && !u.expired).length).padStart(2)}` +
    `/${fielded}`;
  console.log(line + `  lives=${g.run.lives}` + (g.isBoss() ? "  ← DEATHMATCH" : ""));
  if (g.phase === "finish") { console.log("RUN OVER at level " + g.run.round); break; }
  const fresh = !retried.has(g.run.round);
  if (!g.pendingGhost) {
    // a wipe leaves nothing to keep, so the only way on is another attempt
    if (!g.canRetry() || !fresh) { console.log("OUT OF LIVES at level " + g.run.round); break; }
    retried.add(g.run.round);
    g.retry();
    lv--;
    continue;
  }
  // A life is worth most here: a ditto cut off early is a handicap for the rest of
  // the run, so spend one rather than carry a stump forever.
  if (fresh && g.canRetry() && !g.pendingGhost.full &&
    g.pendingGhost.dur < ROUND_TIME * 0.55) {
    retried.add(g.run.round);
    g.retry();
    lv--;
    continue;
  }
  // take a boon the way the screen would offer it: only what the lead cap allows
  const offered = Game.offerable(g.run.build);
  g.advance(offered[(lv * 3) % offered.length].id);
}
console.log(`\npeak field = ${peakField}  frames = ${totalFrames}  attempts = ${attempts}` +
  `  lives left = ${g.run.lives}  build = ${Game.buildLabel(g.run.build)}`);
