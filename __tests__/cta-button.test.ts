import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const tsx = readFileSync(join(process.cwd(), "components", "ui", "cta-button.tsx"), "utf8");
const css = readFileSync(join(process.cwd(), "components", "ui", "cta-button.module.css"), "utf8");

describe("CTA hover variants", () => {
  it("the accessible name is the resting label and does not change on hover", () => {
    // The reference button puts both labels in the DOM as plain text, so its
    // accessible name is the two concatenated ("now! play"). A hover state must
    // not rewrite what a screen reader announces.
    expect(tsx).toMatch(/aria-label=\{label\}/);
    // Both visible labels are decorative; the name comes from aria-label.
    // Anchored on the labels wrapper itself rather than a slice between two
    // moving landmarks — the previous version silently matched an empty string
    // once the surrounding code was refactored.
    expect(tsx).toMatch(/className=\{s\.labels\}\s+aria-hidden="true"/);
  });

  it("motion is disabled entirely under prefers-reduced-motion, not just shortened", () => {
    const block = css.slice(css.indexOf("prefers-reduced-motion"));
    expect(block).toMatch(/transition:\s*none\s*!important/);
    expect(block).toMatch(/transition-delay:\s*0ms\s*!important/);
    expect(block).toMatch(/animation:\s*none\s*!important/);
    // A shortened duration is not "disabled".
    expect(block).not.toMatch(/transition:[^;]*\d+ms/);
  });

  it("every icon's choreography lands inside the 400ms ceiling", () => {
    // The previous version compared the GLOBAL max duration against the global
    // max delay, which belongs to no actual animation: with several icons in
    // one stylesheet that sum (300 + 240) overstated every real total. Assert
    // the two component limits separately, plus the documented budgets.
    const durations = [...css.matchAll(/transition:[^;]*?(\d+)ms/g)].map((m) => +m[1]);
    const delays = [...css.matchAll(/transition-delay:\s*(\d+)ms/g)].map((m) => +m[1]);
    expect(Math.max(...durations), "longest single transition").toBeLessThanOrEqual(300);
    expect(Math.max(...delays, 0), "longest stagger").toBeLessThanOrEqual(250);

    // The component header states each icon's total. Those are the numbers
    // reported to the reviewer, so they are the ones under test.
    const budgets = [...tsx.matchAll(/=\s*(\d+)ms$/gm)].map((m) => +m[1]);
    expect(budgets.length, "documented icon budgets").toBeGreaterThanOrEqual(4);
    for (const b of budgets) expect(b, "documented budget").toBeLessThanOrEqual(400);
  });

  it("the checkmark draws by dash offset rather than fading in", () => {
    expect(css).toMatch(/stroke-dashoffset/);
    // pathLength=1 keeps the dash maths independent of the path geometry.
    expect(tsx).toMatch(/pathLength=\{1\}/);
    // An opacity fade would be an image appearing, not a mark being made.
    // Scope to the .check rule ALONE. Slicing to a far-away landmark swept in
    // the pin, route and notify rules, which legitimately animate opacity.
    const start = css.indexOf(".check {");
    const check = css.slice(start, css.indexOf("}", start));
    expect(check).not.toMatch(/opacity/);
  });

  it("the label swap cannot resize the button mid-animation", () => {
    // Two labels of different widths in normal flow would reflow the CTA row
    // every time a pointer crossed it. They share one grid cell instead.
    const labels = css.slice(css.indexOf(".labels {"), css.indexOf(".icon {"));
    expect(labels).toMatch(/display:\s*inline-grid/);
    expect(labels).toMatch(/grid-area:\s*1\s*\/\s*1/);
  });
});
