import type { BoonId } from "./constants";

export type Build = Partial<Record<BoonId, number>>;

export type Phase = "menu" | "intro" | "playing" | "end" | "finish" | "boons";

export interface Stats {
  dmg: number;
  cool: number;
  range: number;
  speed: number;
  bulletSp: number;
  pierce: number;
  hpBonus: number;
  novaCd: number;
  novaR: number;
  /** How much bigger this unit's world was than the level-one arena. */
  scale: number;
}

export type RecEvent = { t: number; k: "pop" };

/** A recorded run: positions at 20 Hz, plus the ability beats between them. */
export interface Ghost {
  pts: number[];
  events: RecEvent[];
  round: number;
  level: number;
  aw: number;
  ah: number;
  build: Build;
  dur: number;
  full: boolean;
  hue: number;
}

export interface Unit {
  kind: "player" | "ghost";
  x: number;
  y: number;
  r: number;
  hp: number;
  max: number;
  level: number;
  st: Stats;
  hue: number;
  fire: number;
  alive: boolean;
  hitCd: number;
  aim: number;
  muzzle: number;
  dashT: number;
  dashCd: number;
  novaCd: number;
  lastDir: [number, number];
  evi: number;
  cyc: number;
  g: Ghost | null;
  ofx: number;
  ofy: number;
  fade: number;
  age: number;
  dur: number;
  expired?: boolean;
  /** render-only: velocity for squash-and-stretch */
  vx: number;
  vy: number;
  born: number;
}

export interface Enemy {
  x: number;
  y: number;
  hp: number;
  max: number;
  type: string;
  dmg: number;
  w: number;
  flash: number;
  r: number;
  sp: number;
  wind: number;
  dashT: number;
  dd: [number, number];
  aim: number;
  cool: number;
  cool2: number;
  spawnT: number;
  age: number;
  spawnLeft: number;
  ph: number;
  hidden: boolean;
  bk: number;
  jt: number;
  jT: number;
  jdir: number;
  jv?: [number, number];
  wob: number;
  /** the arena scale of the wave this belongs to; every distance it uses is in it */
  sc: number;
  /** render-only: spawn pop-in */
  born: number;
}

export interface Bullet {
  x: number;
  y: number;
  px: number;
  py: number;
  vx: number;
  vy: number;
  dmg: number;
  life: number;
  r: number;
  pierce: number;
  hit: Enemy[] | null;
  hue: number;
  ghost: boolean;
  /** render-only trail, newest last */
  tr: number[];
}

export interface EBullet {
  x: number;
  y: number;
  px: number;
  py: number;
  vx: number;
  vy: number;
  r: number;
  dmg: number;
  life: number;
  tr: number[];
}

export interface Mine {
  x: number;
  y: number;
  t: number;
  life: number;
  r: number;
}

export interface Fx {
  x: number;
  y: number;
  t: number;
  life: number;
  rad: number;
  hue: number;
  ring?: boolean;
  pop?: boolean;
  shard?: boolean;
  vx?: number;
  vy?: number;
  ang?: number;
  spin?: number;
  width?: number;
}

export interface Amb {
  x: number;
  y: number;
  r: number;
  vy: number;
  ph: number;
}

export interface Bloom {
  x: number;
  y: number;
  /** where it sits before the board is turned; the shelling pattern is keyed to it */
  cx: number;
  cy: number;
  r: number;
  t: number;
  life: number;
  wasIn: boolean;
  kind: "rapid" | "triple";
}

export interface Wave {
  k: number;
  rng: () => number;
  n: number;
  sent: number;
  form: "ring" | "line" | "pincer" | null;
  /** the sends at which the trickle gives way to a formation */
  formAt: number[];
  /** how many of those have already landed */
  formIdx: number;
  gap: number;
  acc: number;
}

export interface RunState {
  round: number;
  ghosts: Ghost[];
  popped: number;
  build: Build;
}

export interface RoundState {
  t: number;
  over: boolean;
  reason: "" | "popped" | "survived" | "wiped" | "cleared";
  shake: number;
  /** brief slow-motion on a heavy beat */
  hitStop: number;
  /** red edge pulse when the player takes a hit */
  hurtFlash: number;
  units: Unit[];
  player: Unit;
  enemies: Enemy[];
  bullets: Bullet[];
  ebul: EBullet[];
  mines: Mine[];
  fx: Fx[];
  amb: Amb[];
  rec: { pts: number[]; events: RecEvent[] };
  recAcc: number;
  waves: Wave[];
  popped: number;
  army: number;
  bloom: Bloom | null;
  bloomRng: () => number;
  bloomAcc: number;
  siegeNext: number;
  /** which shell of the current bloom's bombardment comes next */
  siegeShot: number;
  bombNext: number;
  typeSet: string[];
  W: number;
  H: number;
  /** counts down from INTRO_HOLD + INTRO_LIFT while the level card lifts */
  intro: number;
}

export type SfxName =
  | "shoot" | "pop" | "hurt" | "dash" | "nova"
  | "bloom" | "bloom3" | "mine" | "boom" | "ui" | "round" | "form"
  | "win" | "lose";
