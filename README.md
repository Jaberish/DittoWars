# Ditto Wars

An arena shooter where your past selves fight beside you. You control movement and
abilities; the gun aims and fires on its own. Every round is recorded, and every
recording comes back the next round as a **ditto** — a green ghost of you, frozen at
the size, firepower and boons you had when it was made, fighting on your side. A
hundred levels, in blocks of ten, each tenth an untimed deathmatch.

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
| `npm run sfx` | re-bake `assets/sfx` from the synthesis recipes |

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

**Recording, not input replay.** A ditto stores positions at 20 Hz plus the beats
where it used an ability. Replaying inputs would desync immediately, because the
world it plays into is not the world it was recorded in.

**Seeded waves.** A wave is fully determined by its level number, so a replayed wave
brings back the same creatures in the same order it brought the first time. Blooms
are fixed for a block of ten levels, and there is exactly one bomber run in the whole
game, generated from one seed and flown identically from level 4 onward. The déjà vu
is structural, not decorative.

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
