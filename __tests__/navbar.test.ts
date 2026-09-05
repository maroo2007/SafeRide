import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const tsx = readFileSync(join(process.cwd(), "components", "ui", "sterling-gate-kinetic-navigation.tsx"), "utf8");
const css = readFileSync(join(process.cwd(), "components", "ui", "sterling-gate-kinetic-navigation.module.css"), "utf8");
const code = tsx.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const cssCode = css.replace(/\/\*[\s\S]*?\*\//g, "");

describe("navbar port (spec 2.2)", () => {
  it("registers GSAP through registerGsap only", () => {
    // The upstream component calls gsap.registerPlugin(CustomEase) at module
    // scope. Spec 12 requires exactly one registration and a second is silent.
    // NO-OP CHECK: a component that imported nothing at all would also pass
    // the negative half, so the positive half is asserted too.
    expect(code).not.toMatch(/registerPlugin/);
    expect(code).toMatch(/registerGsap\(\)/);
    expect(code).toMatch(/from "@\/lib\/gsap"/);
  });

  it("carries six links with matching shapes, not the shipped five", () => {
    const hrefs = [...code.matchAll(/href: "(#[a-z]+)"/g)].map((m) => m[1]);
    expect(hrefs).toEqual(["#features", "#ai", "#coverage", "#pricing", "#faq", "#contact"]);
    // Every link needs a shape to hover, and every shape needs a link.
    const shapes = [...code.matchAll(/data-bg-shape="(\d)"/g)].map((m) => +m[1]);
    expect(shapes.sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("uses no indigo, violet or pink, and none of the component's :root block", () => {
    for (const dead of ["99,102,241", "139,92,246", "236,72,153", "#6366f1"]) {
      expect(code, `shipped placeholder colour ${dead}`).not.toContain(dead);
      expect(cssCode, `shipped placeholder colour ${dead}`).not.toContain(dead);
    }
    expect(cssCode).not.toMatch(/--color-primary/);
    // POSITIVE HALF. Without it an empty component passes: "contains no
    // indigo" is trivially true of a file containing nothing.
    expect(code, "brand accent must actually be used").toContain("rgba(251,138,0,");
    expect(code, "film edge tone must actually be used").toContain("rgba(185,85,26,");
  });

  it("has no demo artifacts left", () => {
    expect(code).not.toMatch(/click me/i);
    // role="button" on a <button> is redundant.
    expect(code).not.toMatch(/role="button"/);
    // POSITIVE HALF, same reason: the toggle has to exist to have been fixed.
    expect(code).toMatch(/aria-expanded=\{isMenuOpen\}/);
    expect(code).toMatch(/aria-controls="site-menu"/);
    expect(code).toMatch(/Open menu/);
  });

  it("the logo anchor is not empty and points at #top", () => {
    expect(code).toMatch(/href="#top"/);
    expect(code).toMatch(/saferide-logo\.png/);
    // The asset is square; declaring a 5:1 box gave next/image the wrong
    // intrinsic aspect.
    expect(code).toMatch(/width=\{159\} height=\{159\}/);
  });

  it("the header surface carries the measured tint and is unprefixed", () => {
    // 0.55 is the measured floor across all 209 frames; 0.60 ships.
    expect(cssCode).toMatch(/background:\s*rgba\(3,\s*3,\s*2,\s*0\.6\)/);
    expect(cssCode).toMatch(/backdrop-filter:\s*blur/);
    // Gecko has no -webkit- form; relying on it would silently drop the blur.
    expect(cssCode).not.toMatch(/-webkit-backdrop-filter/);
  });

  it("the header outranks the overlay, so Close stays reachable", () => {
    // At z-index 40 the 560px panel covered the Menu/Close button entirely and
    // Escape was the only way out. Photographed before the fix.
    const hdr = cssCode.slice(cssCode.indexOf(".headerWrapper {"), cssCode.indexOf("}", cssCode.indexOf(".headerWrapper {")));
    const ov = cssCode.slice(cssCode.indexOf(".overlayWrapper {"), cssCode.indexOf("}", cssCode.indexOf(".overlayWrapper {")));
    const z = (s: string) => +(/z-index:\s*(\d+)/.exec(s)?.[1] ?? "0");
    expect(z(hdr), "header z-index").toBeGreaterThan(z(ov));
    expect(z(ov), "overlay must still outrank the hero").toBeGreaterThan(0);
  });

  it("the link mask exists, because the timeline needs it", () => {
    // yPercent 140 + rotate 10 both put the link outside its slot; without a
    // clip the entrance is visible as links flying up the page.
    const item = cssCode.slice(cssCode.indexOf(".menuListItem {"), cssCode.indexOf("}", cssCode.indexOf(".menuListItem {")));
    expect(item).toMatch(/overflow:\s*hidden/);
    const btn = cssCode.slice(cssCode.indexOf(".buttonText {"), cssCode.indexOf("}", cssCode.indexOf(".buttonText {")));
    expect(btn).toMatch(/overflow:\s*hidden/);
  });
});
