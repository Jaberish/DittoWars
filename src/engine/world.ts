import {
  ARENA_BASE, ARENA_CAP, ARENA_STEP, BLOOM_LIFE, BLOOM_MUL, BLOOM_R, BLOOM_SEED,
  BOMB_AT, BOMB_MAX, BOMB_SEED, BOONS, BOSS_EVERY, DASH_CD, DITTO_CAP,
  BULLET_SP, DM_SPAWN_END, GHOST_DMG, INTRO_HOLD, PLAYER_R,
  FORM_COST, SIEGE_CD, SIEGE_FROM, SIEGE_FUSE, SIEGE_OFFSET, SIEGE_R, SIEGE_SEED,
  INTRO_LIFT, MAX_ROUNDS, MINE_DMG, MINE_FUSE, MINE_R, REC_DT, ROUND_TIME,
} from "./constants";
import { ETYPES, blockTypes, bossFor, newestTypeAt } from "./enemies";
import { mkRng } from "./rng";
import type {
  Build, Bullet, Enemy, Ghost, Phase, RoundState, RunState, SfxName, Stats, Unit, Wave,
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
  run: RunState = { round: 1, ghosts: [], popped: 0, build: {} };
  R: RoundState | null = null;
  phase: Phase = "menu";
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

  newRun() {
    this.run = { round: 1, ghosts: [], popped: 0, build: {} };
    this.pendingGhost = null;
  }

  /* ================= scaling ================= */

  isBoss() { return this.run.round % BOSS_EVERY === 0; }
  isFinal() { return this.run.round >= MAX_ROUNDS; }
  bloomBlock() { return Math.floor((this.run.round - 1) / BOSS_EVERY); }
  enemyCap() { return Math.min(170, 90 + Math.floor(this.run.round / 4) * 6); }

  /** Same play area every level; the screen's proportions decide its shape. */
  arenaSize(r: number): [number, number] {
    const base = ARENA_BASE + Math.min(r - 1, ARENA_CAP) * ARENA_STEP;
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
    return (ARENA_BASE + Math.min(level - 1, ARENA_CAP) * ARENA_STEP) / ARENA_BASE;
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
      // Doze used to be a quarter of the team's output — every ditto replayed its
      // sweep — so the gun carries that share now. Shots-to-kill stays flat across
      // the run at a little over two; the whole curve is built on that number.
      dmg: (1 + level * 0.31) *
        Math.pow(0.97, rapid) * Math.pow(1.05, punch) * Math.pow(0.985, reach),
      cool: (0.38 / (1 + level * 0.03)) *
        Math.pow(0.955, rapid) * Math.pow(1.03, punch) *
        Math.pow(1.015, vigor) * Math.pow(1.02, surge),
      range: (330 + reach * 18) * sc,
      speed: 210 * sc,
      bulletSp: BULLET_SP * sc,
      pierce: Math.floor(reach / 4),
      hpBonus: vigor * 1.5,
      novaCd: Math.max(2.5, 7 - surge * 0.25),
      novaR: (170 + surge * 8) * sc,
      scale: sc,
    };
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
    const hp = (kind === "player" ? 6 : 4) + level * 0.3 + s.hpBonus;
    return {
      kind, x, y, r: Game.radiusFor(level),
      hp, max: hp, level, st: s, hue,
      fire: Math.random() * 0.25, alive: true, hitCd: 0, aim: 0, muzzle: 0,
      dashT: 0, dashCd: 0, novaCd: 0,
      lastDir: [1, 0], evi: 0, cyc: -1, g: null, ofx: 0, ofy: 0, fade: 1,
      age: 0, dur: 0, vx: 0, vy: 0, born: 0,
    };
  }

  /* ================= waves ================= */

  /**
   * Every third wave arrives as a shape instead of a trickle, twice over, and a
   * wave replays identically for the rest of the run — so the same set-piece lands
   * on the same beat, level after level.
   */
  private formationFor(k: number): Wave["form"] {
    if (k % 3 !== 0) return null;
    return (["ring", "line", "pincer"] as const)[Math.floor(k / 3) % 3];
  }

  private mkWave(k: number): Wave {
    // Size follows the wave's position inside its block, not the absolute level, so
    // a freshly wiped board ramps up again instead of throwing level-13 volume at a
    // team of one. Toughness still scales with the absolute level.
    const lk = ((k - 1) % BOSS_EVERY) + 1;
    let n = Math.min(9 + Math.floor(lk * 1.4), 24);
    if (this.isBoss()) n = Math.max(4, Math.round(n * 0.55));
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
    p.dashCd = DASH_CD; p.dashT = 0.16;
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
    const dmg = 6 * power * (u.kind === "ghost" ? GHOST_DMG : 1);
    R.fx.push({ x: u.x, y: u.y, t: 0, life: 0.55, rad, hue: u.hue, ring: true, width: 6 });
    R.fx.push({ x: u.x, y: u.y, t: 0, life: 0.34, rad: rad * 0.55, hue: u.hue, ring: true, width: 3 });
    if (u.kind === "player") { R.shake = Math.max(R.shake, 6); this.hooks.sfx("nova"); }
    for (let i = R.enemies.length - 1; i >= 0; i--) {
      const e = R.enemies[i];
      const dx = e.x - u.x, dy = e.y - u.y, d = Math.hypot(dx, dy) || 1;
      if (d < rad) {
        const kb = 46 * u.st.scale;
        e.x += (dx / d) * kb; e.y += (dy / d) * kb;
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
          uz.hp -= T.explode.dmg * (uz.kind === "player" ? 1 : 0.5);
          if (uz.kind === "player") { this.hooks.sfx("hurt"); R.hurtFlash = 1; }
          if (uz.hp <= 0) uz.alive = false;
        }
      }
    }

    if (T.boss) { R.shake = Math.max(R.shake, 14); R.hitStop = Math.max(R.hitStop, 0.16); }

    R.fx.push({ x: e.x, y: e.y, t: 0, life: 0.34, rad: e.r * 1.35, hue: T.hue, ring: true, width: 4 });
    for (let k2 = 0; k2 < 6; k2++)
      R.fx.push({
        x: e.x, y: e.y, t: 0, life: 0.34 + Math.random() * 0.2, pop: true,
        vx: (Math.random() - 0.5) * 210, vy: (Math.random() - 0.5) * 210,
        rad: 2 + Math.random() * 4, hue: T.hue,
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
    let hp = (3 + (k - 1) * 0.7) * t.hp;     // wave k is as tough as ditto k is strong
    if (t.boss && this.run.round === BOSS_EVERY) hp *= 0.7;   // first boss, first lesson
    // Frozen at its wave's scale, exactly like a ditto: an old wave is a smaller
    // wave, and the size difference is the same signal in both directions.
    const sc = scale ?? Game.arenaScale(k);
    R.enemies.push({
      x, y, hp, max: hp, type, dmg: t.dmg, w: k, flash: 0, sc,
      r: t.r * sc * (type === "mote" ? 0.6 : 1),
      sp: (52 + Math.min(k * 2, 46)) * t.sp * sc,
      wind: 1.2 + Math.random() * 1.6, dashT: 0, dd: [0, 0], aim: 0,
      cool: 0.6 + Math.random() * 1.6, cool2: 1 + Math.random(),
      spawnT: t.spawns ? t.spawns.cd : 2.5, age: 0,
      spawnLeft: t.spawns ? t.spawns.max || 8 : 0,
      ph: Math.random() * 3, hidden: false, bk: 1 + Math.random() * 2,
      jt: 0.7 + Math.random() * 1.5, jT: 0, jdir: 1,
      wob: wob === undefined ? Math.random() * 6.28 : wob,
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
    if (wv.form === "ring") {
      const rad = Math.min(W, H) * 0.42;
      for (let q = 0; q < 10; q++) {
        const ang = (q * TAU) / 10;
        const [fx, fy] = this.place(W / 2 + Math.cos(ang) * rad, H / 2 + Math.sin(ang) * rad);
        this.spawnAt(fx, fy, t, wv.k, ang);
      }
    } else if (wv.form === "line") {
      const side = (rnd() * 4) | 0;
      for (let q = 0; q < 8; q++) {
        const u = (q + 0.5) / 8;
        const at = (fx: number, fy: number) => {
          const [px, py] = this.place(fx, fy);
          this.spawnAt(px, py, t, wv.k, 0);
        };
        if (side === 0) at(u * W, -pad);
        else if (side === 1) at(u * W, H + pad);
        else if (side === 2) at(-pad, u * H);
        else at(W + pad, u * H);
      }
    } else {
      const horiz = rnd() < 0.5;
      for (let sd = 0; sd < 2; sd++)
        for (let q = 0; q < 5; q++) {
          const j = (q - 2) * 48 * sc;
          const [px, py] = horiz
            ? this.place(sd ? W + pad : -pad, H * 0.5 + j)
            : this.place(W * 0.5 + j, sd ? H + pad : -pad);
          this.spawnAt(px, py, t, wv.k, 0);
        }
    }
    R.fx.push({
      x: W / 2, y: H / 2, t: 0, life: 0.9, rad: Math.min(W, H) * 0.44,
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
              dmg: u.st.dmg * (u.kind === "ghost" ? GHOST_DMG : 1),
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
          uz.hp -= MINE_DMG * (uz.kind === "player" ? 1 : 0.5);
          if (uz.kind === "player") { this.hooks.sfx("hurt"); R.hurtFlash = 1; this.hooks.haptic("heavy"); }
          if (uz.hp <= 0) uz.alive = false;
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
          uu.hp -= eb.dmg;
          if (uu.kind === "player") {
            this.hooks.sfx("hurt"); R.shake = Math.max(R.shake, 4);
            R.hurtFlash = 1; this.hooks.haptic("medium");
          }
          if (uu.hp <= 0) uu.alive = false;
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
        tu.hp -= e.dmg; tu.hitCd = 0.7;
        const kb = 26 * e.sc;
        e.x -= ((tu.x - e.x) / m) * kb; e.y -= ((tu.y - e.y) / m) * kb;
        if (tu.kind === "player") {
          R.shake = Math.max(R.shake, 4); R.hurtFlash = 1;
          this.hooks.sfx("hurt"); this.hooks.haptic("medium");
        }
        if (tu.hp <= 0) tu.alive = false;
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

  private endRound() {
    const R = this.R!;
    if (R.reason === "wiped" || (this.isFinal() && R.reason === "cleared")) {
      this.pendingGhost = null;
      this.setPhase("finish");
      this.hooks.sfx(R.reason === "cleared" ? "win" : "lose");
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

  /** Nothing here edits a past round; the new ditto simply joins the squad. */
  acceptGhost() {
    if (!this.pendingGhost) return;
    this.run.ghosts.push(this.pendingGhost);
    this.pendingGhost = null;
    this.run.round++;
    this.setPhase("boons");
  }

  pickBoon(id: keyof Build) {
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
