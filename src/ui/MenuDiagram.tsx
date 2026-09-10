import React, { useMemo, useState } from "react";
import { StyleSheet, Text, View, useWindowDimensions } from "react-native";
import {
  BlendMode, Canvas, FillType, PaintStyle, Picture, Skia, StrokeCap, TileMode,
  createPicture, type SkCanvas,
} from "@shopify/react-native-skia";
import { F, T } from "./theme";

const W = 360;
const H = 208;
const TAU = Math.PI * 2;
/** How far short of its subject an arrow tip stops, in picture units. */
const GAP = 9;

/**
 * What the diagram names, where the label sits, and what it points at — so the labels
 * and the leader lines drawn under them cannot drift apart.
 */
const KEYS: {
  tint: string; label: string;
  x: number; y: number; toX: number; toY: number;
  /** which edge of the label the arrow leaves from, and which way its shaft bows */
  side: "left" | "right"; bow: number;
}[] = [
  { tint: T.film, label: "You", x: 0.08, y: 0.76, toX: 0.33, toY: 0.70, side: "right", bow: 1 },
  { tint: T.leaf, label: "Your replay", x: 0.55, y: 0.06, toX: 0.49, toY: 0.29, side: "left", bow: -1 },
  { tint: T.ember, label: "Enemies", x: 0.60, y: 0.76, toX: 0.84, toY: 0.63, side: "right", bow: -1 },
];

function hsl(h: number, s: number, l: number, a = 1) {
  const c = Skia.Color(`hsl(${h}, ${s}%, ${l}%)`);
  return Float32Array.of(c[0], c[1], c[2], a);
}
const rgba = (hex: string, a = 1) => {
  const c = Skia.Color(hex);
  return Float32Array.of(c[0], c[1], c[2], a);
};

/** A bubble in the game's own vocabulary: lit side, deep core, bright meniscus. */
function bubble(canvas: SkCanvas, x: number, y: number, r: number, hue: number, a = 1) {
  const fill = Skia.Paint();
  fill.setAntiAlias(true);
  fill.setShader(
    Skia.Shader.MakeRadialGradient(
      { x: x - r * 0.36, y: y - r * 0.4 }, r * 1.5,
      [hsl(hue, 92, 82, a), hsl(hue, 78, 58, a), hsl(hue, 72, 34, a)],
      [0, 0.45, 1], TileMode.Clamp,
    ),
  );
  canvas.drawCircle(x, y, r, fill);
  const rim = Skia.Paint();
  rim.setAntiAlias(true);
  rim.setStyle(PaintStyle.Stroke);
  rim.setStrokeWidth(r * 0.12);
  rim.setColor(hsl(hue, 95, 84, a * 0.9));
  canvas.drawCircle(x, y, r, rim);
  const spec = Skia.Paint();
  spec.setAntiAlias(true);
  spec.setColor(rgba("#FFFFFF", a * 0.55));
  canvas.drawCircle(x - r * 0.33, y - r * 0.34, r * 0.22, spec);
}

/** The stick barrel, so a friendly reads as something that shoots. */
function gun(canvas: SkCanvas, x: number, y: number, r: number, hue: number, aim: number, a = 1) {
  const q = Skia.Paint();
  q.setAntiAlias(true);
  q.setStyle(PaintStyle.Stroke);
  q.setStrokeCap(StrokeCap.Round);
  q.setStrokeWidth(Math.max(2, r * 0.3));
  q.setColor(hsl(hue, 26, 86, a));
  canvas.drawLine(
    x + Math.cos(aim) * r * 0.3, y + Math.sin(aim) * r * 0.3,
    x + Math.cos(aim) * r * 1.66, y + Math.sin(aim) * r * 1.66, q,
  );
}

function poly(canvas: SkCanvas, x: number, y: number, r: number, n: number, rot: number, hue: number) {
  const path = Skia.Path.Make();
  for (let q = 0; q < n; q++) {
    const a = rot + (q * TAU) / n;
    const X = x + Math.cos(a) * r, Y = y + Math.sin(a) * r;
    if (q) path.lineTo(X, Y); else path.moveTo(X, Y);
  }
  path.close();
  const fill = Skia.Paint();
  fill.setAntiAlias(true);
  fill.setColor(hsl(hue, 86, 52));
  canvas.drawPath(path, fill);
  const rim = Skia.Paint();
  rim.setAntiAlias(true);
  rim.setStyle(PaintStyle.Stroke);
  rim.setStrokeWidth(1.6);
  rim.setColor(hsl(hue, 96, 74));
  canvas.drawPath(path, rim);
}

