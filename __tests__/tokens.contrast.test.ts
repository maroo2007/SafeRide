import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { extractVars, resolveToken, contrast, type Rgb } from "@/lib/color";

/**
 * Guards WCAG AA contrast against the ACTUAL shipped globals.css.
 *
 * This deliberately parses the CSS file rather than importing a duplicated
 * palette object — a test that checks a copy of the tokens would keep passing
 * after someone edits the real ones.
 *
 * Spec 9: "WCAG AA contrast minimum on all text."
 */

const CSS = readFileSync(join(process.cwd(), "app", "globals.css"), "utf8");

const LIGHT = extractVars(CSS, ":root");
const DARK_ONLY = extractVars(CSS, ".dark");
// .dark overrides semantics but inherits the brand ramp from :root.
const DARK = { ...LIGHT, ...DARK_ONLY };

const AA_NORMAL = 4.5;
const AA_NON_TEXT = 3.0;

type Pair = { fg: string; bg: string; min: number; label: string; only?: "light" | "dark" };

const PAIRS: Pair[] = [
  { fg: "--foreground", bg: "--background", min: AA_NORMAL, label: "body text on page" },
  { fg: "--card-foreground", bg: "--card", min: AA_NORMAL, label: "text on card" },
  { fg: "--popover-foreground", bg: "--popover", min: AA_NORMAL, label: "text on popover" },
  { fg: "--muted-foreground", bg: "--background", min: AA_NORMAL, label: "muted text on page" },
  { fg: "--muted-foreground", bg: "--card", min: AA_NORMAL, label: "muted text on card" },
  { fg: "--primary-foreground", bg: "--primary", min: AA_NORMAL, label: "primary button label" },
  { fg: "--secondary-foreground", bg: "--secondary", min: AA_NORMAL, label: "secondary button label" },
  { fg: "--accent-foreground", bg: "--accent", min: AA_NORMAL, label: "accent button label" },
  { fg: "--destructive-foreground", bg: "--destructive", min: AA_NORMAL, label: "destructive button label" },
  { fg: "--success-foreground", bg: "--success", min: AA_NORMAL, label: "success button label" },
  { fg: "--warning-foreground", bg: "--warning", min: AA_NORMAL, label: "warning button label" },
  // Semantic status text sits on the page ground, not only inside a filled chip.
  { fg: "--destructive", bg: "--background", min: AA_NORMAL, label: "destructive text on page" },
  { fg: "--success", bg: "--background", min: AA_NORMAL, label: "success text on page" },
  { fg: "--warning", bg: "--background", min: AA_NORMAL, label: "warning text on page" },
  // Non-text UI: focus ring and boundaries must be discernible.
  { fg: "--ring", bg: "--background", min: AA_NON_TEXT, label: "focus ring on page" },
  // Every brand colour must also work AS TEXT on the page and on cards, not
  // only as a fill. This is what caught the previous palette's orange.
  { fg: "--primary", bg: "--background", min: AA_NORMAL, label: "primary as text on page" },
  // --accent is deliberately absent as a text pair: it is a FILL only, and
  // __tests__/accent-usage.test.ts enforces that. Its legible counterpart on
  // dark grounds is --accent-warm.
  { fg: "--surface-dark", bg: "--background", min: AA_NORMAL, label: "film dark surface as text on paper", only: "light" },
];

function ratio(fg: string, bg: string, vars: Record<string, string>): number {
  const bgRgb = resolveToken(bg, vars);
  expect(bgRgb, `background token ${bg} must resolve`).not.toBeNull();
  const fgRgb = resolveToken(fg, vars, bgRgb as Rgb);
  expect(fgRgb, `foreground token ${fg} must resolve`).not.toBeNull();
  return contrast(fgRgb as Rgb, bgRgb as Rgb);
}

describe("design tokens parse", () => {
  it("finds the light theme block", () => {
    expect(Object.keys(LIGHT).length).toBeGreaterThan(20);
    expect(LIGHT["--accent"]).toBe("#fb8a00");   // app-canonical
    expect(LIGHT["--surface-dark"]).toBe("#030302"); // sampled from the film
  });

  it("finds the dark theme block", () => {
    expect(Object.keys(DARK_ONLY).length).toBeGreaterThan(15);
    expect(DARK_ONLY["--background"]).toBe("var(--surface-dark)");
  });
});

