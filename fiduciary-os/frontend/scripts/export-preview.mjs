import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
const root = fileURLToPath(new URL("../", import.meta.url));
const index = await readFile(resolve(root, "dist/index.html"), "utf8");
const script = index.match(/<script[^>]+src="([^"]+)"[^>]*><\/script>/);
const style = index.match(/<link[^>]+href="([^"]+\.css)"[^>]*>/);
if (!script || !style)
  throw new Error(
    "Expected one entry script and stylesheet in the Vite build.",
  );
const js = await readFile(
  resolve(root, "dist", script[1].replace(/^\//, "")),
  "utf8",
);
const css = await readFile(
  resolve(root, "dist", style[1].replace(/^\//, "")),
  "utf8",
);
const standalone = index
  .replace(
    script[0],
    () =>
      `<script type="module">${js.replace(/<\/script/gi, "<\\/script")}</script>`,
  )
  .replace(style[0], () => `<style>${css}</style>`);
await writeFile(resolve(root, "dist/fiduciary-os-preview.html"), standalone);
console.log(
  "Exported dist/fiduciary-os-preview.html — standalone, sample-only, no backend or external assets.",
);
