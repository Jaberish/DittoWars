import React, { useMemo } from "react";
import { StyleSheet, Text, View, useWindowDimensions } from "react-native";
import {
  Canvas, FillType, PaintStyle, Picture, Skia, createPicture, type SkCanvas,
} from "@shopify/react-native-skia";
import { ETYPES, TYPE_ORDER, type EType } from "../engine/enemies";
import { F, T } from "./theme";

const TAU = Math.PI * 2;
const COLS = 5;
const CELL = 62;
const POLY: Record<string, number> = {
  arrow: 3, tri: 3, diamond: 4, square: 4, pent: 5, hex: 6, oct: 8,
};

function hsl(h: number, s: number, l: number, a = 1) {
  const c = Skia.Color(`hsl(${h}, ${s}%, ${l}%)`);
  return Float32Array.of(c[0], c[1], c[2], a);
}

/**
 * The same silhouette rules the arena draws by, at trophy size.
 *
 * Kept deliberately close to the renderer's own vocabulary: the point of the wall is
 * that you recognise each one from having fought it, so a stylised version would
 * defeat it.
 */
function silhouette(canvas: SkCanvas, T2: EType, x: number, y: number, r: number) {
  const path = Skia.Path.Make();
  path.setFillType(FillType.Winding);
  const sh = T2.shape;
  const aim = -0.45;

  if (sh === "lobes") {
    path.addCircle(x - r * 0.36, y, r * 0.74);
    path.addCircle(x + r * 0.36, y, r * 0.74);
  } else if (sh === "trefoil") {
    for (let q = 0; q < 3; q++) {
      const a = -1.5708 + (q * TAU) / 3;
      path.addCircle(x + Math.cos(a) * r * 0.44, y + Math.sin(a) * r * 0.44, r * 0.62);
    }
  } else if (sh === "petal") {
    for (let q = 0; q < 5; q++) {
      const a = -1.5708 + (q * TAU) / 5;
      path.addCircle(x + Math.cos(a) * r * 0.62, y + Math.sin(a) * r * 0.62, r * 0.5);
    }
    path.addCircle(x, y, r * 0.44);
  } else if (sh === "ring" || sh === "crescent") {
    path.setFillType(FillType.EvenOdd);
    path.addCircle(x, y, r);
    if (sh === "ring") path.addCircle(x, y, r * 0.48);
    else path.addCircle(x + r * 0.52, y - r * 0.26, r * 0.82);
  } else if (sh === "star" || sh === "spike") {
    const n = sh === "star" ? 10 : 24;
    const inner = sh === "star" ? 0.46 : 0.74;
    const outer = sh === "star" ? 1.16 : 1.18;
    for (let q = 0; q < n; q++) {
      const a = -1.5708 + (q * TAU) / n;
      const rr = q % 2 ? r * inner : r * outer;
      const X = x + Math.cos(a) * rr, Y = y + Math.sin(a) * rr;
      if (q) path.lineTo(X, Y); else path.moveTo(X, Y);
    }
    path.close();
  } else if (sh === "gear") {
    path.setFillType(FillType.EvenOdd);
    for (let q = 0; q < 32; q++) {
      const a = (q * TAU) / 32;
      const rr = q % 4 === 1 || q % 4 === 2 ? r * 1.12 : r * 0.82;
      const X = x + Math.cos(a) * rr, Y = y + Math.sin(a) * rr;
      if (q) path.lineTo(X, Y); else path.moveTo(X, Y);
    }
    path.close();
    path.addCircle(x, y, r * 0.38);
  } else if (sh === "eye" || sh === "bar" || sh === "drop") {
    const a = sh === "drop" ? aim + Math.PI : aim;
    const ca = Math.cos(a), sa = Math.sin(a);
    const px = (u: number, v: number): [number, number] =>
      [x + ca * u - sa * v, y + sa * u + ca * v];
    if (sh === "eye") {
      const [x0, y0] = px(-r * 1.25, 0), [x1, y1] = px(r * 1.25, 0);
      const [c0, d0] = px(0, -r * 1.5), [c1, d1] = px(0, r * 1.5);
      path.moveTo(x0, y0);
      path.quadTo(c0, d0, x1, y1);
      path.quadTo(c1, d1, x0, y0);
    } else if (sh === "bar") {
      const h = r * 1.8, w = r * 0.42;
      const [a0, b0] = px(-h, -w), [a1, b1] = px(h, -w);
      const [a2, b2] = px(h, w), [a3, b3] = px(-h, w);
      path.moveTo(a0, b0); path.lineTo(a1, b1); path.lineTo(a2, b2); path.lineTo(a3, b3);
    } else {
      const [tx, ty] = px(r * 1.7, 0);
      const [l0, m0] = px(0, -r * 0.95), [l1, m1] = px(0, r * 0.95);
      path.addCircle(x, y, r * 0.95);
      path.moveTo(l0, m0); path.lineTo(tx, ty); path.lineTo(l1, m1);
    }
    path.close();
  } else if (POLY[sh]) {
    const n = POLY[sh];
    const pointed = sh === "arrow" || sh === "tri";
    const rot = pointed ? aim : sh === "square" ? 0.785 : 0.5;
    const rad = pointed ? r * 1.5 : r;
    for (let q = 0; q < n; q++) {
      const a = rot + (q * TAU) / n;
      const X = x + Math.cos(a) * rad, Y = y + Math.sin(a) * rad;
      if (q) path.lineTo(X, Y); else path.moveTo(X, Y);
    }
    path.close();
  } else {
    path.addCircle(x, y, r);
  }

  const fill = Skia.Paint();
  fill.setAntiAlias(true);
  fill.setColor(hsl(T2.hue, T2.sat, 52));
  canvas.drawPath(path, fill);
  const rim = Skia.Paint();
  rim.setAntiAlias(true);
  rim.setStyle(PaintStyle.Stroke);
  rim.setStrokeWidth(1.3);
  rim.setColor(hsl(T2.hue, Math.min(100, T2.sat + 20), 76));
  canvas.drawPath(path, rim);
  const spec = Skia.Paint();
  spec.setAntiAlias(true);
  spec.setColor(Float32Array.of(1, 1, 1, 0.4));
  canvas.drawCircle(x - r * 0.32, y - r * 0.33, r * 0.18, spec);
}

