import {
  BlendMode, BlurStyle, ClipOp, FillType, PaintStyle, PointMode, Skia, StrokeCap,
  StrokeJoin, TileMode, createPicture,
  type SkCanvas, type SkColor, type SkPaint, type SkPath, type SkPicture, type SkPoint,
} from "@shopify/react-native-skia";
import { ETYPES, type EType } from "../engine/enemies";
import type { Game } from "../engine/world";
import type { Enemy, RoundState, Unit } from "../engine/types";
import { C, col, hsl } from "./palette";

const TAU = Math.PI * 2;

export interface Layout {
  vw: number;
  vh: number;
  scale: number;
  ox: number;
  oy: number;
}

export function layoutFor(vw: number, vh: number, W: number, H: number): Layout {
  const scale = Math.min(vw / W, vh / H) * 0.94;
  return { vw, vh, scale, ox: (vw - W * scale) / 2, oy: (vh - H * scale) / 2 };
}

const POLY: Record<string, number> = {
  arrow: 3, tri: 3, diamond: 4, square: 4, pent: 5, hex: 6, oct: 8,
};

/** Reusable paints and paths. Allocating these per draw is what makes a game stutter. */
class Pens {
  fill = Skia.Paint();
  stroke = Skia.Paint();
  glow = Skia.Paint();
  path = Skia.Path.Make();
  path2 = Skia.Path.Make();
  blur = new Map<number, ReturnType<typeof Skia.MaskFilter.MakeBlur>>();
  dash = new Map<string, ReturnType<typeof Skia.PathEffect.MakeDash>>();

  constructor() {
    this.fill.setAntiAlias(true);
    this.fill.setStyle(PaintStyle.Fill);
    this.stroke.setAntiAlias(true);
    this.stroke.setStyle(PaintStyle.Stroke);
    this.stroke.setStrokeCap(StrokeCap.Round);
    this.stroke.setStrokeJoin(StrokeJoin.Round);
    this.glow.setAntiAlias(true);
    this.glow.setStyle(PaintStyle.Fill);
    this.glow.setBlendMode(BlendMode.Plus);
  }

  blurOf(sigma: number) {
    const k = Math.round(sigma * 2) / 2;
    let m = this.blur.get(k);
    if (!m) { m = Skia.MaskFilter.MakeBlur(BlurStyle.Normal, Math.max(0.25, k), true); this.blur.set(k, m); }
    return m;
  }

  /**
   * Phase is quantised so a scrolling dash reuses a handful of effects per frame
   * instead of allocating a new one every time it moves.
   */
  dashOf(on: number, off: number, phase: number) {
    const ph = Math.round(phase * 2) / 2;
    const k = `${on}|${off}|${ph}`;
    let d = this.dash.get(k);
    if (!d) {
      d = Skia.PathEffect.MakeDash([on, off], ph);
      if (this.dash.size > 400) this.dash.clear();
      this.dash.set(k, d);
    }
    return d;
  }

  /** Solid fill, no shader, no blur — the state most draws want. */
  f(color: SkColor): SkPaint {
    this.fill.setColor(color);
    this.fill.setShader(null);
    this.fill.setMaskFilter(null);
    this.fill.setBlendMode(BlendMode.SrcOver);
    return this.fill;
  }

  s(color: SkColor, width: number): SkPaint {
    this.stroke.setColor(color);
    this.stroke.setStrokeWidth(width);
    this.stroke.setShader(null);
    this.stroke.setMaskFilter(null);
    this.stroke.setPathEffect(null);
    this.stroke.setBlendMode(BlendMode.SrcOver);
    return this.stroke;
  }

  /** Additive, blurred — every bit of light in the game goes through here. */
  g(color: SkColor, sigma: number): SkPaint {
    this.glow.setColor(color);
    this.glow.setMaskFilter(sigma > 0 ? this.blurOf(sigma) : null);
    this.glow.setBlendMode(BlendMode.Plus);
    this.glow.setStyle(PaintStyle.Fill);
    return this.glow;
  }
}

export class Renderer {
  private p = new Pens();
  private floorPic: SkPicture | null = null;
  private floorKey = "";
  private vigPic: SkPicture | null = null;
  private vigKey = "";
  private gridPts: SkPoint[] = [];
  private nearP: Unit | null = null;

  /* ================= the floor, drawn once per level ================= */

  /**
   * The arena never changes shape inside a level, so it is recorded once and
   * replayed as a single picture. The level numeral sits on top of this in the
   * view tree — literally the backdrop the round is played against.
   */
  floor(game: Game, lay: Layout): SkPicture {
    const R = game.R!;
    const key = `${R.W.toFixed(1)}|${R.H.toFixed(1)}|${game.run.round}|${lay.scale.toFixed(3)}|${lay.vw}x${lay.vh}`;
    if (this.floorPic && this.floorKey === key) return this.floorPic;
    this.floorKey = key;
    this.gridPts = [];
    const step = 58;
    for (let x = step; x < R.W; x += step)
      for (let y = step; y < R.H; y += step) this.gridPts.push({ x, y });

    this.floorPic = createPicture((canvas) => this.paintFloor(canvas, game, lay), {
      x: 0, y: 0, width: lay.vw, height: lay.vh,
    });
    return this.floorPic;
  }

