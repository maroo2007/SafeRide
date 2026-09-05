import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Source guards for the navbar port.
 *
 * Behavioural guards live in navbar.behaviour.test.tsx. These cover what
 * rendering cannot see: which tokens the CSS reaches for, and which pieces of
 * the reference implementation must NOT come back.
 *
 * Every guard here is paired. A guard phrased only as an absence is passed by
 * a file containing nothing, so each one also asserts the thing that has to be
 * present instead. Verified by emptying both files: 0 of these pass.
 */

const tsx = readFileSync(join(process.cwd(), "components", "ui", "sterling-gate-kinetic-navigation.tsx"), "utf8");
const css = readFileSync(join(process.cwd(), "components", "ui", "sterling-gate-kinetic-navigation.module.css"), "utf8");
/* Comments explain the rules; they must not be able to satisfy them. */
const code = tsx.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const cssCode = css.replace(/\/\*[\s\S]*?\*\//g, "");

/** The body of one CSS rule, by selector. */
function rule(selector: string): string {
  const at = cssCode.indexOf(selector + " {");
  if (at === -1) throw new Error(`no rule for ${selector}`);
  return cssCode.slice(at, cssCode.indexOf("}", at));
}

describe("navbar port (spec 2.2)", () => {
  it("registers GSAP through registerGsap only", () => {
    expect(code).not.toMatch(/registerPlugin/);
    expect(code).toMatch(/registerGsap\(\)/);
    expect(code).toMatch(/from "@\/lib\/gsap"/);
  });

  it("carries six links with matching shapes, not the shipped five", () => {
    const hrefs = [...code.matchAll(/href: "(#[a-z]+)"/g)].map((m) => m[1]);
    expect(hrefs).toEqual(["#features", "#ai", "#coverage", "#pricing", "#faq", "#contact"]);
    const shapes = [...code.matchAll(/data-bg-shape="(\d)"/g)].map((m) => +m[1]);
    expect(shapes.sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("uses no indigo, violet or pink, and none of the component's :root block", () => {
    for (const dead of ["99,102,241", "139,92,246", "236,72,153", "#6366f1"]) {
      expect(code, `shipped placeholder colour ${dead}`).not.toContain(dead);
      expect(cssCode, `shipped placeholder colour ${dead}`).not.toContain(dead);
    }
    expect(cssCode).not.toMatch(/--color-primary/);
    expect(code, "brand accent must actually be used").toContain("rgba(251,138,0,");
    expect(code, "film edge tone must actually be used").toContain("rgba(185,85,26,");
  });

  it("has no demo artifacts left", () => {
    expect(code).not.toMatch(/click me/i);
    expect(code).not.toMatch(/role="button"/);
    expect(code).toMatch(/aria-expanded=\{isMenuOpen\}/);
    expect(code).toMatch(/Open menu/);
  });
});

describe("there is no header bar", () => {
  it("the header, its logo and the Menu/Close text button are gone", () => {
    for (const dead of ["headerWrapper", "navRow", "logoRow", "closeBtn", "buttonText", "menuButtonIcon"]) {
      expect(cssCode, `${dead} should have gone with the header`).not.toContain(`.${dead}`);
      expect(code, `${dead} should have gone with the header`).not.toContain(dead);
    }
    expect(code, "the logo went with the header").not.toMatch(/saferide-logo/);
    expect(code, "so did next/image, which nothing else here uses").not.toMatch(/next\/image/);
    // NO-OP HALF. This was the one guard in the file that an empty component
    // still passed — "the header is gone" is trivially true of nothing at all.
    // Something has to have replaced it.
    expect(cssCode).toContain(".hamburger {");
    expect(code).toMatch(/className=\{s\.hamburger\}/);
  });

  it("what replaces it is fixed in the top-right, above the overlay", () => {
    const btn = rule(".hamburger");
    expect(btn).toMatch(/position:\s*fixed/);
    expect(btn).toMatch(/top:\s*var\(--nav-inset\)/);
    expect(btn).toMatch(/right:\s*var\(--nav-inset\)/);
    const z = (sel: string) => +(/z-index:\s*(\d+)/.exec(rule(sel))?.[1] ?? "0");
    expect(z(".hamburger"), "the trigger is also the close control").toBeGreaterThan(z(".overlayWrapper"));
    expect(z(".overlayWrapper"), "the overlay must still outrank the hero").toBeGreaterThan(0);
  });

  it("the utilities moved into the panel rather than disappearing (§2.2 F)", () => {
    // They are inside .contentWrapper's footer, so they arrive with the panel.
    const footerAt = code.indexOf("menuFooter");
    const wrapperAt = code.indexOf("contentWrapper");
    expect(wrapperAt, "the panel content block must exist").toBeGreaterThan(-1);
    expect(footerAt).toBeGreaterThan(wrapperAt);
    expect(code).toMatch(/العربية/);
    expect(code).toContain("https://safe-ridee.vercel.app/login");
  });
});

describe("the hamburger's ink is measured, not chosen", () => {
  it("the stroke is a token, not the reference's hardcoded white", () => {
    expect(cssCode, "the reference hardcodes stroke: white").not.toMatch(/stroke:\s*white/);
    expect(rule(".line")).toMatch(/stroke:\s*var\(--nav-ink\)/);
    expect(cssCode).toMatch(/--nav-ink:\s*#fcfbf8/);
  });

  it("the collar carries the contrast, at the alpha that was measured", () => {
    // build/hamburger-ground.js: 0.62 gives 5.86:1 on the worst frame of the
    // film and 6.05:1 over --paper. A bare white stroke is 1.00:1 and 1.02:1.
    expect(cssCode).toMatch(/--nav-collar:\s*rgba\(3,\s*3,\s*2,\s*0\.62\)/);
    expect(rule(".collar")).toMatch(/stroke:\s*var\(--nav-collar\)/);
    // Wider than the ink it sits under, or it is invisible.
    const w = (sel: string) => +(/stroke-width:\s*(\d+)/.exec(rule(sel))?.[1] ?? "0");
    expect(w(".collar")).toBeGreaterThan(w(".line"));
  });

  it("the collar tracks the ink exactly, because it is the same geometry", () => {
    // Two paths, each drawn twice: once as collar, once as ink. If the collar
    // were its own shape it could drift out from under the stroke mid-morph.
    expect((code.match(/d=\{PATH_TOP_BOTTOM\}/g) ?? []).length).toBe(2);
    expect((code.match(/d=\{PATH_MIDDLE\}/g) ?? []).length).toBe(2);
    expect((code.match(/s\.collar/g) ?? []).length).toBe(2);
  });

  it("the focus ring gets the same treatment, for the same reason", () => {
    const ring = rule(".hamburger:focus-visible");
    expect(ring).toMatch(/outline:\s*3px solid var\(--ring\)/);
    expect(ring, "an --accent-warm ring on --paper is about 1.2:1 alone").toMatch(/--nav-collar/);
    // §2.4 wants one on every link and on the utilities too.
    expect(cssCode).toMatch(/\.navLink:focus-visible/);
    expect(cssCode).toMatch(/\.utility:focus-visible/);
  });
});

describe("the morph", () => {
  it("is tokened, not the reference's 600ms", () => {
    expect(cssCode, "the reference runs at 600ms").not.toMatch(/600ms/);
    expect(rule(".icon")).toMatch(/transition:\s*transform var\(--dur-state\)/);
    expect(rule(".line")).toMatch(/var\(--dur-state\)/);
    // A literal duration would not go to zero under reduced motion; the token
    // does, because globals.css zeroes it.
    expect(cssCode).not.toMatch(/transition:[^;]*\d+ms/);
  });

  it("is driven by React state, not by a shadow checkbox", () => {
    expect(cssCode, "the reference uses input:checked + svg").not.toMatch(/:checked/);
    expect(code).not.toMatch(/type="checkbox"/);
    expect(cssCode).toMatch(/\.hamburger\[data-open="true"\] \.icon/);
    expect(cssCode).toMatch(/\.hamburger\[data-open="true"\] \.lineTopBottom/);
    expect(code).toMatch(/data-open=\{isMenuOpen\}/);
  });

  it("keeps the reference's dash geometry, which is measured against its paths", () => {
    expect(rule(".lineTopBottom")).toMatch(/stroke-dasharray:\s*12 63/);
    const open = rule('.hamburger[data-open="true"] .lineTopBottom');
    expect(open).toMatch(/stroke-dasharray:\s*20 300/);
    expect(open).toMatch(/stroke-dashoffset:\s*-32\.42/);
  });
});

describe("the link mask exists, because the timeline needs it", () => {
  it("clips the entrance", () => {
    expect(rule(".menuListItem")).toMatch(/overflow:\s*hidden/);
    expect(rule(".menuBg")).toMatch(/overflow:\s*hidden/);
  });
});
