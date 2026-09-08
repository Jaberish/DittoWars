/**
 * Ditto Wars — tuning constants.
 *
 * Every number here was balanced in the original build and is carried over
 * unchanged, so the React Native port plays identically: same shots-to-kill,
 * same wave sizes, same deathmatch length.
 */

export const ARENA_BASE = 900;
/**
 * The camera pulls back by the same *proportion* every round rather than the same
 * number of units.
 *
 * Adding a fixed 28 units was 3.1% at level two and 0.8% by level ninety-nine, so the
 * pull-back quietly stopped happening — and a ditto eighteen rounds old still filled
 * 86% of the frame. A flat 3.5% beats the old rate at every level and never decays: a
 * ditto eighteen rounds old is 54% of you, at level twenty and at level ninety, so
 * your past selves shrink and keep shrinking while you stay exactly the same size.
 */
export const ARENA_GROWTH = 1.035;
export const ARENA_CAP = 99;

/**
 * The player's radius at level 1, in arena-base units. Everything spatial is
 * expressed at this scale and multiplied by `arenaScale(level)` on the way out, so
 * the arena can grow without the game changing size on screen.
 */
export const PLAYER_R = 15;
export const BULLET_SP = 560;

export const ROUND_TIME = 30;
export const REC_DT = 1 / 20;
export const MAX_ROUNDS = 100;
export const BOSS_EVERY = 10;

/** Most recent dittos fielded. Ninety-nine bubbles is not a game. */
export const DITTO_CAP = 18;
/**
 * A ditto is a recording, and a recording hits like one. You are the only thing on
 * the field playing at full strength — which is what keeps one player useful beside
 * eighteen of their own past selves.
 */
export const GHOST_DMG = 0.45;
export const PLAYER_EDGE = 2.0;

/**
 * Bubbles are thin now. You go down in a handful of contacts rather than a dozen,
 * and so do your dittos — which is what the lives are for.
 */
export const HP_PLAYER = 4;
export const HP_GHOST = 2;
export const HP_PER_LEVEL = 0.19;

/** Retries. Spend one to play a level again instead of living with a short ditto. */
export const LIVES = 3;

export const BLOOM_MUL = 1.5;
export const BLOOM_R = 130;
export const BLOOM_LIFE = 7;
export const BLOOM_SEED = 51423;

export const DASH_CD = 1.6;
export const DASH_TIME = 0.22;
/**
 * How long a dash carries you over a sweep.
 *
 * Slightly longer than the dash itself, and comfortably longer than the time the band
 * takes to pass over you — so a well-timed dash clears it and a panicked one does
 * not. Nothing is recorded about a dash, so no ditto can ever do this: it is the one
 * move on the board that only the living player has.
 */
export const DASH_INV = 0.5;

/** Deathmatch reinforcements stop here, or the board can never be cleared. */
/**
 * What a formation costs its wave. A set-piece puts a dozen enemies on the floor at
 * once, so it draws several sends from the wave's budget rather than one — the wave
 * arrives in shapes instead of a trickle without the level quietly getting bigger.
 */
export const FORM_COST = 5;

/** Deathmatch bosses, against a team that outguns anything its own size. */
export const BOSS_HP = 2;

/**
 * A shove is a velocity, not a teleport. `KNOCK_DECAY` bleeds it off, and the launch
 * speed is the distance you want times the decay rate — so a nova still moves things
 * about as far as it used to, you just get to watch it happen.
 */
export const KNOCK_DECAY = 9;

/**
 * Relief, kept where it is least convenient.
 *
 * Health and shields land against the arena wall — the one part of the floor enemies
 * arrive through — so taking one means leaving the middle for it. They are seeded per
 * block like the blooms, which means the walk out to a corner becomes a route, and a
 * route walked this level is a ditto standing in that corner next level. Nothing in
 * the game can push a ditto anywhere; the only way to spread the squad out is to
 * spread yourself out while it is recording.
 */
export const PICK_FROM = 3;
export const PICK_CD = 10.5;
export const PICK_LIFE = 9;
export const PICK_INSET = 0.075;
export const PICK_R = 26;
export const HEAL_FRAC = 0.45;
export const SHIELD_TIME = 6;
export const PICK_SEED = 33179;