  private paintFloor(canvas: SkCanvas, game: Game, lay: Layout) {
    const p = this.p, R = game.R!;
    canvas.drawColor(col(C.void));
    canvas.save();
    canvas.translate(lay.ox, lay.oy);
    canvas.scale(lay.scale, lay.scale);

    const rrect = Skia.RRectXY(Skia.XYWHRect(0, 0, R.W, R.H), 34, 34);

    // A dish of water lit from the middle, not a black box.
    p.fill.setShader(
      Skia.Shader.MakeRadialGradient(
        { x: R.W / 2, y: R.H / 2 }, Math.max(R.W, R.H) * 0.66,
        [col(C.floor0), col(C.floor1)], [0, 1], TileMode.Clamp,
      ),
    );
    p.fill.setColor(col("#FFFFFF"));
    p.fill.setMaskFilter(null);
    p.fill.setBlendMode(BlendMode.SrcOver);
    canvas.drawRRect(rrect, p.fill);
    p.fill.setShader(null);

    canvas.save();
    canvas.clipRRect(rrect, ClipOp.Intersect, true);

    // Survey dots: enough texture to read motion against, never enough to notice.
    const dots = p.s(col(C.line2, 0.16), 2.4);
    dots.setStrokeCap(StrokeCap.Round);
    canvas.drawPoints(PointMode.Points, this.gridPts, dots);

    // Growth rings — where the arena edge stood in earlier rounds.
    for (let gk = 1; gk < game.run.round; gk++) {
      const [aw, ah] = game.arenaSize(gk);
      const gx = (R.W - aw) / 2, gy = (R.H - ah) / 2;
      if (gx <= 0) continue;
      canvas.drawRRect(
        Skia.RRectXY(Skia.XYWHRect(gx, gy, aw, ah), 30, 30),
        p.s(col(C.line2, 0.14), 1.2),
      );
    }
    canvas.restore();

    // Rim: a soft inner bloom under a hard hairline, so the edge reads as a meniscus.
    const rim = p.s(col(C.film, 0.2), 8);
    rim.setMaskFilter(p.blurOf(9));
    canvas.drawRRect(rrect, rim);
    canvas.drawRRect(rrect, p.s(col(C.line), 2));
    canvas.restore();
  }

  /* ================= vignette, drawn once per resize ================= */

  vignette(lay: Layout): SkPicture {
    const key = `${lay.vw}x${lay.vh}`;
    if (this.vigPic && this.vigKey === key) return this.vigPic;
    this.vigKey = key;
    const p = this.p;
    this.vigPic = createPicture((canvas) => {
      p.fill.setShader(
        Skia.Shader.MakeRadialGradient(
          { x: lay.vw / 2, y: lay.vh / 2 }, Math.max(lay.vw, lay.vh) * 0.74,
          [col(C.void, 0), col("#03050C", 0.8)], [0.34, 1], TileMode.Clamp,
        ),
      );
      p.fill.setColor(col("#FFFFFF"));
      p.fill.setMaskFilter(null);
      p.fill.setBlendMode(BlendMode.SrcOver);
      canvas.drawRect(Skia.XYWHRect(0, 0, lay.vw, lay.vh), p.fill);
      p.fill.setShader(null);
    }, { x: 0, y: 0, width: lay.vw, height: lay.vh });
    return this.vigPic;
  }

  /* ================= the world, drawn every frame ================= */

  world(game: Game, lay: Layout): SkPicture {
    return createPicture((canvas) => this.paintWorld(canvas, game, lay), {
      x: 0, y: 0, width: lay.vw, height: lay.vh,
    });
  }

  private paintWorld(canvas: SkCanvas, game: Game, lay: Layout) {
    const R = game.R;
    if (!R) return;
    this.nearP = R.player;
    canvas.save();
    canvas.translate(lay.ox, lay.oy);
    canvas.scale(lay.scale, lay.scale);
    canvas.save();
    canvas.clipRRect(Skia.RRectXY(Skia.XYWHRect(0, 0, R.W, R.H), 34, 34), ClipOp.Intersect, true);

    this.ambience(canvas, R);
    this.bloom(canvas, game, R);
    this.mines(canvas, R);
    this.enemies(canvas, game, R);
    this.shots(canvas, R);
    this.effects(canvas, R);
    this.dittos(canvas, game, R);
    this.player(canvas, game, R);

    canvas.restore();
    canvas.restore();
    canvas.drawPicture(this.vignette(lay));
    this.hurt(canvas, R, lay);
  }

