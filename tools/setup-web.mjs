/**
 * Puts CanvasKit where the web build can fetch it.
 *
 * On web, Skia runs on CanvasKit, and its 7.7 MB `.wasm` has to be served as a
 * static file. Rather than commit a copy of something already in node_modules, it
 * is copied into public/ on demand — `npm run web` does this for you.
 */
import { copyFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const src = resolve(root, "node_modules/canvaskit-wasm/bin/full/canvaskit.wasm");
const dest = resolve(root, "public/canvaskit.wasm");

if (!existsSync(src)) {
  console.error("canvaskit-wasm not found — run `npm install` first.");
  process.exit(1);
}
if (existsSync(dest) && statSync(dest).size === statSync(src).size) {
  console.log("canvaskit.wasm already in public/");
} else {
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(src, dest);
  console.log(`copied canvaskit.wasm → public/ (${(statSync(dest).size / 1e6).toFixed(1)} MB)`);
}