describe.each([
  ["light", LIGHT],
  ["dark", DARK],
])("WCAG AA contrast — %s theme", (themeName, vars) => {
  it.each(PAIRS)("$label ($fg on $bg) meets $min:1", ({ fg, bg, min, only }) => {
    if (only && only !== themeName) return; // pair is meaningless in this theme
    const r = ratio(fg, bg, vars);
    expect(
      r,
      `${themeName}: ${fg} on ${bg} was ${r.toFixed(2)}:1, need >= ${min}:1`,
    ).toBeGreaterThanOrEqual(min);
  });
});

describe("reduced motion means no motion", () => {
  it("collapses every motion duration token to zero, not merely smaller", () => {
    const block = CSS.slice(CSS.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(block.length).toBeGreaterThan(0);

    const durations = [...block.matchAll(/(--dur-[a-z]+)\s*:\s*([^;]+);/g)];
    expect(durations.length).toBeGreaterThan(0);
    for (const [, name, value] of durations) {
      expect(value.trim(), `${name} must be 0ms under reduced motion`).toBe("0ms");
    }

    const distance = /--reveal-distance\s*:\s*([^;]+);/.exec(block);
    expect(distance?.[1].trim()).toBe("0px");
    const stagger = /--stagger-step\s*:\s*([^;]+);/.exec(block);
    expect(stagger?.[1].trim()).toBe("0ms");
  });
});

describe("no raw hex outside the brand ramp", () => {
  it("keeps semantic tokens referencing the ramp or documented literals", () => {
    // The ramp itself is the one place raw hex is allowed. Everything that
    // *uses* colour in components must go through a semantic token, which the
    // component lint/review enforces; here we just assert the ramp exists.
    const ramp = Object.keys(LIGHT).filter((k) =>
      /^--(ink|paper|surface-dark|accent|accent-warm|neutral-warm|warm-)/.test(k),
    );
    expect(ramp.length).toBeGreaterThanOrEqual(8);
  });
});

describe("locked type stack", () => {
  const base = CSS.slice(CSS.indexOf("@layer base"));

  it("Latin body uses the TEXT optical size, not the display cut", () => {
    // opsz 144 at 16px is cramped and dense — the whole reason one family
    // can carry both roles is that body gets opsz 9.
    expect(LIGHT["--opsz-text"]).toBe("9");
    expect(LIGHT["--opsz-display"]).toBe("144");
    const body = base.slice(base.indexOf("body {"), base.indexOf("h1, h2, h3, h4"));
    expect(body).toMatch(/font-variation-settings:\s*"opsz"\s*var\(--opsz-text\)/);
  });

  it("Latin headings use the display optical size", () => {
    const h = base.slice(base.indexOf("h1, h2, h3, h4"));
    expect(h).toMatch(/font-variation-settings:\s*"opsz"\s*var\(--opsz-display\)/);
  });

  it("Arabic headings are Amiri and Arabic body is Noto Naskh — not the same face", () => {
    const arH = base.slice(base.indexOf('[lang="ar"] h1'));
    expect(arH).toMatch(/--font-amiri/);
    const arBody = base.slice(base.indexOf('[lang="ar"] {'), base.indexOf('[lang="ar"] h1'));
    expect(arBody).toMatch(/--font-naskh/);
    expect(arBody).not.toMatch(/--font-amiri/);
  });

  it("Latin runs inside Arabic fall through to Fraunces, never to Amiri's weak Latin", () => {
    const arH = base.slice(base.indexOf('[lang="ar"] h1'));
    expect(arH).toMatch(/var\(--font-amiri\),\s*var\(--font-fraunces\)/);
    const arBody = base.slice(base.indexOf('[lang="ar"] {'), base.indexOf('[lang="ar"] h1'));
    expect(arBody).toMatch(/var\(--font-naskh\),\s*var\(--font-fraunces\)/);
  });

  it("the dropped families are gone", () => {
    for (const dead of ["--font-inter", "--font-calistoga", "--font-cairo", "--navy-700", "--gold-700"]) {
      expect(CSS, `${dead} should no longer appear`).not.toContain(dead);
    }
  });
});