  private ambience(canvas: SkCanvas, R: RoundState) {
    const p = this.p;
    for (const am of R.amb) {
      canvas.drawCircle(am.x, am.y, am.r, p.f(col("#8FD9FF", 0.035)));
      canvas.drawCircle(am.x, am.y, am.r, p.s(col("#BFE9FF", 0.07), 1));
    }
  }

  private bloom(canvas: SkCanvas, game: Game, R: RoundState) {
    const bl = R.bloom;
    if (!bl) return;
    const p = this.p;
    const inside = R.player.alive && !!game.bloomKind(R.player);
    const tri = bl.kind === "triple";
    const tint = tri ? C.gold : C.film;
    const fade = bl.t < 1.5 ? bl.t / 1.5 : 1;
    const pulse = 0.5 + 0.5 * Math.sin(R.t * 3.2);

    p.fill.setShader(
      Skia.Shader.MakeRadialGradient(
        { x: bl.x, y: bl.y }, bl.r,
        [col(tint, (inside ? 0.26 : 0.14) * fade), col(tint, 0)], [0, 1], TileMode.Clamp,
      ),
    );
    p.fill.setColor(col("#FFFFFF"));
    p.fill.setMaskFilter(null);
    p.fill.setBlendMode(BlendMode.SrcOver);
    canvas.drawCircle(bl.x, bl.y, bl.r, p.fill);
    p.fill.setShader(null);

    // Two dashed rings turning against each other: it reads as a live field, and
    // the counter-rotation makes the boundary unmistakable at a glance.
    const a1 = p.s(col(tint, (inside ? 0.95 : 0.5) * fade), (inside ? 2.8 : 1.5) * bl.r / 130);
    a1.setPathEffect(p.dashOf(tri ? 4 : 10, tri ? 7 : 8, -R.t * 26));
    canvas.drawCircle(bl.x, bl.y, bl.r, a1);
    const a2 = p.s(col(tint, (inside ? 0.5 : 0.24) * fade), 1.2 * bl.r / 130);
    a2.setPathEffect(p.dashOf(3, 12, R.t * 18));
    canvas.drawCircle(bl.x, bl.y, bl.r * (0.9 + pulse * 0.05), a2);

    // The pip at the centre says which bloom it is without a word of type.
    const u = bl.r / 130;                       // the bloom's own unit of measure
    const cr = (13 + pulse * 2) * u;
    canvas.drawCircle(bl.x, bl.y, cr * 2.1, p.g(col(tint, 0.16 * fade), 10 * u));
    if (tri) {
      for (let q = 0; q < 3; q++) {
        const a = -Math.PI / 2 + (q * TAU) / 3 + R.t * 0.8;
        canvas.drawCircle(bl.x + Math.cos(a) * cr, bl.y + Math.sin(a) * cr, 4.2 * u,
          p.f(col(tint, 0.9 * fade)));
      }
    } else {
      canvas.drawCircle(bl.x, bl.y, cr * 0.62, p.s(col(tint, 0.9 * fade), 3 * u));
      canvas.drawCircle(bl.x, bl.y, 3.2 * u, p.f(col(tint, 0.95 * fade)));
    }
  }

  private mines(canvas: SkCanvas, R: RoundState) {
    const p = this.p;
    for (const mn of R.mines) {
      const k = 1 - mn.t / mn.life;
      const h = 45 - k * 42;
      // The ring is the blast radius and the fill is the fuse, so the fill touches
      // the ring exactly when it goes off.
      canvas.drawCircle(mn.x, mn.y, mn.r * k, p.f(hsl(h, 95, 55, 0.1 + k * 0.18)));
      const ring = p.s(hsl(h, 95, 64, 0.24 + k * 0.36), mn.r * 0.014);
      ring.setPathEffect(p.dashOf(5, 6, -R.t * 30));
      canvas.drawCircle(mn.x, mn.y, mn.r, ring);
      const mp = 0.5 + 0.5 * Math.sin(R.t * (7 + k * 30));
      const core = mn.r * 0.045;
      canvas.drawCircle(mn.x, mn.y, core * (2.6 + mp * 1.6), p.g(hsl(h, 100, 60, 0.4 + mp * 0.3), core));
      canvas.drawCircle(mn.x, mn.y, core * (1 + mp * 0.7), p.f(hsl(h, 100, 58 + mp * 26, 0.7 + mp * 0.3)));
    }
  }

  /* ---------- enemies ---------- */

