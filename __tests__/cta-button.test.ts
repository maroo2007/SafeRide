import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const tsx = readFileSync(join(process.cwd(), "components", "ui", "cta-button.tsx"), "utf8");
const css = readFileSync(join(process.cwd(), "components", "ui", "cta-button.module.css"), "utf8");
/** Comments legitimately mention the removed treatments; code must not. */
const cssCode = css.replace(/\/\*[\s\S]*?\*\//g, "");
const tsxCode = tsx.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("the hero CTA", () => {
  it("the accessible name is the resting label and does not change on hover", () => {
    // The reference button puts both labels in the DOM as plain text, so its
    // accessible name is the two concatenated ("now! play"). A hover state must
    // not rewrite what a screen reader announces.
    expect(tsx).toMatch(/aria-label=\{label\}/);
    expect(tsx).toMatch(/className=\{s\.labels\}\s+aria-hidden="true"/);
  });

  it("motion is disabled entirely under prefers-reduced-motion, not just shortened", () => {
    const block = css.slice(css.indexOf("prefers-reduced-motion"));
    expect(block).toMatch(/transition:\s*none\s*!important/);
    expect(block).toMatch(/transition-delay:\s*0ms\s*!important/);
    expect(block).toMatch(/animation:\s*none\s*!important/);
    // A shortened duration is not "disabled".
    expect(block).not.toMatch(/transition:[^;]*\d+ms/);
    // The travelling dot has nothing to say when it cannot travel.
    expect(block).toContain("display: none;");
  });

  it("the choreography lands inside the 400ms ceiling", () => {
    const durations = [...cssCode.matchAll(/transition:[^;]*?(\d+)ms/g)].map((m) => +m[1]);
    const delays = [...cssCode.matchAll(/transition-delay:\s*(\d+)ms/g)].map((m) => +m[1]);
    expect(Math.max(...durations), "longest single transition").toBeLessThanOrEqual(300);
    expect(Math.max(...delays, 0), "longest stagger").toBeLessThanOrEqual(150);
    expect(Math.max(...durations) + Math.max(...delays, 0)).toBeLessThanOrEqual(400);
  });

  it("the route line draws by dash offset rather than fading in", () => {
    const start = cssCode.indexOf(".routePath {");
    const rule = cssCode.slice(start, cssCode.indexOf("}", start));
    expect(rule).toMatch(/stroke-dashoffset/);
    // An opacity fade would be an image appearing, not a line being drawn.
    expect(rule).not.toMatch(/opacity/);
    // pathLength=1 keeps the dash maths independent of the path geometry.
    expect(tsx).toMatch(/pathLength=\{1\}/);
  });

  it("the route path has one definition, shared by the stroke and the dot", () => {
    // The dot rides an offset-path in CSS while the stroke is a `d` in the
    // SVG. If those drift the dot leaves the line, and nothing would fail
    // loudly — it would just look subtly wrong.
    const d = /const ROUTE_D = "([^"]+)"/.exec(tsx);
    expect(d, "ROUTE_D must be a single named constant").not.toBeNull();
    const offset = /offset-path:\s*path\("([^"]+)"\)/.exec(css);
    expect(offset, "the dot must ride an offset-path").not.toBeNull();
    expect(offset![1]).toBe(d![1]);
  });

  it("the label swap cannot resize the button mid-animation", () => {
    // Two labels of different widths in normal flow would reflow the CTA row
    // every time a pointer crossed it. They share one grid cell instead.
    const labels = cssCode.slice(cssCode.indexOf(".labels {"), cssCode.indexOf(".rest,"));
    expect(labels).toMatch(/display:\s*inline-grid/);
    expect(cssCode).toMatch(/grid-area:\s*1\s*\/\s*1/);
  });
});

/* ------------------------------------------------------------------ *
 * The glass revert. Every translucent treatment measured 1.02:1 for the
 * label and 1.01:1 for the boundary on paper — invisible, and not
 * recoverable by recolouring the label, because the boundary fails
 * independently. These guard the revert rather than trusting a grep run
 * once.
 * ------------------------------------------------------------------ */
describe("no glass survives on the CTA", () => {
  it("declares no backdrop-filter anywhere", () => {
    expect(cssCode).not.toMatch(/backdrop-filter/i);
  });

  it("declares no translucent fill on any button surface", () => {
    // A translucent BACKGROUND is the defect. Borders and drop-shadows may
    // legitimately be rgba, so only background declarations are scanned.
    const backgrounds = [...cssCode.matchAll(/background(?:-color)?:\s*([^;]+);/g)].map((m) => m[1]);
    for (const b of backgrounds) {
      const alpha = /rgba\([^)]*?,\s*(0?\.\d+|0)\s*\)/.exec(b);
      if (alpha) {
        // Hover tints are fine; a semi-opaque FILL is not, because that is
        // footage showing through the button.
        expect(parseFloat(alpha[1]), `translucent fill: ${b.trim()}`).toBeLessThanOrEqual(0.15);
      }
    }
  });

  it("keeps no orphaned glass or rejected-variant class names", () => {
    for (const dead of [
      "glassLayer", "glassTrue", "glassQuiet", "glassSecondary",
      "lumPath", "lumDot", ".groove", ".trail",
      "routeLum", "routeInk", "routeGroove",
      ".check", ".pin", ".notify", ".arc", ".link", ".node", ".arrow",
    ]) {
      expect(cssCode, `orphaned in css: ${dead}`).not.toContain(dead);
      expect(tsxCode, `orphaned in tsx: ${dead}`).not.toContain(dead.replace(".", "s."));
    }
  });

  it("the primary fill still routes through .accent-fill, keeping the #B9551A edge", () => {
    expect(cssCode).toMatch(/\.solid\s*\{\s*composes:\s*accent-fill from global;/);
    // Writing the hex here would lose the token that neutralises the edge on
    // dark grounds, painting a dark hairline onto the button over footage.
    expect(cssCode).not.toMatch(/#b9551a/i);
    expect(cssCode).not.toMatch(/#fb8a00/i);
  });
});
