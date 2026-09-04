import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import { extractVars, resolveToken, contrast, type Rgb } from "@/lib/color";

/**
 * Enforces THE --accent RULE.
 *
 * --accent (#fb8a00) is a FILL. Dark text on it is ~8:1, which is fine. But as
 * text or as a hairline on paper it is 2.36:1 — it fails, exactly the way the
 * previous palette's #f1840b failed at 2.47:1.
 *
 * A note in a doc did not stop that happening the first time. This does.
 *
 * For accent-coloured TEXT on a dark ground, use --accent-warm (16.77:1 on ink).
 */


/**
 * Strip block and line comments before scanning.
 *
 * Documentation legitimately NAMES the forbidden patterns in order to forbid
 * them. A rule that fires on its own explanation is a rule nobody keeps.
 */
function stripComments(src: string): string {
  const BLOCK = new RegExp("/\\*[\\s\\S]*?\\*/", "g");
  const LINE = new RegExp("(^|[^:])//[^\\n]*", "gm");
  return src.replace(BLOCK, " ").replace(LINE, "$1 ");
}

const ROOT = process.cwd();
const CSS = readFileSync(join(ROOT, "app", "globals.css"), "utf8");
const LIGHT = extractVars(CSS, ":root");

/** Source we actually ship. The /type specimen pages are dev-only. */
const SCAN_DIRS = ["app", "components", "lib"];
const SKIP_SEGMENTS = ["node_modules", ".next", join("app", "type")];

function sourceFiles(dir: string, acc: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return acc;
  }
  for (const e of entries) {
    const p = join(dir, e);
    if (SKIP_SEGMENTS.some((s) => p.includes(s))) continue;
    if (statSync(p).isDirectory()) sourceFiles(p, acc);
    else if ([".ts", ".tsx", ".css"].includes(extname(p))) acc.push(p);
  }
  return acc;
}