  /** Silhouette carries the ability: an arrow charges, a hexagon is armoured. */
  private shapePath(e: Enemy, r: number, shape: string): SkPath {
    const path = this.p.path;
    path.reset();
    path.setFillType(FillType.Winding);
    if (shape === "lobes") {
      path.addCircle(e.x - r * 0.36, e.y, r * 0.74);
      path.addCircle(e.x + r * 0.36, e.y, r * 0.74);
    } else if (shape === "ring") {
      path.setFillType(FillType.EvenOdd);
      path.addCircle(e.x, e.y, r);
      path.addCircle(e.x, e.y, r * 0.48);
    } else if (shape === "star") {
      for (let q = 0; q < 10; q++) {
        const a = -1.5708 + q * 0.62832;
        const rr = q % 2 ? r * 0.46 : r * 1.16;
        const X = e.x + Math.cos(a) * rr, Y = e.y + Math.sin(a) * rr;
        if (q) path.lineTo(X, Y); else path.moveTo(X, Y);
      }
      path.close();
    } else if (POLY[shape]) {
      const n = POLY[shape];
      const pointed = shape === "arrow" || shape === "tri";
      const rot = pointed ? e.aim || 0 : shape === "square" ? 0.785 : 0.5;
      const rad = pointed ? r * 1.5 : r;
      for (let q = 0; q < n; q++) {
        const a = rot + (q * TAU) / n;
        const X = e.x + Math.cos(a) * rad, Y = e.y + Math.sin(a) * rad;
        if (q) path.lineTo(X, Y); else path.moveTo(X, Y);
      }
      path.close();
    } else {
      path.addCircle(e.x, e.y, r);
    }
    return path;
  }

  private enemies(canvas: SkCanvas, game: Game, R: RoundState) {
    const p = this.p;
    for (const e of R.enemies) {
      const T = ETYPES[e.type];
      const frac = Math.max(0, e.hp / e.max);
      const ag = Math.min(game.run.round - e.w, 4);
      const fl = (e.flash || 0) * 26;
      const al = e.hidden ? 0.16 : 1;
      // Everything arrives with a snap rather than simply existing.
      const pop = Math.min(1, (R.t - e.born) / 0.22);
      const grow = pop >= 1 ? 1 : 1 + Math.sin(pop * Math.PI) * 0.34 - (1 - pop) * 0.8;
      if (grow <= 0.02) continue;

      // A juke reads as speed lines trailing the direction it slipped.
      if (e.jT > 0 && e.jv) {
        const q = p.s(hsl(T.hue, 95, 82, al * 0.55), 2.2 * e.sc);
        for (let jq = -1; jq <= 1; jq += 2) {
          const jox = -e.jv[1] * jq * e.r * 0.5, joy = e.jv[0] * jq * e.r * 0.5;
          canvas.drawLine(
            e.x - e.jv[0] * e.r * 0.9 + jox, e.y - e.jv[1] * e.r * 0.9 + joy,
            e.x - e.jv[0] * e.r * 2.3 + jox, e.y - e.jv[1] * e.r * 2.3 + joy, q,
          );
        }
      }

      const r = (ag === 0 ? e.r : e.r - ag * 0.9) * grow;
      const hue = ag === 0 ? T.hue : 358;
      const sat = ag === 0 ? T.sat : 54 - ag * 7;
      const li = (ag === 0 ? 46 + frac * 20 : 32 + frac * 12) + fl;
      const alpha = ag === 0 ? al : al * (0.72 - ag * 0.07);

      // A soft contact shadow lifts every body off the floor.
      canvas.drawCircle(e.x + r * 0.1, e.y + r * 0.22, r * 0.92, p.g(col("#000B1E", 0.3), r * 0.4));
      this.enemyBody(canvas, e, r, hue, sat, li, alpha, T.shape, e.sc);
      this.enemyMarks(canvas, e, T, alpha, R.t, e.sc);
      if (T.boss) this.bossBar(canvas, e, frac);
    }
  }

  private enemyBody(
    canvas: SkCanvas, e: Enemy, r: number,
    h: number, sa: number, li: number, al: number, shape: string, sc: number,
  ) {
    const p = this.p;
    const path = this.shapePath(e, r, shape);
    canvas.drawPath(path, p.f(hsl(h, sa, li, al)));
    canvas.drawPath(path,
      p.s(hsl(h, Math.min(100, sa + 20), Math.min(93, li + 26), al * 0.95), 1.8 * sc));
    // A single specular highlight, upper-left, is what makes it read as a bubble.
    canvas.drawCircle(e.x - r * 0.32, e.y - r * 0.33, r * 0.19, p.f(col("#FFFFFF", al * 0.45)));
    canvas.drawCircle(e.x + r * 0.18, e.y + r * 0.38, r * 0.09, p.f(col("#FFFFFF", al * 0.18)));
  }

  private bossBar(canvas: SkCanvas, e: Enemy, frac: number) {
    const p = this.p, sc = e.sc;
    const bw = e.r * 1.8, bh = 8 * sc, by = e.y - e.r - 22 * sc, in2 = 1.2 * sc;
    const back = Skia.RRectXY(Skia.XYWHRect(e.x - bw / 2, by, bw, bh), 4 * sc, 4 * sc);
    canvas.drawRRect(back, p.f(col(C.ink, 0.92)));
    if (frac > 0)
      canvas.drawRRect(
        Skia.RRectXY(
          Skia.XYWHRect(e.x - bw / 2 + in2, by + in2, (bw - in2 * 2) * frac, bh - in2 * 2),
          3 * sc, 3 * sc,
        ),
        p.f(col(frac > 0.35 ? C.ember : C.gold)),
      );
    canvas.drawRRect(back, p.s(col("#4A5680"), 1 * sc));
  }

