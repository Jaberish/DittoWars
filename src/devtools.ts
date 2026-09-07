import { BOONS, BOSS_EVERY, REC_DT, ROUND_TIME } from "./engine/constants";
import { mkRng } from "./engine/rng";
import type { Ghost } from "./engine/types";
import { Game } from "./engine/world";
import type { Stick } from "./ui/Controls";

/**
 * Development affordances, stripped from release bundles by the `__DEV__` guard in
 * `install`. The engine can already be exercised headlessly (`npm run sim`); this
 * is the counterpart for the renderer, so any level can be put on screen — a field
 * of eighteen dittos, a boss, a hundredth-level arena — without playing there.
 *
 *   __ditto.jump(50)     // level 50, with a plausible squad already earned
 *   __ditto.game         // the live Game instance
 */
function fakeGhost(round: number, game: Game, build: Record<string, number>): Ghost {
  const [aw, ah] = game.arenaSize(round);
  const rng = mkRng(round * 7717 + 13);
  const pts: number[] = [];
  // a lissajous stroll around the arena: not a real run, but the same shape of one
  const ax = 0.18 + rng() * 0.2, ay = 0.18 + rng() * 0.2;
  const fx = 0.6 + rng() * 1.4, fy = 0.6 + rng() * 1.4, ph = rng() * 6.28;
  for (let t = 0; t <= ROUND_TIME; t += REC_DT) {
    pts.push(aw * (0.5 + Math.sin(t * fx + ph) * ax));
    pts.push(ah * (0.5 + Math.cos(t * fy) * ay));
  }
  return {
    pts, events: [], round, level: round, aw, ah,
    build: { ...build }, dur: (pts.length / 2 - 1) * REC_DT,
    full: true, hue: Game.ghostHue(round),
  };
}

export function install(game: Game, stick: Stick, onJump: () => void) {
  if (!__DEV__) return;
  const g = globalThis as unknown as Record<string, unknown>;
  g.__ditto = {
    game,
    /** Live stick, for checking that touch input actually reaches the sim. */
    stick: () => ({ x: stick.x.value, y: stick.y.value, on: stick.on.value }),
    input: () => game["input"](),
    jump(level: number) {
      game.newRun();
      const build: Record<string, number> = {};
      for (let r = 1; r < level; r++) {
        game.run.round = r;
        game.run.ghosts.push(fakeGhost(r, game, build));
        const b = BOONS[(r * 3) % BOONS.length];
        build[b.id] = (build[b.id] || 0) + 1;
      }
      game.run.build = build;
      game.run.round = level;
      game.startRound();
      onJump();
      return `level ${level} · ${game.run.ghosts.length} dittos · ` +
        `${game.R!.units.length - 1} fielded · ` +
        `${game.R!.waves.length} waves · ` +
        `${game.isBoss() ? "deathmatch" : "timed"} · ` +
        `block cast: ${game.R!.typeSet.join(", ")}`;
    },
    /** Fast-forward the current round without waiting for it in real time. */
    skip(seconds: number) {
      const n = Math.round(seconds * 60);
      for (let i = 0; i < n && (game.phase === "playing" || game.phase === "intro"); i++)
        game.step(1 / 60);
      const R = game.R!;
      return `t=${R.t.toFixed(1)}s enemies=${R.enemies.length} ` +
        `bullets=${R.bullets.length} fx=${R.fx.length} hp=${R.player.hp.toFixed(1)}`;
    },
    block: BOSS_EVERY,
  };
}
