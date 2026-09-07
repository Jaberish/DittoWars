import { Game } from "../src/engine/world";
import { BOONS } from "../src/engine/constants";

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
    if (g.phase === "playing") {
      if (R.player.novaCd <= 0 && R.enemies.length > 3) g.doPop();
      if (R.player.dashCd <= 0 && Math.random() < 0.02) g.doDash();
    }
    g.step(STEP);
    totalFrames++;
    if (g.R) peakField = Math.max(peakField, g.R.enemies.length);
  }
}

for (let lv = 1; lv <= LEVELS; lv++) {
  g.startRound();
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
    `popped=${String(R.popped).padStart(4)}`;
  console.log(line + (g.isBoss() ? "  ← DEATHMATCH" : ""));
  if (g.phase === "finish") { console.log("RUN OVER at level " + g.run.round); break; }
  g.acceptGhost();
  // take a boon like a player would: whatever is offered first
  const pick = BOONS[(lv * 3) % BOONS.length];
  g.run.build[pick.id] = (g.run.build[pick.id] || 0) + 1;
  g.phase = "boons";
}
console.log("\npeak field =", peakField, " frames =", totalFrames,
            " build =", Game.buildLabel(g.run.build));