  /**
   * Marks come from traits, not from type names, so every row in the roster is
   * legible the moment it is added.
   */
  private enemyMarks(
    canvas: SkCanvas, e: Enemy, T: EType, al: number, t: number, sc: number,
  ) {
    const p = this.p, h = T.hue;

    if (T.charge) {
      const wu = e.dashT > 0 ? 1 : Math.max(0, 1 - e.wind / 0.7);
      if (wu > 0.02) {
        const la = e.dashT > 0 ? Math.atan2(e.dd[1], e.dd[0]) : e.aim || 0;
        const reach = e.r * (1.4 + wu * 1.6);
        canvas.drawLine(e.x, e.y, e.x + Math.cos(la) * reach, e.y + Math.sin(la) * reach,
          p.s(hsl(h, 100, 78, al * (0.35 + wu * 0.6)), 3 * sc));
      }
    }
    if (T.explode) {
      const pu = 0.5 + 0.5 * Math.sin(t * 7 + e.wob);
      canvas.drawCircle(e.x, e.y, e.r * (0.4 + pu * 0.18),
        p.s(col("#FFC2D8", al * (0.3 + pu * 0.45)), 2 * sc));
    }
    if (T.orbitR && this.near(e, T.orbitR * e.sc * 0.8)) {
      const q = p.s(hsl(h, 90, 80, al * 0.5), 1.4 * sc);
      q.setPathEffect(p.dashOf(3, 5, -t * 22));
      canvas.drawCircle(e.x, e.y, e.r + 6 * sc, q);
    }
    if (T.pull) {
      for (let q = 0; q < 3; q++) {
        const va = t * 2.4 + q * 2.094;
        this.arc(canvas, e.x, e.y, e.r * (0.52 + q * 0.24), va, 1.6,
          p.s(hsl(h, 95, 80, al * 0.6), 2.2 * sc));
      }
      if (this.near(e, T.pull.r * e.sc)) {
        const q = p.s(hsl(h, 95, 80, al * 0.18), 1 * sc);
        q.setPathEffect(p.dashOf(4, 10, t * 18));
        canvas.drawCircle(e.x, e.y, T.pull.r * e.sc, q);
      }
    }
    if (T.slow && this.near(e, T.slow.r * e.sc)) {
      const q = p.s(hsl(h, 90, 72, al * 0.22), 1.5 * sc);
      q.setPathEffect(p.dashOf(8, 12, -t * 14));
      canvas.drawCircle(e.x, e.y, T.slow.r * e.sc, q);
    }
    if (T.shoot) {
      const chg = Math.max(0, 1 - e.cool / 0.6);
      if (T.shoot.ring) {
        const q = p.s(col("#D8C2FF", al * (0.4 + chg * 0.5)), 2 * sc);
        for (let i = 0; i < T.shoot.n; i++) {
          const ra = (i * TAU) / T.shoot.n + e.age * 0.5;
          canvas.drawLine(
            e.x + Math.cos(ra) * e.r * 0.9, e.y + Math.sin(ra) * e.r * 0.9,
            e.x + Math.cos(ra) * e.r * (1.2 + chg * 0.55),
            e.y + Math.sin(ra) * e.r * (1.2 + chg * 0.55), q,
          );
        }
      } else {
        const sa = e.aim || 0;
        const tipX = e.x + Math.cos(sa) * e.r * 1.5, tipY = e.y + Math.sin(sa) * e.r * 1.5;
        canvas.drawLine(e.x + Math.cos(sa) * e.r * 0.4, e.y + Math.sin(sa) * e.r * 0.4,
          tipX, tipY, p.s(col("#C4A8FF", al * 0.85), Math.max(2.4, e.r * 0.28)));
        if (chg > 0)
          canvas.drawCircle(tipX, tipY, e.r * 0.34 * chg,
            p.g(col("#D8C2FF", al * chg * 0.9), e.r * 0.2));
      }
    }
    if (T.shield)
      canvas.drawCircle(e.x, e.y, Math.max(3, e.r - 5), p.s(hsl(h, 70, 85, al * 0.75), 2.4 * sc));
    if (T.jump) {
      const q = p.s(hsl(h, 95, 84, al * 0.42), 1.6 * sc);
      for (let i = -1; i <= 1; i += 2) {
        const path = p.path2;
        path.reset();
        path.moveTo(e.x + i * e.r * 0.95, e.y - e.r * 0.28);
        path.lineTo(e.x + i * e.r * 1.32, e.y);
        path.lineTo(e.x + i * e.r * 0.95, e.y + e.r * 0.28);
        canvas.drawPath(path, q);
      }
    }
    if (T.splits)
      canvas.drawLine(e.x, e.y - e.r * 0.7, e.x, e.y + e.r * 0.7,
        p.s(col("#E6C6FF", al * 0.55), 1.8 * sc));
    if (T.spawns || T.boss) {
      const q = p.s(hsl(h, 90, 78, al * 0.5), 2 * sc);
      for (let i = 1; i <= 3; i++)
        canvas.drawCircle(e.x, e.y, e.r * (0.24 * i) + Math.sin(t * 2 + i) * 2 * sc, q);
    }
    if (T.lays) {
      const q = p.s(col("#FFC98A", al * 0.7), 1.6 * sc);
      canvas.drawLine(e.x - e.r * 0.8, e.y, e.x + e.r * 0.8, e.y, q);
      canvas.drawLine(e.x, e.y - e.r * 0.8, e.x, e.y + e.r * 0.8, q);
    }
    if (T.regen)
      canvas.drawCircle(e.x, e.y, e.r + 5 * sc,
        p.s(col("#FFD6E4", al * (0.3 + 0.4 * (0.5 + 0.5 * Math.sin(t * 4 + e.wob)))), 2 * sc));
    if (T.blink) {
      const q = p.s(hsl(h, 95, 84, al * 0.45), 1.4 * sc);
      q.setPathEffect(p.dashOf(2, 4, 0));
      canvas.drawCircle(e.x, e.y, e.r + 7 * sc, q);
    }
    if (T.flyer) {
      canvas.drawLine(
        e.x - e.dd[0] * e.r * 2.6, e.y - e.dd[1] * e.r * 2.6,
        e.x - e.dd[0] * e.r * 0.9, e.y - e.dd[1] * e.r * 0.9,
        p.s(col("#FFD3D8", al * 0.34), 2.4 * sc),
      );
      canvas.drawCircle(e.x, e.y, e.r * 0.46, p.s(col("#FFE9EC", al * 0.8), 1.6 * sc));
    }
  }