function lobes(canvas: SkCanvas, x: number, y: number, r: number, hue: number) {
  const path = Skia.Path.Make();
  path.setFillType(FillType.Winding);
  path.addCircle(x - r * 0.36, y, r * 0.74);
  path.addCircle(x + r * 0.36, y, r * 0.74);
  const fill = Skia.Paint();
  fill.setAntiAlias(true);
  fill.setColor(hsl(hue, 84, 50));
  canvas.drawPath(path, fill);
}

function shot(canvas: SkCanvas, x: number, y: number, dx: number, dy: number, hue: number) {
  const glow = Skia.Paint();
  glow.setAntiAlias(true);
  glow.setBlendMode(BlendMode.Plus);
  glow.setStyle(PaintStyle.Stroke);
  glow.setStrokeCap(StrokeCap.Round);
  glow.setStrokeWidth(2.6);
  glow.setColor(hsl(hue, 90, 68, 0.5));
  canvas.drawLine(x, y, x + dx, y + dy, glow);
  const head = Skia.Paint();
  head.setAntiAlias(true);
  head.setBlendMode(BlendMode.Plus);
  head.setColor(hsl(hue, 95, 86, 1));
  canvas.drawCircle(x + dx, y + dy, 2.4, head);
}

/**
 * A still of the game with the three things in it named.
 *
 * The rules used to be three sentences of prose about who is who. One picture with
 * the actual shapes on it, in the actual colours, says the same thing before anyone
 * has read a word — and it is drawn with the same routines the game draws with, so it
 * cannot drift out of date with what the arena actually looks like.
 */
