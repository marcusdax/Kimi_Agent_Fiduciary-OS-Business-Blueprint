import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parse } from "postcss";

// Contrast contract for the circuit-board funnel's swappable token layer.
// Values come from the designer's style sample (lowest reported pair 4.55:1).
const css = readFileSync(new URL("../src/funnel/funnel.css", import.meta.url), "utf8");
const sheet = parse(css);
const tokens = new Map();
sheet.walkDecls(/^--fos-/, (d) => { if (!tokens.has(d.prop)) tokens.set(d.prop, d.value); });
const hex = (v) => (v.startsWith("#") ? v : tokens.get(v));
const lum = (h) => h.slice(1).match(/../g).map((x) => parseInt(x, 16) / 255)
  .map((x) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4))
  .reduce((s, x, i) => s + x * [0.2126, 0.7152, 0.0722][i], 0);
const ratio = (a, b) => { const [lo, hi] = [lum(hex(a)), lum(hex(b))].sort((x, y) => x - y); return (hi + 0.05) / (lo + 0.05); };

describe("circuit funnel visual contracts", () => {
  it("has no undefined funnel token references", () => {
    sheet.walkDecls((d) => {
      for (const m of d.value.matchAll(/var\((--fos-[\w-]+)/g)) assert.ok(tokens.has(m[1]), `Undefined token ${m[1]}`);
    });
  });
  it("keeps text pairs at or above 4.5:1", () => {
    for (const [fg, bg] of [
      ["--fos-ink", "--fos-face"], ["--fos-muted", "--fos-face"], ["--fos-muted", "--fos-light-section"],
      ["--fos-etched-on-face", "--fos-face"], ["--fos-etched-on-light", "--fos-light-section"], ["--fos-etched-on-light", "--fos-face"],
      ["--fos-status-needs-info", "#ffffff"], ["--fos-status-ready", "#ffffff"], ["--fos-status-waiting", "#ffffff"], ["--fos-status-done", "#ffffff"],
      ["--fos-error", "#ffffff"], ["--fos-example-ink", "--fos-example-bg"], ["--fos-pin-chip-ink", "--fos-pin-chip"],
      ["--fos-on-board", "--fos-board"], ["--fos-on-board-muted", "--fos-board"], ["--fos-on-board-quiet", "--fos-board"],
      ["--fos-on-board-label", "--fos-board"], ["--fos-on-board-label", "--fos-board-panel"], ["--fos-on-board-muted", "--fos-board-panel"],
      ["--fos-on-copper", "--fos-copper-glow"], ["--fos-on-copper", "--fos-copper"],
    ]) {
      const r = ratio(fg, bg);
      assert.ok(r >= 4.5, `${fg} on ${bg} is ${r.toFixed(2)}:1`);
    }
  });
  it("keeps focus rings at or above 3:1 on dark and light surfaces", () => {
    // The designer's --fos-focus fails 3:1 on light faces; the light-surface ring must exist for that reason.
    assert.ok(ratio("--fos-focus", "--fos-face") < 3);
    assert.match(css, /:is\(\.fx-light, \.fx-face\) :focus-visible \{ outline-color: var\(--fos-focus-on-light\)/);
    assert.ok(ratio("--fos-focus", "--fos-board") >= 3);
    assert.ok(ratio("--fos-focus", "--fos-board-panel") >= 3);
    assert.ok(ratio("--fos-focus-on-light", "--fos-face") >= 3);
    assert.ok(ratio("--fos-focus-on-light", "--fos-light-section") >= 3);
  });
  it("resets global input styling on funnel radios and checkboxes", () => {
    const rule = [];
    sheet.walkRules((r) => { if (r.selector === '.fos-funnel :is(input[type="radio"], input[type="checkbox"])') rule.push(r); });
    assert.equal(rule.length, 1, "missing radio/checkbox reset rule");
    const v = {};
    rule[0].walkDecls((d) => { v[d.prop] = d.value; });
    assert.equal(v.background, "transparent");
    assert.equal(v["border-radius"], "0");
    assert.equal(v.appearance, "auto");
    assert.equal(v["color-scheme"], "light");
    assert.equal(v["accent-color"], "var(--fos-ink)");
    assert.ok(Number.parseInt(v.width) >= 16 && v.width === v.height, "controls need a visible fixed size");
  });
  it("scopes every rule to the funnel and disables motion when reduced", () => {
    sheet.walkRules((r) => {
      if (r.parent?.type === "atrule" && r.parent.name === "keyframes") return;
      for (const sel of r.selectors) assert.match(sel, /^\.(fos-funnel|fx-)/, `Unscoped selector ${sel}`);
    });
    assert.match(css, /prefers-reduced-motion: reduce[\s\S]*animation: none !important/);
  });
});