  private near(e: Enemy, r: number) {
    const p = this.nearP;
    if (!p || !p.alive) return false;
    const dx = p.x - e.x, dy = p.y - e.y;
    return dx * dx + dy * dy < r * 1.45 * (r * 1.45);
  }

  private arc(
    canvas: SkCanvas, x: number, y: number, r: number,
    from: number, sweep: number, paint: SkPaint,
  ) {
    const path = this.p.path2;
    path.reset();
    path.addArc(Skia.XYWHRect(x - r, y - r, r * 2, r * 2),
      (from * 180) / Math.PI, (sweep * 180) / Math.PI);
    canvas.drawPath(path, paint);
  }

  /* ---------- shots ---------- */

  private shots(canvas: SkCanvas, R: RoundState) {
    const p = this.p;
    for (const b of R.bullets) {
      const a = b.ghost ? 0.55 : 1;
      // A tapering trail behind a blurred head: a bullet is a streak of light,
      // never a dot sliding across the floor.
      const tr = b.tr;
      for (let i = 2; i < tr.length; i += 2) {
        const k = i / (tr.length - 2);
        const q = p.g(hsl(b.hue, 88, 64, a * 0.3 * k), 0);
        q.setStyle(PaintStyle.Stroke);
        q.setStrokeWidth(b.r * 1.5 * k);
        canvas.drawLine(tr[i - 2], tr[i - 1], tr[i], tr[i + 1], q);
        q.setStyle(PaintStyle.Fill);
      }
      canvas.drawCircle(b.x, b.y, b.r * 2.4, p.g(hsl(b.hue, 92, 66, a * 0.34), b.r * 1.2));
      canvas.drawCircle(b.x, b.y, b.r * 0.78, p.g(hsl(b.hue, 95, 86, a), 0));
    }
    for (const eb of R.ebul) {
      const tr = eb.tr;
      for (let i = 2; i < tr.length; i += 2) {
        const k = i / (tr.length - 2);
        const q = p.g(hsl(278, 90, 68, 0.3 * k), 0);
        q.setStyle(PaintStyle.Stroke);
        q.setStrokeWidth(eb.r * 1.3 * k);
        canvas.drawLine(tr[i - 2], tr[i - 1], tr[i], tr[i + 1], q);
        q.setStyle(PaintStyle.Fill);
      }
      canvas.drawCircle(eb.x, eb.y, eb.r * 2.1, p.g(hsl(278, 92, 62, 0.38), eb.r));
      canvas.drawCircle(eb.x, eb.y, eb.r * 0.82, p.g(hsl(282, 96, 84, 1), 0));
    }
  }

