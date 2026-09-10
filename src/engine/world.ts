import {
  ARENA_BASE, ARENA_CAP, ARENA_GROWTH, BLOOM_LIFE, BLOOM_MUL, BLOOM_R, BLOOM_SEED,
  BOMB_AT, BOMB_MAX, BOMB_SEED, BOONS, BOON_CEIL, BOON_LEAD, BOON_RATE, BOSS_EVERY,
  BOSS_HP, BULLET_SP, DASH_CD, DASH_INV, DASH_TIME, DITTO_CAP, DM_SPAWN_END, FORM_COST,
  GHOST_DMG, HARD_FROM, HARD_SLOPE, HEAL_FRAC, HP_GHOST, HP_PER_LEVEL, HP_PLAYER,
  INTRO_HOLD, INTRO_LIFT, KNOCK_DECAY, LIFE_EVERY, LIVES, MAX_ROUNDS, MINE_DMG,
  MINE_FUSE, MINE_R, MIN_PX, PICK_CD, PICK_FROM, PICK_INSET, PICK_LIFE, PICK_R,
  PICK_SEED, PLAYER_EDGE, PLAYER_R, REC_DT, REF_PX, ROUND_TIME, SHIELD_TIME, SIEGE_CD,
  SIEGE_FROM, SIEGE_FUSE, SIEGE_OFFSET, SIEGE_R, SIEGE_SEED, SWEEP_BITE, SWEEP_CD,
  SWEEP_CROSS, SWEEP_FROM, SWEEP_LANE, SWEEP_SEED, SWEEP_WARN_LONG, SWEEP_WIDTH, cut,
  sat,
} from "./constants";
import { ETYPES, blockTypes, bossFor, newestTypeAt } from "./enemies";
import { mkRng } from "./rng";
import type { Boon, BoonId } from "./constants";
import {
  FORMS,
  type Build, type Bullet, type Enemy, type Ghost, type Phase, type RoundState,
  type RunState, type SfxName, type Stats, type Unit, type Wave,
} from "./types";

export type InputSource = () => [number, number];

export interface GameHooks {
  sfx: (name: SfxName) => void;
  haptic: (weight: "light" | "medium" | "heavy") => void;
  onPhase: (phase: Phase) => void;
}

const TAU = Math.PI * 2;

/**
 * The whole simulation, with no rendering and no React in it. A frame is
 * `step(dt)`; everything a view needs to draw is readable off `R`.
 */
export class Game {
  run: RunState = { round: 1, ghosts: [], popped: 0, build: {}, lives: LIVES };
  R: RoundState | null = null;
  phase: Phase = "menu";
  private resumeTo: Phase = "playing";
  pendingGhost: Ghost | null = null;
  /**
   * Play this run upside down.
   *
   * Every board in the game is generated from a seed, which is what keeps the skill
   * curve identical from one playthrough to the next — and also what makes a
   * playthrough look like the last one. Turning the whole board through 180° about
   * its centre changes nothing that can be measured: same enemies, same order, same
   * counts, same timings, same distances. It is the one transform that is free.
   *
   * Set per run, never per level: a ditto is recorded against a board and replayed
   * against that same board next level, so the orientation has to hold for the whole
   * run or the recordings stop lining up with what they were recorded against.
   */
  flipped = false;

  private input: InputSource = () => [0, 0];
  /**
   * Read live rather than snapshotted: a round started from a stale copy of the
   * screen size builds the arena in the wrong orientation, and the caller should
   * not have to remember to refresh it first.
   */
  private viewport: () => [number, number] = () => [900, 900];
  private hooks: GameHooks;

  constructor(hooks: GameHooks) {
    this.hooks = hooks;
  }

  setInput(fn: InputSource) { this.input = fn; }

  /** A point as the seeds produced it, placed on the board this run is playing. */
  private place(x: number, y: number): [number, number] {
    const R = this.R!;
    return this.flipped ? [R.W - x, R.H - y] : [x, y];
  }

  /**
   * The sign, and the half-turn, for anything laid out along an axis rather than
   * derived from a position. A sideways drift or a line of splinters has to turn
   * with the board; a direction computed from two mirrored points already has.
   */
  private mir() { return this.flipped ? -1 : 1; }
  private mirA() { return this.flipped ? Math.PI : 0; }

  setViewport(fn: () => [number, number]) { this.viewport = fn; }

  setPhase(p: Phase) {
    this.phase = p;
    this.hooks.onPhase(p);
  }

  /**
   * A pause stops the clock rather than the world.
   *
   * The loop only steps on `intro` and `playing`, so leaving the phase means nothing
   * moves and `R.t` — the stamp on every recorded event — stands still, which leaves
   * the replay with no idea it was ever held. Resuming returns to whichever of the
   * two it interrupted, so a pause during the intro does not skip it.
   */
  pause() {
    if (this.phase !== "playing" && this.phase !== "intro") return false;
    this.resumeTo = this.phase;
    this.setPhase("paused");
    return true;
  }

  resume() {
    if (this.phase !== "paused") return;
    this.setPhase(this.resumeTo);
  }

  newRun() {
    this.run = { round: 1, ghosts: [], popped: 0, build: {}, lives: LIVES };
    this.pendingGhost = null;
  }

  /* ================= scaling ================= */

  isBoss() { return this.run.round % BOSS_EVERY === 0; }
  isFinal() { return this.run.round >= MAX_ROUNDS; }
  bloomBlock() { return Math.floor((this.run.round - 1) / BOSS_EVERY); }
  enemyCap() { return Math.min(170, 90 + Math.floor(this.run.round / 4) * 6); }

  /** Same play area every level; the screen's proportions decide its shape. */
  arenaSize(r: number): [number, number] {
    const base = ARENA_BASE * Game.arenaScale(r);
    const [vw, vh] = this.viewport();
    const asp = Math.max(0.62, Math.min(1.9, vh / vw));
    const k = Math.sqrt(asp);
    return [base / k, base * k];
  }

  /**
   * How much bigger the arena is at this level than at level one.
   *
   * The arena grows every round, and everything that lives in the current round —
   * you, the wave arriving now, your shots, the blast radii — is multiplied by this,
   * so the game keeps the same size on screen no matter how far the floor has grown.
   * A ditto is built from *its own* level instead, which freezes it at the size it
   * was, and is why your older selves look a little smaller every round. Old waves
   * are frozen the same way, for the same reason.
   */
  static arenaScale(level: number) {
    return Math.pow(ARENA_GROWTH, Math.min(level - 1, ARENA_CAP));
  }

  /** The scale of the round being played right now. */
  roundScale() { return Game.arenaScale(this.run.round); }

  bloomRadius() { return BLOOM_R * this.roundScale(); }

  static radiusFor(level: number) { return PLAYER_R * Game.arenaScale(level); }
  static ghostHue(r: number) { return 108 + ((r * 29) % 36); }

  static stats(level: number, b: Build = {}): Stats {
    const rapid = b.rapid || 0, punch = b.punch || 0, vigor = b.vigor || 0;
    const reach = b.reach || 0, surge = b.surge || 0;
    // Damage, cooldowns and health are counts, not distances: they do not scale.
    const sc = Game.arenaScale(level);
    return {
      // The level gives less than it used to and the build gives more, so what you
      // picked shapes you more than how far you have come. Stacks saturate, which is
      // what lets a single pick be worth three times what it used to be without
      // ninety-nine of them running away with the run.
      dmg: (1 + level * 0.24) *
        sat(punch, BOON_CEIL, BOON_RATE) * cut(rapid, 0.18, 0.85) * cut(reach, 0.12, 0.88),
      cool: (0.38 / (1 + level * 0.03)) / sat(rapid, BOON_CEIL, BOON_RATE) *
        sat(punch, 0.18, 0.85) * sat(vigor, 0.14, 0.88) * sat(surge, 0.14, 0.88),
      range: (330 + reach * 34) * sc,
      speed: 210 * sc,
      bulletSp: BULLET_SP * sc,
      pierce: Math.floor(reach / 3),
      hpBonus: vigor * 2.5,
      novaCd: Math.max(2.2, 7 - surge * 0.5),
      novaR: (170 + surge * 18) * sc,
      scale: sc,
    };
  }

