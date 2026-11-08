import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
import { parse } from "postcss";

// Structural CSS contracts, not a substitute for browser/device acceptance.
const sheet = parse(css);
const tokens = new Map();
sheet.walkDecls(/^--/, (decl) => { if (!tokens.has(decl.prop)) tokens.set(decl.prop, decl.value); });
const rules = [];
sheet.walkRules((rule) => {
  const values = {};
  rule.walkDecls((decl) => { values[decl.prop] = decl.value; });
  rules.push({ selector: rule.selector, values });
});
function luminance(hex) {
  const rgb = hex.slice(1).match(/../g).map((x) => parseInt(x, 16) / 255)
    .map((x) => x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
}
function contrast(a, b) {
  const [lo, hi] = [luminance(a), luminance(b)].sort((x, y) => x - y);
  return (hi + 0.05) / (lo + 0.05);
}

describe("machined chrome visual contracts", () => {
  it("has no undefined design-token references", () => {
    sheet.walkDecls((decl) => {
      for (const match of decl.value.matchAll(/var\((--[\w-]+)/g)) {
        assert.ok(tokens.has(match[1]), `Undefined token ${match[1]}`);
      }
    });
  });
  it("preserves readable text and accent contrast on dark surfaces", () => {
    for (const background of [tokens.get("--bg"), "#20232e", tokens.get("--chart-surface")]) {
      for (const foreground of ["--text", "--muted", "--cyan", "--gold"]) {
        assert.ok(contrast(tokens.get(foreground), background) >= 4.5);
      }
    }
  });
  it("shares multi-stop steel edges, bevel and radius across cards", () => {
    assert.ok(tokens.get("--chrome-edge").match(/#[0-9a-f]{6}/g).length >= 6);
    const card = rules.find((r) => r.selector === ":is(.panel, .stat, .module-card, .goal-card, .board-card, .hero)");
    assert.equal(card.values["border-radius"], "var(--card-radius)");
    assert.ok(card.values.background.includes("var(--chrome-edge) border-box"));
    assert.ok(card.values["box-shadow"].includes("var(--card-bevel)"));
  });
  it("keeps a static two-scale silver grid outside flat plotting surfaces", () => {
    const grid = rules.filter((r) => r.selector === "main").at(-1);
    assert.equal(grid.values["background-image"].match(/linear-gradient/g).length, 4);
    assert.doesNotMatch(grid.values["background-image"], /cyan|0, 240, 255/);
    assert.ok(grid.values["background-size"].includes("48px 48px"));
    const chart = rules.find((r) => r.selector === ".financial-chart");
    assert.equal(chart.values.background, "var(--chart-surface)");
  });
  it("limits card hover to enabled unselected buttons without movement", () => {
    const hovered = rules.filter((r) => /card.*:hover/.test(r.selector));
    assert.ok(hovered.length > 0);
    for (const rule of hovered) {
      assert.ok(rule.selector.includes("button."));
      assert.ok(rule.selector.includes(":not(:disabled)"));
      assert.ok(rule.selector.includes(":not(.selected)"));
      assert.equal(rule.values.transform, undefined);
      assert.equal(rule.values.animation, undefined);
    }
  });
  it("retains keyboard focus, reduced motion and narrow-screen stacking", () => {
    assert.ok(rules.some((r) => r.selector.includes("button.goal-card") && r.selector.includes(":focus-visible") && r.values.outline.includes("var(--gold)")));
    assert.match(css, /prefers-reduced-motion: reduce/);
    assert.match(css, /transition: none !important/);
    assert.match(css, /max-width: 640px/);
    assert.match(css, /grid-template-columns: 1fr/);
  });
});