/** Ways --accent could end up painting a glyph or a 1px line. */
const FORBIDDEN: { re: RegExp; what: string }[] = [
  { re: /\btext-accent\b(?!-)/g, what: "text-accent (accent as text)" },
  { re: /\bborder-accent\b(?!-)/g, what: "border-accent (accent as a boundary)" },
  { re: /\boutline-accent\b(?!-)/g, what: "outline-accent" },
  { re: /\bdecoration-accent\b(?!-)/g, what: "decoration-accent (underline)" },
  { re: /\bdivide-accent\b(?!-)/g, what: "divide-accent" },
  { re: /\bstroke-accent\b(?!-)/g, what: "stroke-accent (SVG hairline)" },
  { re: /\bring-accent\b(?!-)/g, what: "ring-accent" },
  // inline styles / raw CSS
  { re: /(?<!-)\bcolor\s*:\s*var\(--accent\)/g, what: "color: var(--accent)" },
  { re: /\bcolor\s*:\s*["']?#fb8a00/gi, what: "color: #fb8a00 (raw hex as text)" },
  { re: /border[A-Za-z]*\s*:\s*[^;,}]*var\(--accent\)/g, what: "border in var(--accent)" },
  { re: /border[A-Za-z-]*\s*:\s*[^;,}]*#fb8a00/gi, what: "border in raw #fb8a00" },
];

describe("the --accent rule is enforced, not documented", () => {
  const files = SCAN_DIRS.flatMap((d) => sourceFiles(join(ROOT, d)));

  it("scans a non-trivial number of shipped source files", () => {
    // A pattern-based guard is worthless if it silently scans nothing.
    expect(files.length).toBeGreaterThan(3);
  });

  it("never paints --accent as text, a border, an outline or a hairline", () => {
    const violations: string[] = [];
    for (const f of files) {
      // Comments must be stripped before scanning. Documentation legitimately
      // NAMES the forbidden patterns in order to forbid them, and a rule that
      // fires on its own explanation is a rule nobody keeps.
      const body = stripComments(readFileSync(f, "utf8"));
      for (const { re, what } of FORBIDDEN) {
        re.lastIndex = 0;
        if (re.test(body)) {
          violations.push(`${f.replace(ROOT, "").replace(/\\/g, "/")} — ${what}`);
        }
      }
    }
    expect(
      violations,
      `--accent (#fb8a00) is 2.36:1 on paper and must never be text or a boundary.\n` +
        `Use --accent-warm on dark grounds, or --foreground on light.\n` +
        violations.join("\n"),
    ).toEqual([]);
  });
});

describe("every accent FILL carries a compliant boundary", () => {
  const files = SCAN_DIRS.flatMap((d) => sourceFiles(join(ROOT, d)));

  it("never uses a bare accent fill — it must go through .accent-fill", () => {
    // #fb8a00 against paper is 2.27:1, below WCAG 1.4.11's 3:1 for a UI
    // boundary. That is true of ANY accent-filled surface, not just the hero
    // button: pricing CTAs, accent cards, badges. .accent-fill bundles the
    // fill with --accent-edge, and neutralises the edge on dark grounds.
    const bare: string[] = [];
    for (const f of files) {
      // globals.css is where .accent-fill is DEFINED, so it necessarily sets
      // background-color: var(--accent). Excluding the definition site is not
      // a loophole: the test below asserts the utility's actual shape, so the
      // one legitimate use is still guarded, just by the right assertion.
      if (f.endsWith("globals.css")) continue;
      const body = stripComments(readFileSync(f, "utf8"));
      const patterns = [
        /\bbg-accent\b(?!-)/g,
        /background(?:-color|Color)?\s*:\s*var\(--accent\)/g,
        /background(?:-color|Color)?\s*:\s*["']?#fb8a00/gi,
      ];
      for (const re of patterns) {
        re.lastIndex = 0;
        if (re.test(body)) {
          bare.push(f.replace(ROOT, "").replace(/\\/g, "/"));
          break;
        }
      }
    }
    expect(
      bare,
      "An accent fill on paper is a 2.27:1 boundary and fails WCAG 1.4.11.\n" +
        "Use the .accent-fill utility, which carries --accent-edge.\n" +
        bare.join("\n"),
    ).toEqual([]);
  });

  it(".accent-fill actually exists and binds the edge token", () => {
    const util = CSS.slice(CSS.indexOf(".accent-fill"));
    expect(util).toMatch(/background-color:\s*var\(--accent\)/);
    expect(util).toMatch(/border:\s*2px solid var\(--accent-edge\)/);
  });
});

describe("the rule exists because the numbers demand it", () => {
  const ratio = (fg: string, bg: string) => {
    const b = resolveToken(bg, LIGHT) as Rgb;
    const f = resolveToken(fg, LIGHT, b) as Rgb;
    return contrast(f, b);
  };

  it("--accent really does fail as text on paper", () => {
    // If this ever passes, the token moved and the rule may be re-examined.
    expect(ratio("--accent", "--background")).toBeLessThan(4.5);
  });

  it("--accent works as a FILL with dark text on it", () => {
    expect(ratio("--accent-foreground", "--accent")).toBeGreaterThanOrEqual(4.5);
  });

  it("--accent-warm is the legible accent on the dark ground", () => {
    expect(ratio("--accent-warm", "--surface-dark")).toBeGreaterThanOrEqual(4.5);
  });

  it("--accent-warm must NOT be used on paper — it is the dark-ground accent", () => {
    expect(ratio("--accent-warm", "--background")).toBeLessThan(4.5);
  });
});

describe("--accent-edge is a compliant boundary on paper and absent on dark", () => {
  const DARK = { ...LIGHT, ...extractVars(CSS, ".dark") };
  const ratio = (fg: string, bg: string, vars: Record<string, string>) => {
    const b = resolveToken(bg, vars) as Rgb;
    const f = resolveToken(fg, vars, b) as Rgb;
    return contrast(f, b);
  };

  it("clears WCAG 1.4.11's 3:1 against paper", () => {
    expect(ratio("--accent-edge", "--background", LIGHT)).toBeGreaterThanOrEqual(3);
  });

  it("is transparent on dark, where the fill is already separated", () => {
    // A dark ring around a bright fill on near-black reads as grime, and the
    // fill is already 8.58:1 against the ground, so the edge earns nothing.
    expect(DARK["--accent-edge"]).toBe("transparent");
  });

  it("the accent fill on the DARK ground genuinely needs no boundary", () => {
    expect(ratio("--accent", "--background", DARK)).toBeGreaterThanOrEqual(3);
  });

  it("the accent fill on PAPER genuinely does need one", () => {
    expect(ratio("--accent", "--background", LIGHT)).toBeLessThan(3);
  });
});