  /** The concrete gain from taking this boon once more, given what you already hold. */
  static boonGain(id: BoonId, b: Build): string {
    const n = b[id] || 0;
    const step = Math.round(
      (sat(n + 1, BOON_CEIL, BOON_RATE) / sat(n, BOON_CEIL, BOON_RATE) - 1) * 100);
    switch (id) {
      case "rapid": return `+${step}% fire rate`;
      case "punch": return `+${step}% damage`;
      case "vigor": return "+2.5 health";
      case "reach": return (n + 1) % 3 === 0 ? "+34 range, +1 pierce" : "+34 range";
      default: return "Pop −0.5s, +18 wide";
    }
  }

  /**
   * What a pick takes, in the same terms as what it gives.
   *
   * Read off `stats` rather than restated, so the number on the card is the trade the
   * game actually makes. "Slightly slower shots" was true of three boons at once,
   * which read as a copy-paste rather than a cost.
   */
  static boonCost(id: BoonId, b: Build): string {
    const bumped: Build = { ...b };
    bumped[id] = (b[id] || 0) + 1;
    const now = Game.stats(1, b), next = Game.stats(1, bumped);
    // level scales both terms, so the ratios are the same at any level
    const drops: [number, string][] = [
      [next.dmg / now.dmg - 1, "damage"],
      [now.cool / next.cool - 1, "fire rate"],
    ];
    drops.sort((x, y) => x[0] - y[0]);
    const [d, what] = drops[0];
    return `−${Math.max(1, Math.round(-d * 100))}% ${what}`;
  }

  /**
   * The boons worth offering. One cannot get more than a few stacks ahead of your
   * weakest, so "damage again" stops being an option long before it stops being
   * tempting — and a run has a shape rather than a single number going up.
   */
  static offerable(b: Build): Boon[] {
    let low = Infinity;
    for (const boon of BOONS) low = Math.min(low, b[boon.id] || 0);
    const open = BOONS.filter((boon) => (b[boon.id] || 0) <= low + BOON_LEAD);
    return open.length ? open : BOONS.slice();
  }

  static buildLabel(b: Build) {
    const out: string[] = [];
    for (const boon of BOONS) {
      const n = b && b[boon.id];
      if (n) out.push(boon.name + (n > 1 ? " ×" + n : ""));
    }
    return out.length ? out.join(" · ") : "No boons";
  }

  private mkUnit(kind: "player" | "ghost", x: number, y: number, level: number, hue: number, build?: Build): Unit {
    const s = Game.stats(level, build);
    const hp = (kind === "player" ? HP_PLAYER : HP_GHOST) + level * HP_PER_LEVEL + s.hpBonus;
    return {
      kind, x, y, r: Game.radiusFor(level),
      hp, max: hp, level, st: s, hue,
      fire: Math.random() * 0.25, alive: true, hitCd: 0, aim: 0, muzzle: 0,
      dashT: 0, dashCd: 0, novaCd: 0, shield: 0, dashInv: 0,
      lastDir: [1, 0], evi: 0, cyc: -1, g: null, ofx: 0, ofy: 0, fade: 1,
      age: 0, dur: 0, vx: 0, vy: 0, born: 0,
    };
  }

  /* ================= waves ================= */

  /**
   * Every other wave arrives as a shape instead of a trickle, and a wave replays
   * identically for the rest of the run — so the same set-piece lands on the same
   * beat, level after level. Six shapes, cycling: a wave you have fought before is
   * recognisable by the way it walks in.
   */
  private formationFor(k: number): Wave["form"] {
    if (k % 2 !== 0) return null;
    return FORMS[Math.floor(k / 2) % FORMS.length];
  }

  private mkWave(k: number): Wave {
    // Size follows the wave's position inside its block, not the absolute level, so
    // a freshly wiped board ramps up again instead of throwing level-13 volume at a
    // team of one. Toughness still scales with the absolute level.
    const lk = ((k - 1) % BOSS_EVERY) + 1;
    let n = Math.min(9 + Math.floor(lk * 1.4), 24);
    // The first ten levels are the only stretch of the run fought short-handed: the
    // squad is still assembling, and a wave sized for eighteen dittos landing on four
    // thin bubbles is not a difficulty curve, it is a wall. Every wave is thinned to
    // the team that has to meet it — which stops mattering at level nineteen, where
    // the squad hits its cap and stays there for the rest of the game.
    const squad = Math.min(1, (this.run.ghosts.length + 1) / DITTO_CAP);
    n = Math.max(4, Math.round(n * (0.55 + 0.45 * squad)));
    // A deathmatch is team against team with no clock to survive to, so being
    // short-handed costs more here than anywhere else and is discounted again.
    if (this.isBoss()) n = Math.max(4, Math.round(n * 0.55 * (0.62 + 0.38 * squad)));
    if (this.isBoss() && this.run.round === BOSS_EVERY) n = Math.max(3, Math.round(n * 0.6));
    const rng = mkRng(k * 9176 + 1337);
    // Every wave in the block runs on the same clock, so without a per-wave offset
    // their set-pieces all land on the same second and drop three rings on your head
    // at once. Drawn from the wave's own seed, so the stagger replays too.
    const f1 = 0.14 + rng() * 0.3, f2 = 0.52 + rng() * 0.34;
    // A second set-piece only once a wave is long enough to carry one; early waves
    // in a block are fought by a small squad and one shape is already plenty.
    const beats = lk >= 7 ? [f1, f2] : [f1];
    return {
      k, rng, n, sent: 0,
      // A wave only forms up if it can pay for it. Deathmatch waves are thinned to
      // a handful of sends, and a set-piece there is not a shape inside the wave —
      // it is the whole wave, arriving at once.
      form: n >= FORM_COST * 2 ? this.formationFor(k) : null,
      formAt: beats.map((f) => Math.floor(n * f)), formIdx: 0,
      gap: (this.isBoss() ? 46 : ROUND_TIME - 1.2) / n, acc: 0.5,
    };
  }

  /* ================= round lifecycle ================= */

  startRound() {
    const [W, H] = this.arenaSize(this.run.round);
    const R: RoundState = {
      t: 0, over: false, reason: "", shake: 0, hitStop: 0, hurtFlash: 0,
      units: [], enemies: [], bullets: [], ebul: [], mines: [], fx: [], amb: [],
      pickups: [], pickRng: mkRng(PICK_SEED + this.bloomBlock() * 6151), pickNext: 6,
      lifeGiven: false,
      sweep: null, sweepRng: mkRng(SWEEP_SEED + this.bloomBlock() * 2749),
      sweepNext: SWEEP_CD * 0.6,
      rec: { pts: [], events: [] }, recAcc: 0,
      waves: [], popped: 0, army: 0,
      bloom: null, bloomRng: mkRng(BLOOM_SEED + this.bloomBlock() * 7919), bloomAcc: 4,
      siegeNext: SIEGE_CD, siegeShot: 0,
      bombNext: this.run.round >= BOMB_AT ? 6 : 1e9,
      typeSet: blockTypes(this.bloomBlock()),
      W, H, intro: INTRO_HOLD + INTRO_LIFT,
      player: null as unknown as Unit,
    };
    this.R = R;

    // Waves come from the block's own levels, not from the ditto list: clearing a
    // deathmatch wipes every enemy while the squad marches on.
    const blockStart = this.bloomBlock() * BOSS_EVERY + 1;
    for (let lv = blockStart; lv <= this.run.round; lv++) R.waves.push(this.mkWave(lv));
    for (const w of R.waves) R.army += w.n;

    const p = this.mkUnit("player", W / 2, H / 2, this.run.round, 185, this.run.build);
    R.player = p;
    R.units.push(p);

    const field = this.run.ghosts.slice(Math.max(0, this.run.ghosts.length - DITTO_CAP));
    for (let i = 0; i < field.length; i++) {
      const g = field[i];
      const ofx = (W - g.aw) / 2, ofy = (H - g.ah) / 2;   // the arena grew around it
      const u = this.mkUnit("ghost", g.pts[0] + ofx, g.pts[1] + ofy, g.level, g.hue, g.build);
      u.g = g; u.ofx = ofx; u.ofy = ofy;
      u.age = this.run.round - g.round;
      u.dur = (g.pts.length / 2 - 1) * REC_DT;
      u.born = i * 0.05;   // they materialise in sequence once play begins
      R.units.push(u);
    }

    for (let a = 0; a < 18; a++)
      R.amb.push({
        x: Math.random() * W, y: Math.random() * H,
        r: (4 + Math.random() * 13) * this.roundScale(),
        vy: (-4 - Math.random() * 11) * this.roundScale(), ph: Math.random() * 6.28,
      });

    this.setPhase("intro");
    this.hooks.sfx("round");
  }