/**
 * The sweep: a band that crosses the arena, announced before it moves.
 *
 * A recording cannot dodge something that was not there when it was recorded, so a
 * sweep is the one thing on the board that reliably thins the squad — and the one
 * thing you can walk out of. Its damage is set to end a ditto and only scratch an
 * enemy, so what it removes is the crowd of your own past selves.
 */
export const SWEEP_FROM = 12;
export const SWEEP_CD = 13;
export const SWEEP_WARN = 1.5;
export const SWEEP_CROSS = 2.6;
export const SWEEP_WIDTH = 120;
/** How much of the far axis a band covers: a lane, not the whole floor. */
export const SWEEP_LANE = 0.55;
/** Damage as a share of a ditto's full health — it finishes the hurt, not the whole squad. */
export const SWEEP_BITE = 0.8;
export const SWEEP_SEED = 71741;

/**
 * Anything that would land on screen smaller than this is not worth simulating.
 *
 * The threshold is measured against the arena rather than the device, so a phone and
 * a tablet field exactly the same wave — a screen-dependent enemy count would make
 * the difficulty depend on the hardware, and would break the guarantee that a
 * replayed wave is the wave it was. `REF_PX` is the short side of a reference phone
 * after the arena's 94% fit; the smallest bodies in the roster (motes, spores) sit
 * right on the line, so what this drops is those from older waves — the specks.
 */
export const MIN_PX = 2;
export const REF_PX = 367;

/** How much of a sweep's warning is spent before it starts to move. */
export const SWEEP_WARN_LONG = 1.9;

export const DM_SPAWN_END = 75;

export const BOMB_AT = 4;
export const BOMB_MAX = 1;
export const BOMB_SEED = 90210;
export const MINE_FUSE = 2.2;
export const MINE_R = 110;
export const MINE_DMG = 4;

/**
 * The siege on the bloom.
 *
 * From the level after the first deathmatch, shells start falling on the bloom, so
 * the best patch of floor in the arena is never simply free. They land off-centre
 * and cover part of the circle rather than all of it: the answer is to keep moving
 * inside the bloom, not to abandon it. Placement is seeded per block of ten levels
 * like everything else here, so a ditto that stepped around a shell last level steps
 * around it again.
 */
export const SIEGE_FROM = BOSS_EVERY + 1;
export const SIEGE_CD = 3.2;
export const SIEGE_FUSE = 2.4;
export const SIEGE_OFFSET = 0.44;
export const SIEGE_R = 0.62;
export const SIEGE_SEED = 60931;

/** The level card holds, then lifts as the round begins. */
export const INTRO_HOLD = 1.15;
export const INTRO_LIFT = 0.85;

export interface Boon {
  id: BoonId;
  name: string;
  hue: number;
  /** what it gives */
  desc: string;
  /** what it takes */
  cost: string;
}

export type BoonId = "rapid" | "punch" | "vigor" | "reach" | "surge";

/**
 * Every boon gives and takes, so a Rapid ditto and a Punch ditto are different
 * objects rather than two points on one curve.
 */
export const BOONS: Boon[] = [
  { id: "rapid", name: "Rapid", hue: 45, desc: "Fire rate", cost: "damage" },
  { id: "punch", name: "Punch", hue: 12, desc: "Damage", cost: "fire rate" },
  { id: "vigor", name: "Vigor", hue: 150, desc: "Health", cost: "fire rate" },
  { id: "reach", name: "Reach", hue: 200, desc: "Range and pierce", cost: "damage" },
  { id: "surge", name: "Surge", hue: 285, desc: "Pop", cost: "fire rate" },
];

/**
 * Stacks saturate rather than compound. A first pick is worth about three times what
 * it used to be — a real decision at the moment you make it — while ninety-nine of
 * them still add up to something a level can be balanced against.
 */
export const BOON_CEIL = 1.2;
export const BOON_RATE = 0.9;

export function sat(n: number, ceil: number, rate: number) {
  return 1 + ceil * (1 - Math.pow(rate, n));
}
export function cut(n: number, floor: number, rate: number) {
  return 1 - floor * (1 - Math.pow(rate, n));
}
