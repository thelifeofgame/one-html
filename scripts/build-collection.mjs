import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { build } from "esbuild";

const root = resolve(import.meta.dirname, "..");
const sources = resolve(root, "collections/sources");
const saltline = await readFile(
  resolve(sources, "saltline-zh.original.html"),
  "utf8",
);
const quality = 'quality:zy(i.q||(i.shot?"test":""))';
if (!saltline.includes(quality))
  throw new Error("Saltline quality selection changed.");
const medium = 'medium:{name:"medium",scale:.85,msaa:2,shadow:2048,tex:1024';
if (!saltline.includes(medium))
  throw new Error("Saltline medium preset changed.");
await writeFile(
  resolve(sources, "saltline.play.html"),
  saltline
    .replace(quality, 'quality:zy(i.q||(i.shot?"test":"medium"))')
    .replace(
      medium,
      'medium:{name:"medium",scale:.85,msaa:2,shadow:2048,tex:512',
    ),
);
const vendor = resolve(root, "collections/vendor/three-r164");
const result = await build({
  entryPoints: [resolve(sources, "london-main.original.js")],
  bundle: true,
  write: false,
  format: "iife",
  minify: true,
  legalComments: "inline",
  alias: {
    three: resolve(vendor, "three.module.js"),
    "three/addons/controls/OrbitControls.js": resolve(
      vendor,
      "OrbitControls.js",
    ),
  },
});
const css = await readFile(resolve(sources, "london.original.css"), "utf8");
const original = await readFile(
  resolve(sources, "london.original.html"),
  "utf8",
);
const entry = '<script type="module" src="./main.js"></script>';
if (!original.includes(entry)) throw new Error("London entry point changed.");
const html = original
  .replace(
    '<link rel="stylesheet" href="./styles.css" />',
    () => `<style>${css.replace(/<\/style/gi, "<\\/style")}</style>`,
  )
  .replace(/<script type="importmap">[\s\S]*?<\/script>/, "")
  .replace(
    entry,
    () =>
      `<script>${result.outputFiles[0].text.replace(/<\/script/gi, "<\\/script")}</script>`,
  );
await writeFile(resolve(sources, "london.play.html"), html);
console.log(
  `London Railway bundled offline: ${Buffer.byteLength(html)} bytes.`,
);
