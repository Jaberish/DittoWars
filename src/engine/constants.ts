/**
 * Ditto Wars — tuning constants.
 *
 * Every number here was balanced in the original build and is carried over
 * unchanged, so the React Native port plays identically: same shots-to-kill,
 * same wave sizes, same deathmatch length.
 */

export const ARENA_BASE = 900;
export const ARENA_STEP = 20;
export const ARENA_CAP = 99;

export const ROUND_TIME = 30;
export const REC_DT = 1 / 20;
export const MAX_ROUNDS = 100;
export const BOSS_EVERY = 10;

/** Most recent dittos fielded. Ninety-nine bubbles is not a game. */
export const DITTO_CAP = 18;
export const GHOST_DMG = 0.6;

export const BLOOM_MUL = 1.5;
export const BLOOM_R = 130;
export const BLOOM_LIFE = 7;
export const BLOOM_SEED = 51423;

export const DOZE_TIME = 0.55;
export const DOZE_SPEED = 720;
export const DOZE_DMG = 14;
export const DOZE_CD = 9;
export const DASH_CD = 1.6;

/** Deathmatch reinforcements stop here, or the board can never be cleared. */
export const DM_SPAWN_END = 75;

export const BOMB_AT = 4;
export const BOMB_MAX = 1;
export const BOMB_SEED = 90210;
export const MINE_FUSE = 2.2;
export const MINE_R = 110;
export const MINE_DMG = 4;

/** The level card holds, then lifts as the round begins. */
export const INTRO_HOLD = 1.15;
export const INTRO_LIFT = 0.85;

export interface Boon {
  id: BoonId;
  name: string;
  hue: number;
  desc: string;
}

export type BoonId = "rapid" | "punch" | "vigor" | "reach" | "surge";

/**
 * Every boon gives and takes, so a Rapid ditto and a Punch ditto are different
 * objects rather than two points on one curve.
 */
export const BOONS: Boon[] = [
  { id: "rapid", name: "Rapid", hue: 45, desc: "+4.7% fire rate · −3% damage" },
  { id: "punch", name: "Punch", hue: 12, desc: "+5% damage · −3% fire rate" },
  { id: "vigor", name: "Vigor", hue: 150, desc: "+1.5 health · −1.5% fire rate" },
  { id: "reach", name: "Reach", hue: 200, desc: "+18 range, +1 pierce per 4 · −1.5% damage" },
  { id: "surge", name: "Surge", hue: 285, desc: "Pop −0.25s, +8 wide · −2% fire rate" },
];
