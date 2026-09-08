import { BOSS_EVERY } from "./constants";
import { mkRng } from "./rng";

export type Shape =
  | "circle" | "arrow" | "hex" | "lobes" | "pent" | "diamond"
  | "oct" | "star" | "ring" | "tri" | "square";

export interface EType {
  at: number;
  r: number;
  hp: number;
  sp: number;
  dmg: number;
  hue: number;
  sat: number;
  shape: Shape;
  jump?: 1;
  charge?: { cd: number; t: number; mul: number };
  orbitR?: number;
  explode?: { r: number; dmg: number };
  splits?: { t: string; n: number };
  zig?: number;
  boss?: 1;
  spawns?: { t: string; cd: number; max: number };
  hold?: number;
  shoot?: { cd: number; n: number; sp: number; dmg: number; ring?: 1; spread?: number };
  minion?: 1;
  pull?: { r: number; f: number };
  shield?: number;
  blink?: { cd: number; d: number };
  phase?: { on: number; off: number };
  regen?: number;
  slow?: { r: number; mul: number };
  lays?: { cd: number };
  invuln?: 1;
  flyer?: 1;
}

/**
 * Each row is data, not code: shape and hue make it recognisable, the trait
 * fields drive one shared behaviour pass and one shared mark-drawing pass.
 * `at` is the level that introduces it.
 */
