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

describe("the ambient shapes actually paint", () => {
  /*
   * .bgShape is opacity 0 / visibility hidden at rest, and .active restored
   * only the visibility. The container stayed at opacity 0, so nothing ever
   * painted — GSAP was faithfully animating the .shape-element children to
   * opacity 1 inside a parent that could not be seen.
   *
   * Every guard passed at the time: six shapes present, visibility visible,
   * children at opacity 1, all fills brand tones. It took diffing the panel
   * hovered against not-hovered (build/verify-phase3.js) to see it, and the
   * first version of THAT passed too, because the hovered link's own
   * background band was inside the diff.
   */
  it(".active restores opacity, not just visibility", () => {
    const active = rule(".bgShape.active");
    expect(active).toMatch(/visibility:\s*visible/);
    expect(active, "the container is opacity 0 at rest").toMatch(/opacity:\s*1/);
    // NO-OP HALF: the rest state has to exist, or "active turns it on" is
    // satisfied by a shape that was never off.
    const rest = rule(".bgShape");
    expect(rest).toMatch(/opacity:\s*0/);
    expect(rest).toMatch(/visibility:\s*hidden/);
  });
});

describe("the panel carries its own ground", () => {
  /*
   * The defect this guards: .menuContent had no background, so the only
   * opaque thing in the panel was the three sliding .backdropLayer elements.
   * The links start 0.35s in and the last layer lands at 0.815s, so for 465ms
   * the copy was painted over bare film — measured at 400ms with the layers
   * at x = 946 / 1052 / 1207, the panel's left edge at 880 and the first link
   * at 920.
   *
   * "The menu opened" was true throughout. build/diagnose-menu.js is the
   * guard that actually catches it, frame by frame in a browser; these two
   * catch the cause in the source, where vitest can see it.
   */
  it("declares an opaque background, so content is never over film", () => {
    const panel = rule(".menuContent");
    expect(panel).toMatch(/background:\s*var\(--surface-dark/);
    expect(panel, "a transparent panel is the bug").not.toMatch(/background:\s*(transparent|none)/);
    // NO-OP HALF: the layers must still exist, or "the panel is opaque" is
    // satisfied by deleting the sweep the panel is supposed to be a ground for.
    expect(cssCode).toMatch(/\.backdropFirst\s*\{/);
    expect(cssCode).toMatch(/\.backdropSecond\s*\{/);
  });

  it("slides in, so the ground arrives with the panel and not after it", () => {
    // A bare `set` puts the panel's rect in place instantly while its paint
    // arrives layer by layer. The panel has to be the thing that moves.
    const open = code.slice(code.indexOf("if (isMenuOpen) {"), code.indexOf("} else {"));
    expect(open).toMatch(/fromTo\(menu,\s*\{\s*xPercent:\s*101\s*\}/);
    expect(open, "setting the panel straight to 0 is what broke it").not.toMatch(/gsap\.set\(menu/);
    // Close is a slide already; open must match it or the two are asymmetric.
    const close = code.slice(code.indexOf("} else {"));
    expect(close).toMatch(/xPercent:\s*120/);
  });
});