  /* ================= queries ================= */

  nearestEnemy(x: number, y: number, range: number): Enemy | null {
    const R = this.R!;
    let best: Enemy | null = null, bd = range * range;
    for (const e of R.enemies) {
      if (ETYPES[e.type].invuln || e.hidden) continue;   // never waste the team's aim
      const d = (e.x - x) * (e.x - x) + (e.y - y) * (e.y - y);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  /**
   * Anyone standing in it gets it — you and your dittos alike. Since the schedule
   * is fixed, a ditto that walked through a bloom last level walks through the same
   * bloom this level, and picks it up again.
   */
  bloomKind(u: { x: number; y: number }): "rapid" | "triple" | null {
    const R = this.R!;
    if (!R.bloom) return null;
    const b = R.bloom;
    return (u.x - b.x) * (u.x - b.x) + (u.y - b.y) * (u.y - b.y) < b.r * b.r ? b.kind : null;
  }

  /* ================= abilities ================= */

  doDash() {
    if (this.phase !== "playing") return;
    const p = this.R!.player;
    if (!p.alive || p.dashCd > 0) return;
    p.dashCd = DASH_CD; p.dashT = DASH_TIME; p.dashInv = DASH_INV;
    this.hooks.sfx("dash");
    this.hooks.haptic("light");
  }

  doPop() {
    if (this.phase !== "playing") return;
    const R = this.R!, p = R.player;
    if (!p.alive || p.novaCd > 0) return;
    p.novaCd = p.st.novaCd;
    this.nova(p, 1);
    R.rec.events.push({ t: R.t, k: "pop" });
    R.hitStop = Math.max(R.hitStop, 0.07);
    this.hooks.haptic("medium");
  }

  /* ================= combat ================= */

  /** Would this land on screen smaller than a couple of pixels? */
  private tooSmall(r: number) {
    const R = this.R!;
    return r < (MIN_PX / REF_PX) * Math.min(R.W, R.H);
  }

  /** Push something a distance, over time, instead of moving it there. */
  private shove(e: Enemy, dx: number, dy: number, dist: number) {
    e.kx += dx * dist * KNOCK_DECAY;
    e.ky += dy * dist * KNOCK_DECAY;
  }

  /**
   * Damage to one of yours. A shield eats the hit outright — it is the only thing in
   * the game that says no, which is what makes the walk out to the wall worth it.
   */
  private hurtUnit(u: Unit, dmg: number): boolean {
    if (u.shield > 0) return false;
    u.hp -= dmg;
    if (u.hp <= 0) { u.hp = 0; u.alive = false; }
    return true;
  }

  private hurtEnemy(e: Enemy, dmg: number, j: number): boolean {
    const T = ETYPES[e.type];
    if (T.invuln || e.hidden) return false;
    e.hp -= dmg * (T.shield || 1);
    e.flash = 1;
    if (e.hp <= 0) { this.killEnemy(j); return true; }
    return false;
  }

  private nova(u: Unit, power: number) {
    const R = this.R!;
    const rad = u.st.novaR;
    const dmg = 6 * power * (u.kind === "ghost" ? GHOST_DMG : PLAYER_EDGE);
    R.fx.push({ x: u.x, y: u.y, t: 0, life: 0.55, rad, hue: u.hue, ring: true, width: 6 });
    R.fx.push({ x: u.x, y: u.y, t: 0, life: 0.34, rad: rad * 0.55, hue: u.hue, ring: true, width: 3 });
    if (u.kind === "player") { R.shake = Math.max(R.shake, 6); this.hooks.sfx("nova"); }
    for (let i = R.enemies.length - 1; i >= 0; i--) {
      const e = R.enemies[i];
      const dx = e.x - u.x, dy = e.y - u.y, d = Math.hypot(dx, dy) || 1;
      if (d < rad) {
        this.shove(e, dx / d, dy / d, 46 * u.st.scale);
        this.hurtEnemy(e, dmg, i);
      }
    }
  }

  private killEnemy(i: number) {
    const R = this.R!, e = R.enemies[i], T = ETYPES[e.type];
    R.enemies.splice(i, 1);
    R.popped++; this.run.popped++;
    this.hooks.sfx("pop");

    if (T.splits) {
      const sn = Math.max(0, Math.min(T.splits.n, this.enemyCap() - R.enemies.length));
      for (let q = 0; q < sn; q++) {
        if (sn > 4) {
          const sa2 = (q * TAU) / sn + Math.random() * 0.28 + this.mirA();
          const sr = e.r * 0.8 + Math.random() * e.r * 0.9;
          this.spawnAt(e.x + Math.cos(sa2) * sr, e.y + Math.sin(sa2) * sr, T.splits.t, e.w);
        } else {
          this.spawnAt(e.x + (q - (sn - 1) / 2) * 24 * e.sc * this.mir(), e.y, T.splits.t, e.w);
        }
      }
    }

    if (T.explode) {
      R.fx.push({ x: e.x, y: e.y, t: 0, life: 0.55, rad: T.explode.r * e.sc, hue: T.hue, ring: true, width: 7 });
      R.shake = Math.max(R.shake, 9);
      R.hitStop = Math.max(R.hitStop, 0.05);
      this.hooks.sfx("boom");
      for (const uz of R.units) {
        if (!uz.alive) continue;
        if (Math.hypot(uz.x - e.x, uz.y - e.y) < T.explode.r * e.sc) {
          // Full price for you, half for a ditto: you choose where you stand, and a
          // recording cannot dodge a blast that was not there when it played.
          const took = this.hurtUnit(uz, T.explode.dmg * (uz.kind === "player" ? 1 : 0.5));
          if (took && uz.kind === "player") { this.hooks.sfx("hurt"); R.hurtFlash = 1; }
        }
      }
    }

    if (T.boss) { R.shake = Math.max(R.shake, 14); R.hitStop = Math.max(R.hitStop, 0.16); }

    R.fx.push({ x: e.x, y: e.y, t: 0, life: 0.34, rad: e.r * 1.35, hue: T.hue, ring: true, width: 4 });
    // In arena units like everything else: these were written in raw pixels and had
    // quietly become sub-pixel specks that barely moved once the camera pulled back.
    for (let k2 = 0; k2 < 6; k2++)
      R.fx.push({
        x: e.x, y: e.y, t: 0, life: 0.34 + Math.random() * 0.2, pop: true,
        vx: (Math.random() - 0.5) * 210 * e.sc, vy: (Math.random() - 0.5) * 210 * e.sc,
        rad: (2 + Math.random() * 4) * e.sc, hue: T.hue,
      });
    // Shards spin off the bigger ones, so a heavy kill reads heavier than a mote.
    if (e.r > 12)
      for (let k3 = 0; k3 < 5; k3++) {
        const a = Math.random() * TAU, sp = 80 + Math.random() * 190;
        R.fx.push({
          x: e.x, y: e.y, t: 0, life: 0.5 + Math.random() * 0.3, shard: true,
          vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
          rad: e.r * (0.2 + Math.random() * 0.3), hue: T.hue,
          ang: Math.random() * TAU, spin: (Math.random() - 0.5) * 12,
        });
      }
  }

  private pickType(k: number, rnd: () => number): string {
    const set = this.R!.typeSet, pool: string[] = [];
    for (const id of set) if (ETYPES[id].at <= k) pool.push(id);
    if (!pool.length) pool.push("basic");
    return pool[(rnd() * pool.length) | 0];
  }

  private spawnAt(x: number, y: number, type: string, k: number, wob?: number, scale?: number) {
    const R = this.R!, t = ETYPES[type];
    // Wave k is as tough as ditto k is strong — and within that wave, the newer a
    // type is the harder it is to put down. A wave's roster runs from things you met
    // in your first ten levels to the one this level just introduced, so the debut is
    // always the thing in the wave you cannot ignore. Measured against the wave, not
    // in absolute terms, so meeting a new type is a step up without the level's total
    // toughness drifting.
    const debut = 0.72 + 0.58 * Math.min(1, t.at / k);
    // The quadratic term pays for the boons. A saturating build front-loads its
    // power, so by the late levels a team is carrying more than a linear curve was
    // written for; this is the difference, and it keeps shots-to-kill flat.
    let wave = 3 + (k - 1) * 0.7 + (k - 1) * (k - 1) * 0.006;
    // Bosses are excused the late-game slope: they already carry their own multiplier,
    // and stacking both turned the last fight into a three-minute grind rather than a
    // hard one. The slope exists to keep ordinary enemies level with a growing squad.
    if (k > HARD_FROM && !t.boss) wave *= 1 + (k - HARD_FROM) * HARD_SLOPE;
    let hp = wave * t.hp * debut;
    // A full squad melts a boss in seconds otherwise: eighteen dittos and a player at
    // double strength put out more damage than any single body was written for.
    if (t.boss) hp *= BOSS_HP;
    if (t.boss && this.run.round === BOSS_EVERY) hp *= 0.7;   // first boss, first lesson
    // Frozen at its wave's scale, exactly like a ditto: an old wave is a smaller
    // wave, and the size difference is the same signal in both directions.
    const sc = scale ?? Game.arenaScale(k);
    const r = t.r * sc * (type === "mote" ? 0.6 : 1);
    // Too small to see is too small to be worth a slot in the loop.
    if (this.tooSmall(r)) return;
    R.enemies.push({
      x, y, hp, max: hp, type, dmg: t.dmg, w: k, flash: 0, sc,
      r,
      sp: (52 + Math.min(k * 2, 46)) * t.sp * sc,
      wind: 1.2 + Math.random() * 1.6, dashT: 0, dd: [0, 0], aim: 0,
      cool: 0.6 + Math.random() * 1.6, cool2: 1 + Math.random(),
      spawnT: t.spawns ? t.spawns.cd : 2.5, age: 0,
      spawnLeft: t.spawns ? t.spawns.max || 8 : 0,
      ph: Math.random() * 3, hidden: false, bk: 1 + Math.random() * 2,
      jt: 0.7 + Math.random() * 1.5, jT: 0, jdir: 1,
      wob: wob === undefined ? Math.random() * 6.28 : wob,
      kx: 0, ky: 0,
      born: R.t,
    });
  }

  /**
   * There is one bomb run in the whole game. It is generated from a fixed seed in
   * normalised coordinates, so from the level that introduces it onward the same
   * bomber enters at the same place on the same heading, every single level — the
   * one thing on the board you can learn by heart.
   */
  private theBombRun() {
    const R = this.R!, { W, H } = R;
    const rnd = mkRng(BOMB_SEED);
    const side = (rnd() * 4) | 0, u = rnd(), ta = rnd(), tb = rnd();
    const pad = -30 * this.roundScale();
    let x: number, y: number;
    if (side === 0) { x = u * W; y = pad; }
    else if (side === 1) { x = u * W; y = H - pad; }
    else if (side === 2) { x = pad; y = u * H; }
    else { x = W - pad; y = u * H; }
    const tx = W - x + (ta - 0.5) * W * 0.35, ty = H - y + (tb - 0.5) * H * 0.35;
    const bx = tx - x, by = ty - y, bl = Math.hypot(bx, by) || 1;
    const [fx, fy] = this.place(x, y);
    const f = this.flipped ? -1 : 1;
    return { x: fx, y: fy, dd: [(f * bx) / bl, (f * by) / bl] as [number, number] };
  }

  private spawnEnemy(wv: Wave): boolean {
    const R = this.R!, { W, H } = R;
    if (R.enemies.length >= this.enemyCap()) return false;
    const rnd = wv.rng, side = (rnd() * 4) | 0, pad = -18 * this.roundScale();
    let x: number, y: number;
    if (side === 0) { x = rnd() * W; y = pad; }
    else if (side === 1) { x = rnd() * W; y = H - pad; }
    else if (side === 2) { x = pad; y = rnd() * H; }
    else { x = W - pad; y = rnd() * H; }
    // A wave opens with the type its round introduced, so every round shows you
    // something new instead of leaving it to the dice.
    const type = wv.sent !== 0
      ? this.pickType(wv.k, rnd)
      : (this.isBoss() && wv.k === this.run.round && bossFor(this.run.round)) || newestTypeAt(wv.k);
    if (type === "mote") {
      // A shoal, not a trio. Six reads as a swarm from across the arena — and costs
      // the wave two sends, so the shoal is bigger without the level being bigger.
      const spread = 96 * Game.arenaScale(wv.k);
      for (let m = 0; m < 6; m++) {
        const [mx, my] = this.place(x + (rnd() - 0.5) * spread, y + (rnd() - 0.5) * spread);
        this.spawnAt(mx, my, "mote", wv.k, rnd() * 6.28);
      }
      wv.sent++;
    } else {
      const [sx, sy] = this.place(x, y);
      this.spawnAt(sx, sy, type, wv.k, rnd() * 6.28);
    }
    return true;
  }

  private spawnFormation(wv: Wave) {
    const R = this.R!, { W, H } = R;
    const rnd = wv.rng, t = this.pickType(wv.k, rnd), sc = this.roundScale();
    const pad = 26 * sc;
    const cx = W / 2, cy = H / 2, span = Math.min(W, H);
    const at = (fx: number, fy: number, wob = 0) => {
      const [px, py] = this.place(fx, fy);
      this.spawnAt(px, py, t, wv.k, wob);
    };

    if (wv.form === "ring") {
      // closing in from every direction at once
      const rad = span * 0.42;
      for (let q = 0; q < 10; q++) {
        const ang = (q * TAU) / 10;
        at(cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad, ang);
      }
    } else if (wv.form === "line") {
      // one rank, abreast, over a single edge
      const side = (rnd() * 4) | 0;
      for (let q = 0; q < 8; q++) {
        const u = (q + 0.5) / 8;
        if (side === 0) at(u * W, -pad);
        else if (side === 1) at(u * W, H + pad);
        else if (side === 2) at(-pad, u * H);
        else at(W + pad, u * H);
      }
    } else if (wv.form === "pincer") {
      // two columns, opposite edges, squeezing
      const horiz = rnd() < 0.5;
      for (let sd = 0; sd < 2; sd++)
        for (let q = 0; q < 5; q++) {
          const j = (q - 2) * 48 * sc;
          if (horiz) at(sd ? W + pad : -pad, cy + j);
          else at(cx + j, sd ? H + pad : -pad);
        }
    } else if (wv.form === "arc") {
      // a crescent across one side of the arena, all of it facing you
      const base = rnd() * TAU, rad = span * 0.46;
      for (let q = 0; q < 9; q++) {
        const ang = base + (q / 8 - 0.5) * 2.2;
        at(cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad, ang);
      }
    } else if (wv.form === "wedge") {
      // a spearhead aimed at the middle, tip first
      const ang = rnd() * TAU, ca = Math.cos(ang), sa = Math.sin(ang);
      const rad = span * 0.5, step = 46 * sc;
      for (let arm = -1; arm <= 1; arm += 2)
        for (let q = 0; q < 4; q++) {
          const back = rad + q * step * 1.15, side2 = arm * (q + 1) * step * 0.72;
          at(cx + ca * back - sa * side2, cy + sa * back + ca * side2, ang + Math.PI);
        }
      at(cx + ca * rad, cy + sa * rad, ang + Math.PI);   // the point of the spear
    } else {
      // a block held off one edge, then walked in together
      const side = (rnd() * 4) | 0, gap = 54 * sc;
      for (let row = 0; row < 3; row++)
        for (let q = 0; q < 4; q++) {
          const across = (q - 1.5) * gap * 1.4, deep = pad + row * gap;
          if (side === 0) at(cx + across, -deep);
          else if (side === 1) at(cx + across, H + deep);
          else if (side === 2) at(-deep, cy + across);
          else at(W + deep, cy + across);
        }
    }
    R.fx.push({
      x: cx, y: cy, t: 0, life: 0.9, rad: span * 0.44,
      hue: ETYPES[t].hue, ring: true, width: 6,
    });
    R.shake = Math.max(R.shake, 5);
    this.hooks.sfx("form");
    this.hooks.haptic("medium");
  }

  armySent(): boolean {
    for (const w of this.R!.waves) if (w.sent < w.n) return false;
    return true;
  }

  teamAlive(): boolean {
    for (const u of this.R!.units) if (u.alive) return true;
    return false;
  }

  /**
   * Squared distance from an enemy centre to the segment the bullet swept this
   * step. Testing the endpoint alone lets fast bullets skip small motes entirely.
   */
  private static segDist2(px: number, py: number, qx: number, qy: number, cx: number, cy: number) {
    const dx = qx - px, dy = qy - py, l2 = dx * dx + dy * dy;
    let t = l2 ? ((cx - px) * dx + (cy - py) * dy) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const ex = px + dx * t - cx, ey = py + dy * t - cy;
    return ex * ex + ey * ey;
  }

  /* ================= the frame ================= */

  step(rawDt: number) {
    const R = this.R;
    if (!R) return;

    if (this.phase === "intro") {
      R.intro -= rawDt;
      // ambience keeps drifting behind the card, so the arena is alive before you are
      for (const am of R.amb) {
        am.ph += rawDt * 0.7; am.y += am.vy * rawDt;
        am.x += Math.sin(am.ph) * 7 * rawDt;
        if (am.y < -am.r) { am.y = R.H + am.r; am.x = Math.random() * R.W; }
      }
      if (R.intro <= INTRO_LIFT) this.setPhase("playing");
      return;
    }

    // A heavy beat bites into time for a few frames. Cheap, and it lands.
    let dt = rawDt;
    if (R.hitStop > 0) {
      R.hitStop = Math.max(0, R.hitStop - rawDt);
      dt = rawDt * 0.28;
    }
    if (R.intro > 0) R.intro = Math.max(0, R.intro - rawDt);

    const { W, H } = R;
    R.t += dt;
    R.shake = Math.max(0, R.shake - dt * 26);
    R.hurtFlash = Math.max(0, R.hurtFlash - dt * 2.4);

    /* --- player --- */
    const p = R.player;
    if (p.alive) {
      const px0 = p.x, py0 = p.y;
      p.dashCd = Math.max(0, p.dashCd - dt);
      p.novaCd = Math.max(0, p.novaCd - dt);
      {
        const d = this.input();
        if (d[0] || d[1]) p.lastDir = [d[0], d[1]];
        let slowMul = 1;
        for (const se of R.enemies) {
          const ST = ETYPES[se.type];
          if (!ST.slow) continue;
          if (Math.hypot(p.x - se.x, p.y - se.y) < ST.slow.r * se.sc)
            slowMul = Math.min(slowMul, ST.slow.mul);
        }
        const sp = p.st.speed * slowMul * (p.dashT > 0 ? 3.2 : 1);
        p.x += d[0] * sp * dt; p.y += d[1] * sp * dt;
        p.dashT = Math.max(0, p.dashT - dt);
      }
      p.x = Math.max(p.r, Math.min(W - p.r, p.x));
      p.y = Math.max(p.r, Math.min(H - p.r, p.y));
      p.vx = dt > 0 ? (p.x - px0) / dt : 0;
      p.vy = dt > 0 ? (p.y - py0) / dt : 0;

      if (R.t <= ROUND_TIME) {          // a deathmatch still leaves an ordinary ditto
        R.recAcc -= dt;
        while (R.recAcc <= 0) { R.rec.pts.push(p.x, p.y); R.recAcc += REC_DT; }
      }
    }

    /* --- dittos replay. In a deathmatch they ping-pong instead of expiring, so
           the fight is team against team rather than team against a clock. --- */
    for (let i = 1; i < R.units.length; i++) {
      const u = R.units[i];
      if (!u.alive) { u.fade = Math.max(0, u.fade - dt * 2.2); continue; }
      const g = u.g!;
      let tt: number, forward = true;
      if (this.isBoss()) {
        const cyc = Math.max(0.2, u.dur * 2), m = R.t % cyc;
        const ci = Math.floor(R.t / cyc);
        if (ci !== u.cyc) { u.cyc = ci; u.evi = 0; }
        forward = m <= u.dur;
        tt = forward ? m : cyc - m;
      } else {
        tt = R.t;
        if (tt >= u.dur) { u.alive = false; u.expired = true; continue; }
      }
      const ux0 = u.x, uy0 = u.y;
      const f = tt / REC_DT, n = g.pts.length / 2;
      let idx = Math.floor(f);
      if (idx > n - 2) idx = n - 2;
      const t2 = f - idx, a = idx * 2, b = a + 2;
      u.x = g.pts[a] + (g.pts[b] - g.pts[a]) * t2 + u.ofx;
      u.y = g.pts[a + 1] + (g.pts[b + 1] - g.pts[a + 1]) * t2 + u.ofy;
      u.vx = dt > 0 ? (u.x - ux0) / dt : 0;
      u.vy = dt > 0 ? (u.y - uy0) / dt : 0;
      if (forward)
        while (u.evi < g.events.length && g.events[u.evi].t <= tt) {
          const ev = g.events[u.evi];
          if (ev.k === "pop") this.nova(u, 1);
          u.evi++;
        }
    }

    /* --- everyone shoots, automatically --- */
    for (const u of R.units) {
      if (!u.alive) continue;
      u.hitCd = Math.max(0, u.hitCd - dt);
      // The gun swivels toward whatever is nearest, ready to fire or not, so you can
      // read who is covering which side of the arena at a glance.
      const seen = this.nearestEnemy(u.x, u.y, u.st.range * 1.4);
      if (seen) {
        const want = Math.atan2(seen.y - u.y, seen.x - u.x);
        const turn = ((want - u.aim + Math.PI * 3) % TAU) - Math.PI;
        u.aim += turn * Math.min(1, dt * 16);
      }
      u.muzzle = Math.max(0, u.muzzle - dt);
      u.fire -= dt;
      if (u.fire <= 0) {
        const tgt = this.nearestEnemy(u.x, u.y, u.st.range);
        if (tgt) {
          const bk = this.bloomKind(u);
          u.fire = u.st.cool / (bk === "rapid" ? BLOOM_MUL : 1);
          const ang = Math.atan2(tgt.y - u.y, tgt.x - u.x), bs = u.st.bulletSp;
          u.aim = ang;            // barrel and shot agree at the instant of firing
          u.muzzle = 0.07;
          const shots = bk === "triple" ? 3 : 1;
          for (let sN = 0; sN < shots; sN++) {
            const sa = ang + (shots > 1 ? (sN - 1) * 0.17 : 0);
            const bx = u.x + Math.cos(sa) * u.r * 1.5, by = u.y + Math.sin(sa) * u.r * 1.5;
            R.bullets.push({
              x: bx, y: by, px: u.x, py: u.y,
              vx: Math.cos(sa) * bs, vy: Math.sin(sa) * bs,
              dmg: u.st.dmg * (u.kind === "ghost" ? GHOST_DMG : PLAYER_EDGE),
              life: 1.1, r: u.r * 0.3 * (u.kind === "ghost" ? 0.8 : 1),
              pierce: u.st.pierce, hit: null, hue: u.hue, ghost: u.kind === "ghost",
              tr: [bx, by, bx, by, bx, by],
            });
          }
          if (u.kind === "player") this.hooks.sfx("shoot");
        } else u.fire = 0.06;
      }
    }

    /* --- bloom, seeded so the round is the same for everyone --- */
    if (R.bloom) {
      R.bloom.t -= dt;
      const wasIn = R.bloom.wasIn;
      const nowIn = p.alive && !!this.bloomKind(p);
      if (nowIn && !wasIn) this.hooks.sfx(R.bloom.kind === "triple" ? "bloom3" : "bloom");
      R.bloom.wasIn = nowIn;
      if (R.bloom.t <= 0) { R.bloom = null; R.bloomAcc = 5 + R.bloomRng() * 3; }
    } else {
      R.bloomAcc -= dt;
      if (R.bloomAcc <= 0) {
        const bu = R.bloomRng(), bv = R.bloomRng(), bk2 = R.bloomRng();
        // Placed as a fraction of the arena, never an absolute inset, so the same
        // bloom sits at the same spot on the floor no matter how far it has grown.
        const cx = W * (0.13 + bu * 0.74), cy = H * (0.13 + bv * 0.74);
        const [bx, by] = this.place(cx, cy);
        R.bloom = {
          x: bx, y: by, cx, cy,
          r: this.bloomRadius(), t: BLOOM_LIFE, life: BLOOM_LIFE, wasIn: false,
          kind: bk2 < 0.45 ? "triple" : "rapid",
        };
        R.siegeShot = 0;
      }
    }

    this.stepPickups(dt);
    this.stepSweep(dt);

    /* --- shells fall on the bloom, so the best floor in the arena is never free --- */
    if (this.run.round >= SIEGE_FROM && R.bloom) {
      R.siegeNext -= dt;
      if (R.siegeNext <= 0) {
        R.siegeNext = SIEGE_CD;
        const b = R.bloom;
        // Keyed on the bloom's own position and the shot's number, not on a running
        // stream: combat noise nudges when a bloom opens, and a stream would slide
        // out of step with it. This way the third shell on a given bloom always
        // lands where the third shell lands, so a ditto that stepped around it once
        // steps around it every time.
        // Keyed to the bloom's unturned position, so the pattern of shells turns
        // with the board instead of becoming a different pattern on a flipped run.
        const rr = mkRng(SIEGE_SEED + Math.round(b.cx) * 7919 +
          Math.round(b.cy) * 104729 + R.siegeShot * 31);
        R.siegeShot++;
        const a = rr() * TAU;
        const d = Math.sqrt(rr()) * b.r * SIEGE_OFFSET;
        const [mx, my] = this.place(b.cx + Math.cos(a) * d, b.cy + Math.sin(a) * d);
        const r = b.r * SIEGE_R;
        R.mines.push({ x: mx, y: my, t: SIEGE_FUSE, life: SIEGE_FUSE, r });
        // an impact ring, so the shell announces itself rather than appearing
        R.fx.push({ x: mx, y: my, t: 0, life: 0.4, rad: r, hue: 14, ring: true, width: 4 });
        this.hooks.sfx("mine");
      }
    } else if (!R.bloom) {
      R.siegeNext = SIEGE_CD * 0.55;   // a beat of grace when a new bloom opens
    }

    /* --- a deathmatch stops reinforcing eventually, or it can never be cleared --- */
    if (this.isBoss() && R.t > DM_SPAWN_END)
      for (const w of R.waves) w.sent = w.n;

    /* --- spawns: every level in the block runs its wave --- */
    for (const wv of R.waves) {
      if (wv.sent >= wv.n) continue;
      wv.acc -= dt;
      if (wv.acc <= 0) {
        const due = wv.form && wv.formIdx < wv.formAt.length &&
          wv.sent >= wv.formAt[wv.formIdx];
        if (due && R.enemies.length < this.enemyCap() - 12) {
          this.spawnFormation(wv);
          wv.formIdx++;
          wv.sent += FORM_COST;
          wv.acc += wv.gap * FORM_COST * 0.7;
        } else {
          if (this.spawnEnemy(wv)) wv.sent++;
          wv.acc += wv.gap;
        }
      }
    }

    this.stepEnemies(dt);
    this.stepBullets(dt);

    /* --- the one bomb run, on its schedule --- */
    R.bombNext -= dt;
    if (R.bombNext <= 0) {
      R.bombNext = this.isBoss() ? 26 : 1e9;   // once a level; a deathmatch has no clock
      let flyingB = 0;
      for (const e of R.enemies) if (e.type === "bomb") flyingB++;
      if (flyingB < BOMB_MAX) {
        const prm = this.theBombRun();
        // Its run is the same one forever, but it is a hazard on today's board, not
        // a memory of an old one — so it flies and bombs at this round's scale.
        this.spawnAt(prm.x, prm.y, "bomb", BOMB_AT, 0, this.roundScale());
        const bm = R.enemies[R.enemies.length - 1];
        bm.dd = prm.dd;
        bm.cool = 0.3;
      }
    }

    /* --- time bombs --- */
    for (let i = R.mines.length - 1; i >= 0; i--) {
      const mn = R.mines[i];
      mn.t -= dt;
      if (mn.t > 0) continue;
      R.mines.splice(i, 1);
      R.fx.push({ x: mn.x, y: mn.y, t: 0, life: 0.5, rad: mn.r, hue: 14, ring: true, width: 7 });
      R.shake = Math.max(R.shake, 8);
      this.hooks.sfx("boom");
      for (const uz of R.units) {
        if (!uz.alive) continue;
        if (Math.hypot(uz.x - mn.x, uz.y - mn.y) < mn.r) {
          const took = this.hurtUnit(uz, MINE_DMG * (uz.kind === "player" ? 1 : 0.5));
          if (took && uz.kind === "player") {
            this.hooks.sfx("hurt"); R.hurtFlash = 1; this.hooks.haptic("heavy");
          }
        }
      }
    }

    /* --- enemy fire --- */
    for (let i = R.ebul.length - 1; i >= 0; i--) {
      const eb = R.ebul[i];
      eb.px = eb.x; eb.py = eb.y;
      eb.x += eb.vx * dt; eb.y += eb.vy * dt; eb.life -= dt;
      eb.tr.push(eb.x, eb.y);
      if (eb.tr.length > 8) eb.tr.splice(0, 2);
      if (eb.life <= 0 || eb.x < -40 || eb.x > W + 40 || eb.y < -40 || eb.y > H + 40) {
        R.ebul.splice(i, 1); continue;
      }
      for (const uu of R.units) {
        if (!uu.alive) continue;
        const rr2 = uu.r + eb.r;
        if (Game.segDist2(eb.px, eb.py, eb.x, eb.y, uu.x, uu.y) < rr2 * rr2) {
          const took = this.hurtUnit(uu, eb.dmg);
          if (took && uu.kind === "player") {
            this.hooks.sfx("hurt"); R.shake = Math.max(R.shake, 4);
            R.hurtFlash = 1; this.hooks.haptic("medium");
          }
          R.ebul.splice(i, 1);
          break;
        }
      }
    }

    /* --- fx + ambience --- */
    for (let i = R.fx.length - 1; i >= 0; i--) {
      const f = R.fx[i];
      f.t += dt;
      if (f.pop) { f.x += f.vx! * dt; f.y += f.vy! * dt; f.vy! += 40 * dt; }
      if (f.shard) {
        f.x += f.vx! * dt; f.y += f.vy! * dt;
        f.vx! *= 1 - dt * 1.8; f.vy! *= 1 - dt * 1.8;
        f.ang! += f.spin! * dt;
      }
      if (f.t >= f.life) R.fx.splice(i, 1);
    }
    for (const am of R.amb) {
      am.ph += dt * 0.7;
      am.y += am.vy * dt;
      am.x += Math.sin(am.ph) * 7 * dt;
      if (am.y < -am.r) { am.y = H + am.r; am.x = Math.random() * W; }
    }

    /* --- end conditions --- */
    if (!R.over) {
      if (this.isBoss()) {
        // team against team: no clock, someone has to be wiped out
        if (!this.teamAlive()) { R.over = true; R.reason = "wiped"; }
        else if (this.armySent() && R.enemies.length === 0) { R.over = true; R.reason = "cleared"; }
      } else {
        if (!R.player.alive) { R.over = true; R.reason = "popped"; }
        else if (R.t >= ROUND_TIME) { R.over = true; R.reason = "survived"; }
      }
    }
    if (R.over) this.endRound();
  }

  /** Relief against the wall, where the enemies come in. */
  private stepPickups(dt: number) {
    const R = this.R!, p = R.player;
    if (this.run.round >= PICK_FROM) {
      R.pickNext -= dt;
      if (R.pickNext <= 0) {
        R.pickNext = PICK_CD;
        const rng = R.pickRng;
        const side = (rng() * 4) | 0, u = 0.12 + rng() * 0.76;
        const inx = R.W * PICK_INSET, iny = R.H * PICK_INSET;
        let x: number, y: number;
        if (side === 0) { x = R.W * u; y = iny; }
        else if (side === 1) { x = R.W * u; y = R.H - iny; }
        else if (side === 2) { x = inx; y = R.H * u; }
        else { x = R.W - inx; y = R.H * u; }
        const [px, py] = this.place(x, y);
        // Every thirtieth level puts a spare life out, once, before anything else.
        const spare = this.run.round % LIFE_EVERY === 0 && !R.lifeGiven;
        if (spare) R.lifeGiven = true;
        R.pickups.push({
          x: px, y: py, r: PICK_R * this.roundScale(),
          kind: spare ? "life" : rng() < 0.5 ? "shield" : "heal",
          t: spare ? PICK_LIFE * 1.8 : PICK_LIFE,
          life: spare ? PICK_LIFE * 1.8 : PICK_LIFE,
        });
      }
    }
    for (let i = R.pickups.length - 1; i >= 0; i--) {
      const pk = R.pickups[i];
      pk.t -= dt;
      if (pk.t <= 0) { R.pickups.splice(i, 1); continue; }
      // Yours alone. A recording cannot pick anything up, and this is one more thing
      // only the living player can do.
      if (!p.alive) continue;
      const rr = pk.r + p.r;
      if ((p.x - pk.x) * (p.x - pk.x) + (p.y - pk.y) * (p.y - pk.y) > rr * rr) continue;
      R.pickups.splice(i, 1);
      if (pk.kind === "heal") p.hp = Math.min(p.max, p.hp + p.max * HEAL_FRAC);
      else if (pk.kind === "shield") p.shield = SHIELD_TIME;
      else this.run.lives++;
      R.fx.push({
        x: pk.x, y: pk.y, t: 0, life: 0.5, rad: pk.r * 2.6,
        hue: pk.kind === "heal" ? 140 : pk.kind === "life" ? 340 : 185,
        ring: true, width: 5,
      });
      this.hooks.sfx("bloom");
      this.hooks.haptic("medium");
    }
    p.shield = Math.max(0, p.shield - dt);
    p.dashInv = Math.max(0, p.dashInv - dt);
  }

  /**
   * A band crosses the arena, announced first. Everything on the floor is hit once as
   * it passes: enough to end a ditto, a scratch to an enemy, and avoidable if you are
   * the one thing here that can still react.
   */
  private stepSweep(dt: number) {
    const R = this.R!;
    if (!R.sweep) {
      if (this.run.round < SWEEP_FROM) return;
      R.sweepNext -= dt;
      if (R.sweepNext > 0) return;
      R.sweepNext = SWEEP_CD;
      const rng = R.sweepRng;
      const horiz = rng() < 0.5;
      const span = horiz ? R.W : R.H;
      const w = SWEEP_WIDTH * this.roundScale();
      let a = -w, b = span + w;
      if (rng() < 0.5) { const t = a; a = b; b = t; }
      if (this.flipped) { a = span - a; b = span - b; }
      // A lane across part of the floor, not the whole of it: what it takes is the
      // part of the squad standing in the wrong place, and a bite sized to finish
      // something already hurt rather than to erase a healthy one.
      const far = horiz ? R.H : R.W;
      const lane = far * SWEEP_LANE;
      const lo = rng() * (far - lane);
      const ghostHp = HP_GHOST + this.run.round * HP_PER_LEVEL;
      R.sweep = {
        horiz, from: a, to: b, pos: a, width: w,
        lo: this.flipped ? far - lo - lane : lo, hi: 0,
        warn: SWEEP_WARN_LONG, k: ghostHp * SWEEP_BITE, hit: [],
      };
      R.sweep.hi = R.sweep.lo + lane;
      this.hooks.sfx("form");
      return;
    }
    const s = R.sweep;
    if (s.warn > 0) { s.warn -= dt; if (s.warn <= 0) this.hooks.haptic("heavy"); return; }
    s.pos += ((s.to - s.from) / SWEEP_CROSS) * dt;
    const done = s.to > s.from ? s.pos >= s.to : s.pos <= s.to;
    for (const u of R.units) {
      if (!u.alive || s.hit.indexOf(u) >= 0) continue;
      const c = s.horiz ? u.x : u.y, f = s.horiz ? u.y : u.x;
      if (Math.abs(c - s.pos) > s.width * 0.5 + u.r) continue;
      if (f < s.lo - u.r || f > s.hi + u.r) continue;
      // Dashed over it. Deliberately not marked as struck: if the dash ends while
      // still inside the band, it catches you — you have to clear it, not just blink.
      if (u.dashInv > 0) continue;
      s.hit.push(u);
      const took = this.hurtUnit(u, s.k);
      if (took && u.kind === "player") {
        this.hooks.sfx("hurt"); R.hurtFlash = 1;
        R.shake = Math.max(R.shake, 7); this.hooks.haptic("heavy");
      }
    }
    for (let i = R.enemies.length - 1; i >= 0; i--) {
      const e = R.enemies[i];
      if (ETYPES[e.type].invuln || e.hidden) continue;
      const c = s.horiz ? e.x : e.y, f = s.horiz ? e.y : e.x;
      if (Math.abs(c - s.pos) > s.width * 0.5 + e.r) continue;
      if (f < s.lo - e.r || f > s.hi + e.r) continue;
      if (e.sweptBy === s) continue;
      e.sweptBy = s;
      this.hurtEnemy(e, s.k, i);
    }
    if (done) R.sweep = null;
  }

  /* --- enemies: one pass, driven by whatever traits the type declares --- */
  private stepEnemies(dt: number) {
    const R = this.R!, { W, H } = R;
    // Nothing is worse than chasing three stragglers around a huge floor, so once
    // the army is spent the remnant closes on you hard.
    const rushMul = this.isBoss() && R.enemies.length <= 10 && this.armySent() ? 2.6 : 1;
    const mir = this.mir();

    for (let i = R.enemies.length - 1; i >= 0; i--) {
      const e = R.enemies[i], T = ETYPES[e.type];
      e.flash = Math.max(0, (e.flash || 0) - dt * 5);
      e.age += dt;
      if (e.kx || e.ky) {
        e.x += e.kx * dt; e.y += e.ky * dt;
        const bleed = Math.exp(-dt * KNOCK_DECAY);
        e.kx *= bleed; e.ky *= bleed;
        if (Math.abs(e.kx) + Math.abs(e.ky) < 1) { e.kx = 0; e.ky = 0; }
      }
      if (T.regen && e.hp < e.max) e.hp = Math.min(e.max, e.hp + T.regen * dt);
      if (T.phase) {
        e.ph += dt;
        const pcy = T.phase.on + T.phase.off;
        e.hidden = e.ph % pcy > T.phase.off;   // untargetable and untouchable
      }

      if (T.flyer) {
        // Chases nobody. Flies its line, seeds it, and is gone.
        e.x += e.dd[0] * e.sp * dt;
        e.y += e.dd[1] * e.sp * dt;
        e.cool -= dt;
        if (e.cool <= 0) {
          e.cool = 0.55;
          R.mines.push({ x: e.x, y: e.y, t: MINE_FUSE, life: MINE_FUSE, r: MINE_R * e.sc });
          this.hooks.sfx("mine");
        }
        if (e.x < -80 || e.x > W + 80 || e.y < -80 || e.y > H + 80) R.enemies.splice(i, 1);
        continue;
      }

      let tu: Unit | null = null, bd = 1e9;
      const fresh = e.w === this.run.round;
      for (const u2 of R.units) {
        if (!u2.alive) continue;
        const dd2 = (u2.x - e.x) * (u2.x - e.x) + (u2.y - e.y) * (u2.y - e.y);
        // Weights are on squared distance: 9 = "three times as far", 2.6 = "1.6x".
        const bias = fresh
          ? u2.kind === "player" ? 1 : 9
          : u2.g && u2.g.round === e.w ? 1 : 2.6;
        if (dd2 * bias < bd) { bd = dd2 * bias; tu = u2; }
      }
      if (!tu) continue;

      const dx = tu.x - e.x, dy = tu.y - e.y;
      let m = Math.hypot(dx, dy) || 1;
      const tx = dx / m, ty = dy / m;
      e.aim = Math.atan2(dy, dx);
      e.wob += dt * 3;

      /* movement */
      if (T.charge && e.dashT > 0) {
        e.dashT -= dt;
        e.x += e.dd[0] * e.sp * T.charge.mul * dt;
        e.y += e.dd[1] * e.sp * T.charge.mul * dt;
        e.x = Math.max(-40, Math.min(W + 40, e.x));
        e.y = Math.max(-40, Math.min(H + 40, e.y));
      } else if (T.charge) {
        e.wind -= dt;
        if (e.wind <= 0) { e.dd = [tx, ty]; e.dashT = T.charge.t; e.wind = T.charge.cd; }
        else { e.x += tx * e.sp * dt; e.y += ty * e.sp * dt; }
      } else if (T.orbitR) {
        // circles instead of closing, hijacking your team's nearest-target aim
        const want = Math.max(60 * e.sc, (T.orbitR - e.age * 12) * e.sc);
        const inward = Math.max(-1, Math.min(1, (m - want) / (60 * e.sc)));
        e.x += (tx * inward * e.sp * 0.85 - ty * e.sp) * dt;
        e.y += (ty * inward * e.sp * 0.85 + tx * e.sp) * dt;
      } else if (T.hold) {
        const push = Math.max(-1, Math.min(1, (m - T.hold * e.sc) / (70 * e.sc)));
        e.x += tx * e.sp * push * dt;
        e.y += ty * e.sp * push * dt;
      } else {
        e.x += tx * e.sp * dt;
        e.y += ty * e.sp * dt +
          (T.zig ? Math.sin(e.wob * 1.7) * T.zig : Math.sin(e.wob) * 8) * e.sc * mir * dt;
      }

      if (rushMul > 1) {
        e.x += tx * e.sp * (rushMul - 1) * dt;
        e.y += ty * e.sp * (rushMul - 1) * dt;
      }

      /* a sideways juke — enough to slip a bullet already on its way */
      if (T.jump) {
        if (e.jT > 0) {
          e.jT -= dt;
          e.x += -ty * e.jdir * e.sp * 5.5 * dt;
          e.y += tx * e.jdir * e.sp * 5.5 * dt;
        } else {
          e.jt -= dt;
          if (e.jt <= 0) {
            e.jt = 1.2 + Math.random() * 1.5;
            e.jT = 0.18; e.jdir = Math.random() < 0.5 ? -1 : 1;
            e.jv = [-ty * e.jdir, tx * e.jdir];
          }
        }
      }

      if (T.blink) {
        e.bk -= dt;
        if (e.bk <= 0 && m > T.blink.d * e.sc * 0.8) {
          e.bk = T.blink.cd;
          R.fx.push({ x: e.x, y: e.y, t: 0, life: 0.3, rad: e.r * 1.8, hue: T.hue, ring: true, width: 3 });
          e.x += tx * T.blink.d * e.sc; e.y += ty * T.blink.d * e.sc;
          R.fx.push({ x: e.x, y: e.y, t: 0, life: 0.3, rad: e.r * 1.8, hue: T.hue, ring: true, width: 3 });
        }
      }

      /* the pull attacks the one thing you actually control: where you stand */
      if (T.pull) {
        const pl = R.player;
        if (pl.alive) {
          const vx2 = e.x - pl.x, vy2 = e.y - pl.y, vm = Math.hypot(vx2, vy2) || 1;
          const pr = T.pull.r * e.sc;
          if (vm < pr) {
            const force = (1 - vm / pr) * T.pull.f * e.sc;
            pl.x += (vx2 / vm) * force * dt;
            pl.y += (vy2 / vm) * force * dt;
          }
        }
      }

      if (T.shoot) {
        e.cool -= dt;
        if (e.cool <= 0 && (T.shoot.ring || m < 520 * e.sc)) {
          e.cool = T.shoot.cd;
          const sn = T.shoot.n;
          for (let q = 0; q < sn; q++) {
            const sa = T.shoot.ring
              ? (q * TAU) / sn + e.age * 0.5 + this.mirA()
              : e.aim + (sn > 1 ? (q - (sn - 1) / 2) * (T.shoot.spread || 0.2) : 0);
            const ex = e.x + Math.cos(sa) * e.r * 1.3, ey = e.y + Math.sin(sa) * e.r * 1.3;
            R.ebul.push({
              x: ex, y: ey, px: e.x, py: e.y,
              vx: Math.cos(sa) * T.shoot.sp * e.sc, vy: Math.sin(sa) * T.shoot.sp * e.sc,
              r: 7 * e.sc, dmg: T.shoot.dmg, life: 4, tr: [ex, ey, ex, ey],
            });
          }
        }
      }

      if (T.lays) {
        e.cool2 -= dt;
        if (e.cool2 <= 0) {
          e.cool2 = T.lays.cd;
          const m = this.mir();
          R.mines.push({
            x: tu.x + (Math.random() - 0.5) * 90 * e.sc * m,
            y: tu.y + (Math.random() - 0.5) * 90 * e.sc * m,
            t: MINE_FUSE, life: MINE_FUSE, r: MINE_R * this.roundScale(),
          });
          this.hooks.sfx("mine");
        }
      }

      if (T.spawns && e.spawnLeft > 0 && R.enemies.length < this.enemyCap()) {
        e.spawnT -= dt;
        if (e.spawnT <= 0) {
          e.spawnT = T.spawns.cd;
          e.spawnLeft--;
          const m = this.mir();
          this.spawnAt(e.x + (Math.random() - 0.5) * 80 * e.sc * m,
            e.y + (Math.random() - 0.5) * 80 * e.sc * m, T.spawns.t, e.w);
        }
      }

      /* contact */
      m = Math.hypot(tu.x - e.x, tu.y - e.y) || 1;
      if (m < e.r + tu.r && tu.hitCd <= 0 && !e.hidden) {
        const took = this.hurtUnit(tu, e.dmg);
        tu.hitCd = 0.7;
        this.shove(e, -(tu.x - e.x) / m, -(tu.y - e.y) / m, 26 * e.sc);
        if (took && tu.kind === "player") {
          R.shake = Math.max(R.shake, 4); R.hurtFlash = 1;
          this.hooks.sfx("hurt"); this.hooks.haptic("medium");
        }
      }
    }
  }

  /* --- bullets, swept against the segment they crossed this step --- */
  private stepBullets(dt: number) {
    const R = this.R!, { W, H } = R;
    for (let i = R.bullets.length - 1; i >= 0; i--) {
      const b = R.bullets[i];
      b.px = b.x; b.py = b.y;
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      b.tr.push(b.x, b.y);
      if (b.tr.length > 10) b.tr.splice(0, 2);
      if (b.life <= 0 || b.x < -30 || b.x > W + 30 || b.y < -30 || b.y > H + 30) {
        R.bullets.splice(i, 1); continue;
      }
      for (let j = R.enemies.length - 1; j >= 0; j--) {
        const e2 = R.enemies[j];
        if (ETYPES[e2.type].invuln || e2.hidden) continue;
        if (b.hit && b.hit.indexOf(e2) >= 0) continue;
        const rr = e2.r + b.r;
        if (Game.segDist2(b.px, b.py, b.x, b.y, e2.x, e2.y) < rr * rr) {
          if (b.pierce > 0) { b.pierce--; (b.hit || (b.hit = [])).push(e2); }
          else R.bullets.splice(i, 1);
          // a small spark where it landed, so a hit reads even on a survivor
          R.fx.push({
            x: b.x, y: b.y, t: 0, life: 0.16, rad: b.r * 2.4,
            hue: b.hue, ring: true, width: 2,
          });
          this.hurtEnemy(e2, b.dmg, j);
          break;
        }
      }
    }
  }

  /* ================= round end ================= */

  /** Whether the level just played can be attempted again. */
  canRetry() {
    const R = this.R;
    return !!R && this.run.lives > 0 && (R.reason === "popped" || R.reason === "wiped");
  }

  /** Spend a life and play the same level over. The failed attempt leaves nothing. */
  retry() {
    if (!this.canRetry()) return;
    this.run.lives--;
    this.pendingGhost = null;
    this.startRound();
  }

  private endRound() {
    const R = this.R!;
    if (this.isFinal() && R.reason === "cleared") {
      this.pendingGhost = null;
      this.setPhase("finish");
      this.hooks.sfx("win");
      return;
    }
    if (R.reason === "wiped") {
      // A wipe leaves no recording to keep, so the only way on is another attempt.
      this.pendingGhost = null;
      if (this.run.lives > 0) { this.setPhase("end"); this.hooks.sfx("lose"); }
      else { this.setPhase("finish"); this.hooks.sfx("lose"); }
      return;
    }
    const dur = (R.rec.pts.length / 2) * REC_DT;
    this.pendingGhost = {
      pts: R.rec.pts, events: R.rec.events,
      round: this.run.round, level: this.run.round, aw: R.W, ah: R.H,
      build: { ...this.run.build },
      dur, full: R.reason === "survived" || R.reason === "cleared",
      hue: Game.ghostHue(this.run.round),
    };
    this.setPhase("end");
  }

  /**
   * Take the ditto and the boon in one move. Nothing here edits a past round: the
   * recording joins the squad as it stands, and the only choice is the one boon that
   * shapes the level ahead — and the ditto that level will leave behind.
   */
  advance(id: keyof Build) {
    if (!this.pendingGhost) return;
    this.run.ghosts.push(this.pendingGhost);
    this.pendingGhost = null;
    this.run.round++;
    this.run.build[id] = (this.run.build[id] || 0) + 1;
    this.startRound();
  }

  /** Progress as a fraction, never as a number of seconds. */
  progress(): number {
    const R = this.R;
    if (!R) return 1;
    let left: number;
    if (this.isBoss()) {
      let pending = 0;
      for (const w of R.waves) pending += w.n - w.sent;
      left = R.army ? (pending + R.enemies.length) / R.army : 0;
    } else {
      left = Math.max(0, 1 - R.t / ROUND_TIME);
    }
    return Math.max(0, Math.min(1, left));
  }
}