  private effects(canvas: SkCanvas, R: RoundState) {
    const p = this.p;
    for (const f of R.fx) {
      const k = f.t / f.life;
      if (f.pop) {
        canvas.drawCircle(f.x, f.y, f.rad * (1 - k), p.g(hsl(f.hue, 92, 76, (1 - k) * 0.9), 2));
      } else if (f.shard) {
        // splinters spinning off a heavy kill
        const path = p.path2;
        const r = f.rad * (1 - k * 0.4);
        path.reset();
        path.moveTo(f.x + Math.cos(f.ang!) * r, f.y + Math.sin(f.ang!) * r);
        path.lineTo(f.x + Math.cos(f.ang! + 2.5) * r * 0.5, f.y + Math.sin(f.ang! + 2.5) * r * 0.5);
        path.lineTo(f.x + Math.cos(f.ang! - 2.5) * r * 0.5, f.y + Math.sin(f.ang! - 2.5) * r * 0.5);
        path.close();
        canvas.drawPath(path, p.g(hsl(f.hue, 92, 74, (1 - k) * 0.75), 1));
      } else {
        // an expanding ring that thins as it grows, plus a soft wash behind it
        const w = (f.width || 3) * (1 - k) + 1;
        canvas.drawCircle(f.x, f.y, f.rad * k, p.g(hsl(f.hue, 92, 70, (1 - k) * 0.22), w * 3));
        const q = p.g(hsl(f.hue, 92, 80, (1 - k) * 0.85), 0);
        q.setStyle(PaintStyle.Stroke);
        q.setStrokeWidth(w);
        canvas.drawCircle(f.x, f.y, f.rad * k, q);
        q.setStyle(PaintStyle.Fill);
      }
    }
  }

  /* ---------- friendlies ---------- */

  /** A stick barrel, drawn under the body so it reads as emerging from the bubble. */
  private gun(canvas: SkCanvas, u: Unit, alpha: number) {
    const p = this.p, a = u.aim, r = u.r;
    const x1 = u.x + Math.cos(a) * r * 0.3, y1 = u.y + Math.sin(a) * r * 0.3;
    const x2 = u.x + Math.cos(a) * r * 1.66, y2 = u.y + Math.sin(a) * r * 1.66;
    canvas.drawLine(x1, y1, x2, y2, p.s(hsl(u.hue, 26, 86, alpha), Math.max(2.6, r * 0.3)));
    canvas.drawLine(x1, y1, x2, y2, p.s(hsl(u.hue, 40, 40, alpha), Math.max(1, r * 0.1)));
    if (u.muzzle > 0) {
      const k = u.muzzle / 0.07;
      canvas.drawCircle(x2, y2, r * 0.44 * k, p.g(hsl(u.hue, 95, 84, alpha * k), r * 0.3));
      canvas.drawCircle(x2, y2, r * 0.2 * k, p.g(col("#FFFFFF", alpha * k * 0.9), 0));
    }
  }

  /**
   * The bubble body. A radial gradient does the work a flat fill plus a white dot
   * used to do: the surface has a lit side, a deep core and a bright meniscus.
   */
  private bubble(
    canvas: SkCanvas, x: number, y: number, r: number,
    hue: number, alpha: number, vx = 0, vy = 0,
  ) {
    const p = this.p;
    // squash along the direction of travel — a few percent, felt more than seen
    const sp = Math.hypot(vx, vy);
    const st = Math.min(0.16, sp / 4200);
    canvas.save();
    if (st > 0.004) {
      const deg = (Math.atan2(vy, vx) * 180) / Math.PI;
      canvas.translate(x, y);
      canvas.rotate(deg, 0, 0);
      canvas.scale(1 + st, 1 - st);
      canvas.rotate(-deg, 0, 0);
      canvas.translate(-x, -y);
    }
    p.fill.setShader(
      Skia.Shader.MakeRadialGradient(
        { x: x - r * 0.36, y: y - r * 0.4 }, r * 1.5,
        [hsl(hue, 92, 82, alpha), hsl(hue, 78, 58, alpha), hsl(hue, 72, 34, alpha)],
        [0, 0.45, 1], TileMode.Clamp,
      ),
    );
    p.fill.setColor(col("#FFFFFF"));
    p.fill.setMaskFilter(null);
    p.fill.setBlendMode(BlendMode.SrcOver);
    canvas.drawCircle(x, y, r, p.fill);
    p.fill.setShader(null);
    canvas.drawCircle(x, y, r, p.s(hsl(hue, 95, 84, alpha * 0.92), r * 0.115));
    canvas.drawCircle(x - r * 0.33, y - r * 0.34, r * 0.22, p.f(col("#FFFFFF", alpha * 0.55)));
    // the film's second reflection, low and to the right
    this.arc(canvas, x, y, r * 0.74, 0.5, 1.5, p.s(col("#FFFFFF", alpha * 0.22), r * 0.13));
    canvas.restore();
  }

  private hpArc(canvas: SkCanvas, u: Unit, alpha: number) {
    if (u.hp >= u.max) return;
    const sc = u.st.scale;
    this.arc(canvas, u.x, u.y, u.r + 5 * sc, -1.5708, TAU * Math.max(0, u.hp / u.max),
      this.p.s(col(C.rose, 0.6 * alpha), 2.6 * sc));
  }