export const ETYPES: Record<string, EType> = {
  basic:  { at:1,  r:13, hp:1.0,  sp:0.95, dmg:1, hue:4,   sat:86, shape:"circle" },
  drift:  { at:2,  r:13, hp:1.0,  sp:1.00, dmg:1, hue:16,  sat:90, shape:"circle",  jump:1 },
  mote:   { at:3,  r:11, hp:0.28, sp:1.55, dmg:1, hue:32,  sat:92, shape:"circle" },
  lance:  { at:4,  r:14, hp:0.9,  sp:0.55, dmg:2, hue:20,  sat:95, shape:"arrow",   charge:{cd:2.6,t:0.5,mul:4.6} },
  husk:   { at:5,  r:21, hp:4.2,  sp:0.62, dmg:2, hue:350, sat:62, shape:"hex",     jump:1 },
  orbit:  { at:6,  r:15, hp:1.9,  sp:1.05, dmg:1, hue:315, sat:74, shape:"circle",  orbitR:210 },
  bloat:  { at:7,  r:24, hp:2.6,  sp:0.50, dmg:1, hue:338, sat:72, shape:"circle",  explode:{r:150,dmg:3} },
  split:  { at:8,  r:17, hp:1.8,  sp:0.86, dmg:1, hue:288, sat:80, shape:"lobes",   splits:{t:"mote",n:2} },
  waft:   { at:9,  r:16, hp:0.8,  sp:0.62, dmg:1, hue:38,  sat:84, shape:"pent",    zig:34 },
  colos:  { at:10, r:50, hp:9,    sp:0.30, dmg:3, hue:0,   sat:52, shape:"circle",  boss:1, spawns:{t:"mote",cd:2.5,max:10} },
  spit:   { at:11, r:16, hp:1.3,  sp:0.58, dmg:1, hue:265, sat:80, shape:"circle",  hold:270, shoot:{cd:2.2,n:1,sp:210,dmg:2} },
  brood:  { at:12, r:22, hp:2.2,  sp:0.70, dmg:1, hue:50,  sat:88, shape:"lobes",   splits:{t:"spore",n:20} },
  spore:  { at:999,r:8,  hp:0.10, sp:1.70, dmg:1, hue:44,  sat:96, shape:"circle",  minion:1 },
  shard:  { at:13, r:12, hp:0.7,  sp:1.30, dmg:1, hue:330, sat:90, shape:"diamond", jump:1, splits:{t:"mote",n:2} },
  weave:  { at:16, r:14, hp:1.1,  sp:1.15, dmg:1, hue:45,  sat:90, shape:"diamond", zig:26 },
  ward:   { at:19, r:18, hp:2.4,  sp:0.60, dmg:1, hue:300, sat:60, shape:"oct",     shield:0.55 },
  blink:  { at:22, r:13, hp:0.9,  sp:0.90, dmg:1, hue:280, sat:85, shape:"star",    blink:{cd:3.0,d:190} },
  thorn:  { at:25, r:17, hp:1.6,  sp:0.70, dmg:1, hue:10,  sat:90, shape:"star",    shoot:{cd:3.0,n:6,sp:170,dmg:2,ring:1} },
  hulk:   { at:28, r:26, hp:6.0,  sp:0.50, dmg:3, hue:355, sat:58, shape:"hex",     jump:1, shield:0.8 },
  swarm:  { at:31, r:14, hp:1.2,  sp:0.95, dmg:1, hue:40,  sat:88, shape:"circle",  spawns:{t:"mote",cd:3.2,max:6} },
  lash:   { at:34, r:15, hp:1.0,  sp:0.60, dmg:2, hue:15,  sat:95, shape:"arrow",   charge:{cd:2.2,t:0.75,mul:5.2} },
  glob:   { at:37, r:22, hp:2.4,  sp:0.60, dmg:1, hue:300, sat:76, shape:"lobes",   explode:{r:130,dmg:3}, splits:{t:"mote",n:3} },
  siren:  { at:40, r:20, hp:2.0,  sp:0.55, dmg:1, hue:55,  sat:85, shape:"ring",    slow:{r:260,mul:0.55} },
  pike:   { at:43, r:16, hp:1.2,  sp:0.62, dmg:2, hue:25,  sat:92, shape:"tri",     charge:{cd:2.8,t:0.45,mul:4.2}, shoot:{cd:3.4,n:1,sp:230,dmg:2} },
  mendr:  { at:46, r:19, hp:3.0,  sp:0.72, dmg:1, hue:345, sat:70, shape:"pent",    regen:0.9 },
  hive:   { at:49, r:28, hp:5.0,  sp:0.45, dmg:2, hue:285, sat:74, shape:"oct",     spawns:{t:"split",cd:5.0,max:4} },
  vortx:  { at:50, r:19, hp:2.2,  sp:0.70, dmg:1, hue:58,  sat:88, shape:"circle",  pull:{r:280,f:130} },
  razor:  { at:52, r:11, hp:0.6,  sp:1.70, dmg:1, hue:30,  sat:95, shape:"star",    jump:1 },
  bulwk:  { at:55, r:30, hp:8.0,  sp:0.36, dmg:3, hue:358, sat:55, shape:"square",  shield:0.5 },
  caster: { at:58, r:17, hp:1.5,  sp:0.55, dmg:1, hue:270, sat:82, shape:"pent",    hold:290, shoot:{cd:2.6,n:3,sp:200,dmg:2,spread:0.26} },
  wraith: { at:61, r:16, hp:1.4,  sp:0.95, dmg:1, hue:290, sat:70, shape:"circle",  phase:{on:1.4,off:2.2} },
  mortar: { at:64, r:19, hp:2.0,  sp:0.45, dmg:1, hue:12,  sat:86, shape:"hex",     hold:300, lays:{cd:3.4} },
  coil:   { at:67, r:21, hp:2.6,  sp:0.62, dmg:1, hue:62,  sat:84, shape:"ring",    pull:{r:240,f:105}, shoot:{cd:3.0,n:1,sp:190,dmg:2} },
  titan:  { at:70, r:58, hp:14,   sp:0.26, dmg:4, hue:350, sat:50, shape:"circle",  boss:1, spawns:{t:"husk",cd:4.5,max:12} },
  needle: { at:73, r:10, hp:0.5,  sp:1.90, dmg:1, hue:38,  sat:96, shape:"arrow",   charge:{cd:1.6,t:0.35,mul:5.6} },
  bulb:   { at:76, r:26, hp:3.0,  sp:0.48, dmg:1, hue:322, sat:76, shape:"circle",  explode:{r:200,dmg:4} },
  clust:  { at:79, r:20, hp:2.2,  sp:0.80, dmg:1, hue:282, sat:82, shape:"lobes",   splits:{t:"shard",n:3} },
  sentry: { at:82, r:18, hp:2.8,  sp:0.30, dmg:1, hue:258, sat:80, shape:"square",  shoot:{cd:2.8,n:8,sp:180,dmg:2,ring:1} },
  reaper: { at:85, r:15, hp:1.4,  sp:1.25, dmg:2, hue:5,   sat:92, shape:"star",    charge:{cd:2.4,t:0.5,mul:5.0}, explode:{r:130,dmg:3} },
  maw:    { at:88, r:26, hp:5.0,  sp:0.55, dmg:2, hue:340, sat:72, shape:"oct",     pull:{r:300,f:120} },
  spectr: { at:91, r:17, hp:1.6,  sp:1.05, dmg:1, hue:275, sat:76, shape:"circle",  phase:{on:1.2,off:1.8}, blink:{cd:3.6,d:210} },
  levia:  { at:94, r:64, hp:18,   sp:0.24, dmg:4, hue:0,   sat:54, shape:"circle",  boss:1, spawns:{t:"split",cd:4.0,max:14}, shoot:{cd:3.6,n:8,sp:170,dmg:3,ring:1} },
  shrike: { at:97, r:16, hp:1.1,  sp:0.75, dmg:2, hue:28,  sat:93, shape:"arrow",   charge:{cd:2.0,t:0.5,mul:4.8}, shoot:{cd:3.0,n:1,sp:240,dmg:2} },
  omega:  { at:100,r:76, hp:26,   sp:0.22, dmg:5, hue:352, sat:60, shape:"circle",  boss:1, shield:0.7, regen:1.4,
            spawns:{t:"hulk",cd:5.5,max:16}, shoot:{cd:3.0,n:10,sp:190,dmg:3,ring:1} },

  /** Pale, unkillable, and the only thing here not coming for anyone. */
  bomb:   { at:4,  r:16, hp:1,    sp:5.00, dmg:1, hue:352, sat:22, shape:"circle",  invuln:1, flyer:1 },
};