export function MenuDiagram() {
  // The picture is authored at a fixed 360 units and stretched to the container, but
  // the labels are React Native text at fixed pixel sizes — so a hand-tuned offset
  // cannot line an arrow up with the end of a word. Measure both and convert.
  // Derived, not measured: the sheet is capped at 560 and padded 22 a side, so the
  // width is known before the first paint. Waiting on onLayout meant the first frame
  // drew at the authored size and overflowed its own container.
  const { width: winW } = useWindowDimensions();
  const box = Math.min(winW, 560) - 44;
  const [widths, setWidths] = useState<number[]>(() => KEYS.map(() => 0));

  // A Picture draws at the size it was authored, not the size of the Canvas it lands
  // on — so a 360-unit drawing in a 331-point container simply loses its right and
  // bottom edges. Author in fixed units for readable coordinates, then scale the
  // whole thing onto whatever width the layout actually gave us.
  const fit = box / W;

  const picture = useMemo(
    () =>
      createPicture((canvas) => {
        canvas.scale(fit, fit);
        const floor = Skia.Paint();
        floor.setAntiAlias(true);
        floor.setShader(
          Skia.Shader.MakeRadialGradient(
            { x: W / 2, y: H / 2 }, W * 0.7,
            [rgba("#182443"), rgba("#090E1E")], [0, 1], TileMode.Clamp,
          ),
        );
        const rr = Skia.RRectXY(Skia.XYWHRect(0, 0, W, H), 14, 14);
        canvas.drawRRect(rr, floor);
        const edge = Skia.Paint();
        edge.setAntiAlias(true);
        edge.setStyle(PaintStyle.Stroke);
        edge.setStrokeWidth(1.4);
        edge.setColor(rgba("#26314F"));
        canvas.drawRRect(rr, edge);

        // a bloom, so the one thing worth standing in is on the picture too
        const bloom = Skia.Paint();
        bloom.setAntiAlias(true);
        bloom.setShader(
          Skia.Shader.MakeRadialGradient(
            { x: W * 0.74, y: H * 0.42 }, 54,
            [rgba("#5EE9D8", 0.16), rgba("#5EE9D8", 0)], [0, 1], TileMode.Clamp,
          ),
        );
        canvas.drawCircle(W * 0.74, H * 0.42, 54, bloom);

        // enemies, three silhouettes so the variety shows
        poly(canvas, W * 0.86, H * 0.60, 11, 4, 0.785, 12);
        poly(canvas, W * 0.70, H * 0.20, 10, 3, -1.2, 28);
        lobes(canvas, W * 0.14, H * 0.30, 12, 300);

        // dittos, mid-fight
        shot(canvas, W * 0.30, H * 0.24, 32, -6, 120);
        gun(canvas, W * 0.26, H * 0.26, 11, 120, -0.2);
        bubble(canvas, W * 0.26, H * 0.26, 11, 120, 0.92);
        shot(canvas, W * 0.50, H * 0.34, 26, -18, 132);
        gun(canvas, W * 0.46, H * 0.36, 10, 132, -0.6);
        bubble(canvas, W * 0.46, H * 0.36, 10, 132, 0.8);

        // you, biggest and double-ringed
        const px = W * 0.36, py = H * 0.62, pr = 14;
        const ring = Skia.Paint();
        ring.setAntiAlias(true);
        ring.setStyle(PaintStyle.Stroke);
        ring.setStrokeWidth(1.6);
        ring.setColor(rgba("#E6ECFF", 0.9));
        canvas.drawCircle(px, py, pr + 6, ring);
        ring.setStrokeWidth(1);
        ring.setColor(rgba("#5EE9D8", 0.45));
        canvas.drawCircle(px, py, pr + 10, ring);
        shot(canvas, px + 18, py - 8, 34, -14, 185);
        gun(canvas, px, py, pr, 185, -0.38);
        bubble(canvas, px, py, pr, 185, 1);

        // An arrow to each thing it names, bowed and drawn in two strokes so it
        // reads as something someone drew on the picture rather than a UI rule.
        const ink = Skia.Paint();
        ink.setAntiAlias(true);
        ink.setStyle(PaintStyle.Stroke);
        ink.setStrokeCap(StrokeCap.Round);
        ink.setStrokeWidth(1.5);
        const toPicture = W / box;
        KEYS.forEach((k, i) => {
          ink.setColor(rgba(k.tint, 0.8));
          const wide = widths[i] * toPicture;
          const x0 = k.x * W + (k.side === "right" ? wide + 7 : -7);
          const y0 = k.y * H + 6;
          const tx = k.toX * W, ty = k.toY * H;
          // bow the shaft to one side of the straight line
          const mx = (x0 + tx) / 2, my = (y0 + ty) / 2;
          const dx = tx - x0, dy = ty - y0, len = Math.hypot(dx, dy) || 1;
          const bow = k.bow * 16;
          const cx = mx - (dy / len) * bow, cy = my + (dx / len) * bow;
          // the head points along the curve's last leg, and the shaft stops short of
          // it so the tip stays a clean point rather than a blob of overlap
          const a = Math.atan2(ty - cy, tx - cx);
          const head = 13;
          // Stand the tip off its subject. An arrow that lands on the thing reads as
          // striking it; one that stops a little short reads as pointing at it.
          const x1 = tx - Math.cos(a) * GAP, y1 = ty - Math.sin(a) * GAP;
          const bx = x1 - Math.cos(a) * head * 0.72, by = y1 - Math.sin(a) * head * 0.72;
          const shaft = Skia.Path.Make();
          shaft.moveTo(x0, y0);
          shaft.quadTo(cx, cy, bx, by);
          canvas.drawPath(shaft, ink);

          // a filled head, one barb a touch longer than the other
          const tip = Skia.Path.Make();
          tip.moveTo(x1, y1);
          tip.lineTo(x1 - Math.cos(a - 0.42) * head, y1 - Math.sin(a - 0.42) * head);
          tip.lineTo(x1 - Math.cos(a) * head * 0.55, y1 - Math.sin(a) * head * 0.55);
          tip.lineTo(x1 - Math.cos(a + 0.38) * head * 1.1, y1 - Math.sin(a + 0.38) * head * 1.1);
          tip.close();
          const nib = Skia.Paint();
          nib.setAntiAlias(true);
          nib.setColor(rgba(k.tint, 0.85));
          canvas.drawPath(tip, nib);
        });
      }, { x: 0, y: 0, width: box, height: box * (H / W) }),
    [box, widths, fit],
  );

  return (
    <View style={[styles.wrap, { width: box, height: box * (H / W) }]}>
      <Canvas style={styles.canvas}>
        <Picture picture={picture} />
      </Canvas>
      {KEYS.map((k, i) => (
        <View
          key={k.label}
          style={[styles.key, { left: `${k.x * 100}%`, top: `${k.y * 100}%` }]}
          onLayout={(e) => {
            const w = e.nativeEvent.layout.width;
            setWidths((prev) => (prev[i] === w ? prev : prev.map((v, j) => (j === i ? w : v))));
          }}
        >
          <Text style={[styles.label, { color: k.tint }]}>{k.label}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: "center", marginVertical: 6 },
  canvas: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  key: { position: "absolute" },
  label: {
    fontFamily: F.mono, fontSize: 9.5, letterSpacing: 1.1,
    textTransform: "uppercase",
  },
});
