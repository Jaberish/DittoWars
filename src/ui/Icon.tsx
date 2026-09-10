import React, { useMemo } from "react";
import { Canvas, PaintStyle, Picture, Skia, StrokeCap, StrokeJoin, createPicture, type SkCanvas } from "@shopify/react-native-skia";
import type { BoonId } from "../engine/constants";

/**
 * Small interface icons, drawn rather than typed.
 *
 * A glyph font gives you whatever the platform happens to ship — a music note where
 * you wanted a speaker, an emoji that ignores your tint — so the few icons the UI
 * needs are paths on a 24-unit grid, scaled to whatever size the caller asks for.
 */
const U = 24;

const rgba = (hex: string, a = 1) => {
  const c = Skia.Color(hex);
  return Float32Array.of(c[0], c[1], c[2], a);
};

function stroke(tint: string, w: number, a = 1) {
  const p = Skia.Paint();
  p.setAntiAlias(true);
  p.setStyle(PaintStyle.Stroke);
  p.setStrokeCap(StrokeCap.Round);
  p.setStrokeJoin(StrokeJoin.Round);
  p.setStrokeWidth(w);
  p.setColor(rgba(tint, a));
  return p;
}

function fill(tint: string, a = 1) {
  const p = Skia.Paint();
  p.setAntiAlias(true);
  p.setColor(rgba(tint, a));
  return p;
}

/** An arc of a circle, as a path — Skia wants a bounding box, we think in radii. */
function arc(cx: number, cy: number, r: number, start: number, sweep: number) {
  const p = Skia.Path.Make();
  p.addArc({ x: cx - r, y: cy - r, width: r * 2, height: r * 2 }, start, sweep);
  return p;
}

/** The cone and body every speaker shares; the waves or the cross go on top. */
function speakerBody(canvas: SkCanvas, tint: string) {
  const body = Skia.Path.Make();
  body.moveTo(2.5, 9.5);
  body.lineTo(6, 9.5);
  body.lineTo(11, 4.5);
  body.lineTo(11, 19.5);
  body.lineTo(6, 14.5);
  body.lineTo(2.5, 14.5);
  body.close();
  canvas.drawPath(body, fill(tint));
}

function drawSound(canvas: SkCanvas, tint: string, off: boolean) {
  speakerBody(canvas, tint);
  if (off) {
    // A cross, not a slash: a slash across the cone reads as part of the speaker.
    const x = stroke(tint, 1.9);
    canvas.drawLine(15, 9, 21, 15, x);
    canvas.drawLine(21, 9, 15, 15, x);
    return;
  }
  // Two arcs leaving the cone, the outer one fainter so it reads as travelling out.
  canvas.drawPath(arc(11, 12, 4.6, -52, 104), stroke(tint, 1.8));
  canvas.drawPath(arc(11, 12, 8.2, -48, 96), stroke(tint, 1.8, 0.55));
}

/** Speed: three chevrons, the fast-forward everyone already reads. */
function drawRapid(canvas: SkCanvas, tint: string) {
  const p = stroke(tint, 2.2);
  for (let i = 0; i < 3; i++) {
    const x = 5.5 + i * 6.2;
    const c = Skia.Path.Make();
    c.moveTo(x, 6.5);
    c.lineTo(x + 4.2, 12);
    c.lineTo(x, 17.5);
    canvas.drawPath(c, p);
  }
}

/**
 * Weight: a bullet, flat tail and ogive nose, and nothing else.
 *
 * Speed lines behind it said "fast", which is the card underneath; rays off the nose
 * closed up into a chevron at 24px. The silhouette alone carries it.
 */
function drawPunch(canvas: SkCanvas, tint: string) {
  const b = Skia.Path.Make();
  b.moveTo(3.8, 6.4);
  b.lineTo(12.6, 6.4);
  b.quadTo(21.6, 12, 12.6, 17.6);
  b.lineTo(3.8, 17.6);
  b.close();
  canvas.drawPath(b, fill(tint));
}

/** Health: a heart, because that is what the board and the lives row already use. */
function drawVigor(canvas: SkCanvas, tint: string) {
  const h = Skia.Path.Make();
  h.moveTo(12, 20.4);
  h.cubicTo(12, 20.4, 3.2, 14.4, 3.2, 8.9);
  h.cubicTo(3.2, 5.9, 5.6, 3.9, 8, 3.9);
  h.cubicTo(9.9, 3.9, 11.3, 5, 12, 6.2);
  h.cubicTo(12.7, 5, 14.1, 3.9, 16, 3.9);
  h.cubicTo(18.4, 3.9, 20.8, 5.9, 20.8, 8.9);
  h.cubicTo(20.8, 14.4, 12, 20.4, 12, 20.4);
  h.close();
  canvas.drawPath(h, fill(tint));
}

/** Distance: an arrow that carries all the way to a ring out at the edge. */
function drawReach(canvas: SkCanvas, tint: string) {
  const line = stroke(tint, 2);
  canvas.drawLine(2.5, 12, 12.5, 12, line);
  const head = Skia.Path.Make();
  head.moveTo(15, 12);
  head.lineTo(10.6, 8.6);
  head.lineTo(11.8, 12);
  head.lineTo(10.6, 15.4);
  head.close();
  canvas.drawPath(head, fill(tint));
  canvas.drawCircle(19, 12, 3.6, stroke(tint, 1.8, 0.7));
  canvas.drawCircle(19, 12, 1.2, fill(tint));
}

/** Pop: a core and the rings going out from it. */
function drawSurge(canvas: SkCanvas, tint: string) {
  canvas.drawCircle(12, 12, 3.1, fill(tint));
  canvas.drawCircle(12, 12, 6.4, stroke(tint, 1.8, 0.7));
  canvas.drawCircle(12, 12, 9.7, stroke(tint, 1.6, 0.34));
}

/** Menu: three bars, which is the one shape everyone already reads as "more here". */
function drawMenu(canvas: SkCanvas, tint: string) {
  const p = stroke(tint, 2);
  for (let i = 0; i < 3; i++) canvas.drawLine(5, 7.5 + i * 4.5, 19, 7.5 + i * 4.5, p);
}

const BOON_ART: Record<BoonId, (c: SkCanvas, tint: string) => void> = {
  rapid: drawRapid,
  punch: drawPunch,
  vigor: drawVigor,
  reach: drawReach,
  surge: drawSurge,
};

function Glyph({ size, tint, art }: {
  size: number; tint: string; art: (c: SkCanvas, tint: string) => void;
}) {
  const pic = useMemo(
    () => createPicture((canvas) => {
      canvas.scale(size / U, size / U);
      art(canvas, tint);
    }, { x: 0, y: 0, width: size, height: size }),
    [size, tint, art],
  );
  return (
    <Canvas style={{ width: size, height: size }} pointerEvents="none">
      <Picture picture={pic} />
    </Canvas>
  );
}

export function SoundIcon({ size = 18, tint, off }: {
  size?: number; tint: string; off?: boolean;
}) {
  const art = useMemo(
    () => (c: SkCanvas, t: string) => drawSound(c, t, !!off),
    [off],
  );
  return <Glyph size={size} tint={tint} art={art} />;
}

export function MenuIcon({ size = 18, tint }: { size?: number; tint: string }) {
  return <Glyph size={size} tint={tint} art={drawMenu} />;
}

export function BoonIcon({ id, size = 22, tint }: {
  id: BoonId; size?: number; tint: string;
}) {
  return <Glyph size={size} tint={tint} art={BOON_ART[id]} />;
}
