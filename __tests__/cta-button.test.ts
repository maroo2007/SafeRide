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

describe("the lift and press", () => {
  it("lifts on hover and punches BELOW the resting plane on press", () => {
    expect(cssCode).toMatch(/transform:\s*translateY\(calc\(-1 \* var\(--lift\)\)\)/);
    const active = cssCode.slice(cssCode.indexOf(".btn:active {"));
    expect(active).toMatch(/transform:\s*translateY\(2px\)/);
  });

  it("the hard shadow is offset by exactly the lift, so it reads as a footprint", () => {
    // If the offset and the lift diverge, the shadow's top edge stops sitting
    // where the button was and the illusion of rising off its own outline
    // breaks — it just looks like a shadow that grew.
    // Substring count, not a regex: a multi-line regex literal here has
    // silently zeroed this whole FILE three times, and vitest still
    // reports the run as passing because the file contributes 0 tests.
    const hard = cssCode.split("0 var(--lift) 0 ").length - 1;
    expect(hard, "each fill needs a --lift-offset hard shadow").toBeGreaterThanOrEqual(3);
  });

  it("the press clears the shadow", () => {
    for (const fill of [".solid:active", ".outlineInk:active", ".outlineOnMedia:active"]) {
      const i = cssCode.indexOf(fill);
      expect(i, `${fill} must exist`).toBeGreaterThan(-1);
      expect(cssCode.slice(i, cssCode.indexOf("}", i))).toMatch(/box-shadow:\s*none/);
    }
  });

  it("carries no decorative text glow", () => {
    // The reference's `text-shadow: 0 0 20px rgba(255,255,255,.397)` is a game
    // styling glow and is not wanted. The one text-shadow here is a different
    // thing: a knockout halo in the FILL colour, so the route line reads as
    // passing behind the label the way a map label knocks a gap out of a road.
    // Removing it was tried and photographed — the line collides with the
    // baseline and the "p" descender.
    const shadows = [...cssCode.matchAll(/text-shadow:\s*([^;]+);/g)].map((m) => m[1]);
    for (const sh of shadows) {
      expect(sh, "a glow, not a knockout").not.toMatch(/rgba\(\s*255,\s*255,\s*255/);
      expect(sh, "knockout must use the fill colour").toContain("var(--accent)");
      // A knockout hugs the glyph; a glow spreads. Anything past 8px is a glow.
      for (const [, blur] of sh.matchAll(/0 0 (\d+)px/g)) {
        expect(+blur, `blur ${blur}px is a glow, not a knockout`).toBeLessThanOrEqual(8);
      }
    }
  });

  it("takes its radius from the system token, not a hardcoded pill", () => {
    expect(cssCode).toMatch(/border-radius:\s*var\(--radius-brand\)/);
    expect(cssCode).not.toMatch(/border-radius:\s*(999px|9999px|5px)/);
  });

  it("reduced motion removes the lift AND the press, not just the timing", () => {
    const block = cssCode.slice(cssCode.indexOf("prefers-reduced-motion"));
    expect(block).toMatch(/\.btn:hover/);
    expect(block).toMatch(/\.btn:active/);
    expect(block).toMatch(/transform:\s*none/);
  });
});

describe("Button 2 — expanding fill and shine", () => {
  it("gives the shine and the ripple separate elements", () => {
    // The source hands ::after both jobs, so its second declaration wins and
    // the ripple never runs as written. Three layers, one job each.
    for (const cls of [".expandFill {", ".shine {", ".ripple {"]) {
      expect(cssCode, `${cls} must be its own layer`).toContain(cls);
    }
    // And none of them may be a pseudo-element that another effect also claims.
    expect(cssCode).not.toMatch(/\.shine::after/);
    expect(cssCode).not.toMatch(/\.ripple::after/);
  });

  it("the ripple stays inside the 400ms ceiling", () => {
    const anim = /animation:\s*rippleOut\s+(\d+)ms/.exec(cssCode);
    expect(anim, "ripple animation must be declared").not.toBeNull();
    expect(+anim![1], "the source's 600ms is outside our ceiling").toBeLessThanOrEqual(400);
  });

  it("the expanding fill is primary-only", () => {
    // On an outline secondary it turns a subordinate control into a filled
    // one and the hierarchy collapses — photographed before this guard.
    expect(tsxCode).toMatch(/behaviour !== "lift" && fill === "solid"/);
    // And the label flip is tied to the fill actually arriving; without that
    // the secondary's label went paper-on-paper at 1.12:1.
    expect(tsxCode).toMatch(/expands && behaviour === "invert"/);
  });

  it("every overlay sits on an opaque fill", () => {
    // The shine and ripple are highlights, which is allowed. What is not
    // allowed is the BUTTON's own background going translucent underneath.
    for (const cls of [".expand {", ".solid {"]) {
      const i = cssCode.indexOf(cls);
      expect(cssCode.slice(i, cssCode.indexOf("}", i))).toMatch(/composes:\s*accent-fill from global/);
    }
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

  it("declares no translucent fill on any button SURFACE", () => {
    // Scoped to the surface classes on purpose. The shine and ripple are
    // rgba highlights sitting ON an opaque fill, which is allowed and is not
    // the defect: the defect is the button's own background letting footage
    // through. An earlier version scanned every background in the file and
    // flagged the highlights, which would have been a false positive.
    const SURFACES = [".btn {", ".solid {", ".expand {", ".outlineInk {", ".outlineOnMedia {"];
    for (const cls of SURFACES) {
      const i = cssCode.indexOf(cls);
      if (i < 0) continue;
      const rule = cssCode.slice(i, cssCode.indexOf("}", i));
      const bg = /background(?:-color)?:\s*([^;]+);/.exec(rule);
      if (!bg) continue;
      const alpha = /rgba\([^)]*?,\s*(0?\.\d+|0)\s*\)/.exec(bg[1]);
      if (alpha) {
        expect(parseFloat(alpha[1]), `${cls} translucent fill: ${bg[1].trim()}`).toBeLessThanOrEqual(0.15);
      }
      expect(rule, `${cls} must not blur its backdrop`).not.toMatch(/backdrop-filter/);
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