/** Introduction order, so a wave can open with the newest thing its round knows. */
export const TYPE_ORDER = Object.keys(ETYPES)
  .filter((k) => k !== "bomb")
  .sort((a, b) => ETYPES[a].at - ETYPES[b].at);

/**
 * A block of ten levels gets its own roster, fixed for the block. New types still
 * debut on their own level; the rest of the set is drawn once and held, so a block
 * has a character — chargers and shooters, or tanks and splitters — instead of
 * everything ever unlocked, all at once, forever.
 */
export function blockTypes(b: number): string[] {
  const maxLvl = (b + 1) * BOSS_EVERY;
  const minLvl = b * BOSS_EVERY + 1;
  const older: string[] = [];
  const fresh: string[] = [];
  for (const id of TYPE_ORDER) {
    const T = ETYPES[id];
    if (T.boss || T.minion || T.flyer || T.at > maxLvl) continue;
    (T.at >= minLvl ? fresh : older).push(id);
  }
  const rng = mkRng(4177 + b * 613);
  const set = fresh.slice();
  while (set.length < 8 && older.length)
    set.push(older.splice((rng() * older.length) | 0, 1)[0]);
  if (!set.length) set.push("basic");
  return set;
}

/** Every deathmatch is a boss fight: the biggest one you have earned. */
export function bossFor(lvl: number): string | null {
  let best: string | null = null;
  for (const id in ETYPES) {
    const T = ETYPES[id];
    if (!T.boss || T.at > lvl) continue;
    if (!best || T.at > ETYPES[best].at) best = id;
  }
  return best;
}

export function newestTypeAt(k: number): string {
  let best = "drift";
  for (const id of TYPE_ORDER) if (ETYPES[id].at <= k) best = id;
  return best;
}
