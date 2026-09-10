# Ditto Wars

An arena shooter where your past selves fight beside you. You control movement and
abilities; the gun aims and fires on its own. Every round is recorded, and every
recording comes back the next round as a **replay** — a green ghost of you, frozen at
the size, firepower and boons you had when it was made, fighting on your side. A
hundred levels, in blocks of ten, each tenth an untimed deathmatch.

Bubbles are thin, and three lives are the whole margin. Spending one runs a level
again as though it never happened — which is how you avoid carrying a replay that was
cut off ten seconds in for the other ninety levels.

React Native (Expo), rendered with Skia. Ported from a single-file HTML/Canvas
prototype with the balance carried over unchanged.

## Running it

```bash
npm install
npm run ios       # or: npm run android
```

Skia is a native module, so **Expo Go will not run this** — you need a development
build (`npx expo run:ios` / `npx expo run:android`, or EAS). `npm run web` works
without a build: Skia falls back to CanvasKit, whose `.wasm` is served from
`public/`.

| Script | What it does |
| --- | --- |
| `npm run ios` / `android` / `web` | start the app |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run sim <levels>` | play N levels headlessly and print the balance table |
| `npm run mirror <levels>` | prove an upside-down run is the same run, exactly |
| `npm run sfx` | re-bake `assets/sfx` from the synthesis recipes |

> The code still calls these `Ghost` and `ditto` throughout — the type, `DITTO_CAP`,
> `GHOST_DMG` and so on. Only what a player reads was renamed; say the word if you
> want the identifiers to follow.

## How it is put together

The simulation has no React and no rendering in it, so it can be run headlessly and
measured. Everything a frame needs to draw is readable off the round state.

```
src/engine/     the game. constants · rng · enemy roster · world (step)
src/render/     Skia. palette · draw (one imperative pass per frame)
src/ui/         React. HUD · controls · level backdrop · overlays
src/GameScreen  assembles the above and owns the loop
tools/sim.ts    headless runner behind `npm run sim`
tools/gen-sfx   offline sound synthesis
```

**The loop.** `requestAnimationFrame` on the JS thread steps the simulation at a
fixed 1/60 and records the frame into an `SkPicture`, which is handed to the UI
thread through a Reanimated shared value — a pointer, not a copy. HUD bars,
cooldowns and screen shake are shared values too, so they animate on the UI thread
without a React render. React state changes only when a screen does.

**Two canvases.** The arena floor is recorded once per level and replayed as a
cached picture; the world is rebuilt every frame. The level numeral is real React
Native type sandwiched between them, which is what puts it *behind* the fight.

**Recording, not input replay.** A replay stores positions at 20 Hz plus the beats
where it used an ability. Replaying inputs would desync immediately, because the
world it plays into is not the world it was recorded in.

**Seeded waves.** A wave is fully determined by its level number, so a replayed wave
brings back the same creatures in the same order it brought the first time. Blooms
are fixed for a block of ten levels, the shells that fall on them are keyed to the
bloom's own position, and there is exactly one bomber run in the whole game,
generated from one seed and flown identically from level 4 onward. The déjà vu is
structural, not decorative.

**Finishing the run opens the bestiary** — every type in the game, drawn by the same
silhouette rules the arena draws by, so you recognise each one from having fought it.

**The best run is kept on the device**, banked at every level end rather than only
when a run finishes — so a run walked away from still counts for what it cleared.

**Alternate runs are played upside down.** Seeded boards keep the difficulty steady
between playthroughs, and also make the second playthrough look like the first. So
every other run turns the whole board through 180° about its centre — enemies,
formations, blooms, the shells that fall on them, the bomber's run. Nothing that can
be measured changes: `npm run mirror` plays one run upright and one turned with
mirrored input and compares them second by second, down to individual enemy
coordinates. The count of runs lives on the device, so the alternation survives
closing the app.

Anything laid out along an axis rather than derived from a position — a sideways
drift, a line of splinters, a ring of shots — needs the half turn applied explicitly;
a direction computed between two mirrored points already has it. That distinction is
what the mirror check exists to police.

**One scale for the whole world.** The arena grows by a fixed 3.5% every round, and everything in the
current round is multiplied by `arenaScale(level)` — you, the wave arriving now, the
shots, the blast radii — so the game keeps the same size on screen however far the
floor has grown. A replay is built from *its own* level instead, which freezes it at
the size it was. Because the growth is proportional rather than a fixed number of
units, that gap never stops widening: a replay eighteen rounds old is 54% of your size
at level twenty and 54% at level ninety, where a fixed step had it drifting back up to
86% by the endgame. Old waves are frozen the same way for the same reason.

**Nothing can move a replay, so the arena moves instead.** A replay is on rails — it
replays a recorded path and no terrain, knockback or wall will push it anywhere. The
only lever on where the squad stands is where *you* stood while it was recording, so
what spreads the team out is anything that pulls you off the middle: the blooms, and
the health and shields that sit against the wall. Walk out to a corner this level and
next level there is a replay in that corner.

**Sweeps are the one thing a recording cannot dodge.** A band crosses part of the
floor, announced before it moves, and takes a bite sized to finish a hurt replay rather
than erase a healthy one. Two ways out: walk clear of the lane — the telegraph marks
the strip and the direction, and there is a 1.79x travel margin to leave it — or dash,
which carries you over the band for half a second against the 0.44 it takes to pass
over you. Nothing about a dash is recorded, so no replay can ever do either: that is
how the crowd thins without anything being arbitrarily deleted.

**You are the only thing playing at full strength.** A replay is a recording and hits
like one, and one player beside eighteen of their own past selves is otherwise a
rounding error — so the living player's shots land at double, a ghost's at 0.45. The
player is about 4.5x the best replay on the field and roughly a quarter of the team's
output, where before it was 1.7x and a tenth.

**No boon may run away from the rest.** One can get at most three stacks ahead of
your weakest, so "damage again" stops being an option long before it stops being
tempting: a player trying to take Punch every level ends up 9/9/9/8/5 and is redirected
31 times in 40. A run has a shape rather than one number going up.

**Boons saturate rather than compound.** Ninety-nine picks of anything multiplicative
runs away with the run, which is why they used to be worth 5% each and feel like
nothing. Each stack now gives a diminishing share of a ceiling: a first Punch is +15%
damage, a seventh +6%, and the total still lands somewhere a level can be balanced
against. The level itself gives less than it used to, so what you picked matters more
than how far you have come — and enemy health carries a quadratic term that pays for
the difference.

**Enemies keep pace with the squad past level thirty.** A team's output grows about
twenty-four times between level twenty and level one hundred while the wave curve
alone grows seven, so the back half of the run was getting steadily easier — measured
at 0.29x the time-to-kill by level 100. A slope from level thirty holds the ratio at
its level-thirty value and does nothing before then. Bosses are excused it: they carry
their own multiplier, and stacking both turned the last fight into a three-minute grind.

**The newest thing in a wave is the hardest.** A wave's roster runs from types you
met in your first ten levels to the one this level just introduced, and toughness is
scaled by how recent a type is *relative to its wave* — so a debut is always the thing
you cannot ignore, without a level's total toughness drifting as the run goes on.

**Waves are thinned to the squad that meets them.** The first ten levels are the only
stretch fought short-handed, and a wave sized for eighteen replays landing on four thin
bubbles is a wall rather than a curve. The thinning stops mattering at level nineteen,
where the squad hits its cap and stays there.

**Nothing sub-pixel gets a slot in the loop.** A body that would land on screen
smaller than two pixels is never created. The threshold is measured against the arena
rather than the device, so a phone and a tablet field exactly the same wave — a
screen-dependent enemy count would make difficulty depend on hardware and would break
the guarantee that a replayed wave is the wave it was.

**Traits, not subclasses.** Forty-one enemy types are rows of data with trait fields
(`charge`, `splits`, `pull`, `phase`, `shield`, …). One behaviour pass reads them,
and one drawing pass turns them into marks, so a new type is a new row.

## Sound

There are no oscillators in React Native, so the WebAudio recipes the prototype
played live are rendered offline into sixteen WAVs (216 KB total) by
`tools/gen-sfx.mjs`. Frequent clips get a pool of voices so overlapping shots layer
instead of cutting each other off.

## Development

In a dev build, `__ditto` is on the global scope (stripped from release by `__DEV__`):

```js
__ditto.jump(70)   // level 70 with a plausible squad already earned
__ditto.skip(12)   // fast-forward twelve seconds of the current round
__ditto.game       // the live instance
```

`npm run sim 100` plays a whole run headlessly and prints where every deathmatch
landed — the fastest way to see whether a balance change broke the late game.