  private dittos(canvas: SkCanvas, game: Game, R: RoundState) {
    const p = this.p;
    for (let i = 1; i < R.units.length; i++) {
      const u = R.units[i];
      if (u.fade <= 0) continue;
      // Your past selves do not simply exist at the whistle; they arrive, one after
      // another, each landing inside its own collapsing ring.
      const arr = Math.min(1, Math.max(0, (R.t - u.born) / 0.4));
      if (arr <= 0) continue;
      let al = (0.92 - Math.min(u.age || 0, 5) * 0.045) * u.fade * arr;
      if (!u.alive) al *= 0.5;
      if (arr < 1)
        canvas.drawCircle(u.x, u.y, u.r * (1 + (1 - arr) * 3.4),
          p.s(hsl(u.hue, 90, 76, (1 - arr) * 0.65), 2.4 * u.st.scale));
      if (u.alive)
        canvas.drawCircle(u.x, u.y, u.r * 1.9, p.g(hsl(u.hue, 82, 50, 0.18 * u.fade), u.r * 0.7));
      this.gun(canvas, u, al);
      const bk = u.alive && game.bloomKind(u);
      if (bk)
        canvas.drawCircle(u.x, u.y, u.r + 9 * u.st.scale,
          p.s(col(bk === "triple" ? "#FFE9B4" : "#9BFFF1", 0.6 * u.fade), 2 * u.st.scale));
      const rr = u.r * (arr < 1 ? 0.4 + arr * 0.72 : 1);
      this.bubble(canvas, u.x, u.y, rr, u.hue, al, u.vx, u.vy);
      if (u.alive && arr >= 1) this.hpArc(canvas, u, u.fade);
    }
  }

  /** You — biggest, brightest, double-ringed. Never lose yourself in the crowd. */
  private player(canvas: SkCanvas, game: Game, R: RoundState) {
    const p = this.p, u = R.player;
    if (!u.alive) return;

    if (u.dashT > 0) {
      canvas.drawCircle(u.x, u.y, u.r * 1.8, p.g(col(C.film, 0.34), u.r * 0.8));
      // a hard streak behind, so a dash reads as a dash
      const q = p.g(col(C.film, 0.45), u.r * 0.5);
      q.setStyle(PaintStyle.Stroke);
      q.setStrokeWidth(u.r * 1.2);
      canvas.drawLine(u.x - u.vx * 0.045, u.y - u.vy * 0.045, u.x, u.y, q);
      q.setStyle(PaintStyle.Fill);
    }
    const sc = u.st.scale;
    const bk = game.bloomKind(u);
    if (bk)
      canvas.drawCircle(u.x, u.y, u.r + 12 * sc,
        p.s(col(bk === "triple" ? "#FFE9B4" : "#9BFFF1", 0.55), 2 * sc));

    canvas.drawCircle(u.x, u.y, u.r + 7 * sc, p.s(col(C.chalk, 0.9), 2 * sc));
    canvas.drawCircle(u.x, u.y, u.r + 11 * sc, p.s(col(C.film, 0.4), 1 * sc));
    // four ticks on the outer ring: a reticle you can find in a crowded arena
    for (let q = 0; q < 4; q++) {
      const a = (q * TAU) / 4 + R.t * 0.5;
      canvas.drawLine(
        u.x + Math.cos(a) * (u.r + 9 * sc), u.y + Math.sin(a) * (u.r + 9 * sc),
        u.x + Math.cos(a) * (u.r + 15 * sc), u.y + Math.sin(a) * (u.r + 15 * sc),
        p.s(col(C.film, 0.5), 1.6 * sc),
      );
    }
    if (u.hitCd > 0.45)
      canvas.drawCircle(u.x, u.y, u.r + 14 * sc, p.g(col(C.rose, 0.5), 6 * sc));
    this.gun(canvas, u, 1);
    this.bubble(canvas, u.x, u.y, u.r, 185, 1, u.vx, u.vy);
    this.hpArc(canvas, u, 1);
  }

  /** A red wash from the edges when you are hit. Screen space, over everything. */
  private hurt(canvas: SkCanvas, R: RoundState, lay: Layout) {
    if (R.hurtFlash <= 0.01) return;
    const p = this.p;
    p.fill.setShader(
      Skia.Shader.MakeRadialGradient(
        { x: lay.vw / 2, y: lay.vh / 2 }, Math.max(lay.vw, lay.vh) * 0.62,
        [col(C.ember, 0), col(C.ember, 0.42 * R.hurtFlash)], [0.3, 1], TileMode.Clamp,
      ),
    );
    p.fill.setColor(col("#FFFFFF"));
    p.fill.setMaskFilter(null);
    p.fill.setBlendMode(BlendMode.SrcOver);
    canvas.drawRect(Skia.XYWHRect(0, 0, lay.vw, lay.vh), p.fill);
    p.fill.setShader(null);
  }
}
