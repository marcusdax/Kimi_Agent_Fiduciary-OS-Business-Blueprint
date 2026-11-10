import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parse } from "postcss";

// Contrast contract for the circuit-board funnel's swappable token layer.
// Values come from the designer's style sample (lowest reported pair 4.55:1).
const css = readFileSync(new URL("../src/funnel/funnel.css", import.meta.url), "utf8");
const sheet = parse(css);
const tokens = new Map();
sheet.walkDecls(/^--fx-/, (d) => { if (!tokens.has(d.prop)) tokens.set(d.prop, d.value); });
const hex = (v) => (v.startsWith("#") ? v : tokens.get(v));
const lum = (h) => h.slice(1).match(/../g).map((x) => parseInt(x, 16) / 255)
  .map((x) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4))
  .reduce((s, x, i) => s + x * [0.2126, 0.7152, 0.0722][i], 0);
const ratio = (a, b) => { const [lo, hi] = [lum(hex(a)), lum(hex(b))].sort((x, y) => x - y); return (hi + 0.05) / (lo + 0.05); };

describe("circuit funnel visual contracts", () => {
  it("has no undefined funnel token references", () => {
    sheet.walkDecls((d) => {
      for (const m of d.value.matchAll(/var\((--fx-[\w-]+)/g)) assert.ok(tokens.has(m[1]), `Undefined token ${m[1]}`);
    });
  });
  it("keeps text pairs at or above 4.5:1", () => {
    for (const [fg, bg] of [
      ["--fx-ink", "--fx-face"], ["--fx-muted", "--fx-face"], ["--fx-muted", "--fx-light"],
      ["--fx-etched-ink", "--fx-face"], ["--fx-etched-copper", "--fx-light"], ["--fx-etched-copper", "--fx-face"],
      ["--fx-amber", "#ffffff"], ["--fx-teal", "#ffffff"], ["--fx-slate", "#ffffff"], ["--fx-green", "#ffffff"],
      ["--fx-error", "#ffffff"], ["--fx-tag-ink", "--fx-tag-bg"], ["--fx-pill-ink", "--fx-pill"],
      ["--fx-on-dark", "--fx-board"], ["--fx-on-dark-muted", "--fx-board"], ["--fx-on-dark-quiet", "--fx-board"],
      ["--fx-copper-glow", "--fx-board"], ["--fx-copper-glow", "--fx-panel-dark"], ["--fx-on-dark-muted", "--fx-panel-dark"],
    ]) {
      const r = ratio(fg, bg);
      assert.ok(r >= 4.5, `${fg} on ${bg} is ${r.toFixed(2)}:1`);
    }
  });
  it("keeps focus rings at or above 3:1 on dark and light surfaces", () => {
    assert.ok(ratio("--fx-focus-dark", "--fx-board") >= 3);
    assert.ok(ratio("--fx-focus-dark", "--fx-panel-dark") >= 3);
    assert.ok(ratio("--fx-focus-light", "--fx-face") >= 3);
    assert.ok(ratio("--fx-focus-light", "--fx-light") >= 3);
  });
  it("scopes every rule to the funnel and disables motion when reduced", () => {
    sheet.walkRules((r) => {
      if (r.parent?.type === "atrule" && r.parent.name === "keyframes") return;
      for (const sel of r.selectors) assert.match(sel, /^\.(fos-funnel|fx-)/, `Unscoped selector ${sel}`);
    });
    assert.match(css, /prefers-reduced-motion: reduce[\s\S]*animation: none !important/);
  });
});