/** Everything you fought, in the order it arrived. */
export function EnemyGallery() {
  const { width } = useWindowDimensions();
  const inner = Math.min(width, 560) - 44;
  const cell = inner / COLS;
  const list = useMemo(() => TYPE_ORDER.filter((id) => ETYPES[id].at <= 100), []);
  const rows = Math.ceil(list.length / COLS);
  const height = rows * CELL;

  const picture = useMemo(
    () =>
      createPicture((canvas) => {
        list.forEach((id, i) => {
          const cx = ((i % COLS) + 0.5) * cell;
          const cy = ((i / COLS) | 0) * CELL + CELL * 0.38;
          const T2 = ETYPES[id];
          // scaled by its own bulk so a boss reads as a boss, capped so it fits
          const r = Math.max(8, Math.min(19, 7 + T2.r * 0.3));
          silhouette(canvas, T2, cx, cy, r);
        });
      }, { x: 0, y: 0, width: inner, height }),
    [list, cell, inner, height],
  );

  return (
    <View style={{ width: inner, height, alignSelf: "center" }}>
      <Canvas style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}>
        <Picture picture={picture} />
      </Canvas>
      {list.map((id, i) => (
        <Text
          key={id}
          style={[
            styles.name,
            {
              left: (i % COLS) * cell,
              top: ((i / COLS) | 0) * CELL + CELL * 0.68,
              width: cell,
            },
          ]}
          numberOfLines={1}
        >
          {id}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  name: {
    position: "absolute", textAlign: "center",
    fontFamily: F.mono, fontSize: 8.5, letterSpacing: 0.5, color: T.mute,
    textTransform: "uppercase",
  },
});
