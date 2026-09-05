import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const src = readFileSync(join(process.cwd(), "components", "hero", "variable-proximity.tsx"), "utf8");
const layout = readFileSync(join(process.cwd(), "app", "layout.tsx"), "utf8");
const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8"));
/**
 * Comments legitimately NAME the things that must not appear - motion.span,
 * SOFT, WONK, inline-block, getBoundingClientRect - because they explain why
 * each was left out. Scanning the raw file therefore matches the explanation
 * and fails on a correct component. Only code is scanned.
 */
const code = src
  .replace(/[/][*][^]*?[*][/]/g, "")
  .replace(/^\s*[/][/].*$/gm, "");

describe("VariableProximity", () => {
  it("carries none of the reference's dead weight", () => {
    // The reference imports framer-motion and renders motion.span while
    // passing it no animation props whatsoever.
    expect(code).not.toMatch(/from ["']motion\/react["']/);
    expect(code).not.toMatch(/motion\./);
    expect({ ...pkg.dependencies, ...pkg.devDependencies }).not.toHaveProperty("motion");
    // And it @imports Roboto Flex, which we do not ship.
    expect(code).not.toMatch(/Roboto/i);
    expect(code).not.toMatch(/fonts\.googleapis\.com/);
  });

  it("holds opsz and only animates wght", () => {
    // opsz moves Fraunces' advance width by 22% across its range (measured:
    // 589.92px at 144 against 718.56px at 9 for the headline string), so
    // animating it would reflow the headline under the cursor. wght moves it
    // 1.4% from 800 to 900, which is why wght is the axis that can move.
    expect(src).toMatch(/const OPSZ = 144;/);
    expect(src).toMatch(/"opsz" \$\{OPSZ\}/);
    // The interpolation must touch the weight and nothing else.
    expect(src).toMatch(/REST_WGHT \+ \(NEAR_WGHT - REST_WGHT\)/);
    expect(code).not.toMatch(/opsz.*\+.*\*.*t\b/);
  });

  it("rests at the headline's existing weight, so the static state is unchanged", () => {
    // globals.css sets h1 to font-weight 800. If the rest weight disagreed,
    // mounting this component would silently restyle the headline.
    expect(src).toMatch(/const REST_WGHT = 800;/);
    const css = readFileSync(join(process.cwd(), "app", "globals.css"), "utf8");
    const h1 = css.slice(css.indexOf("  h1 {"), css.indexOf("}", css.indexOf("  h1 {")));
    expect(h1).toMatch(/font-weight:\s*800/);
  });

  it("only requests axes the font actually ships", () => {
    // SOFT and WONK are not in the build, and the width probe finds no
    // response on either. Referencing them would be a silent no-op.
    expect(layout).toMatch(/axes:\s*\["opsz"\]/);
    expect(code).not.toMatch(/SOFT|WONK/);
  });

  it("attaches nothing at all under reduced motion", () => {
    // Verified in-browser with the media feature emulated and
    // addEventListener wrapped before app code runs: zero listeners from this
    // component. The media query is re-read INSIDE the effect because
    // useSyncExternalStore returns the server snapshot on the first commit,
    // and trusting it attached four listeners for a tick.
    const effect = code.slice(code.indexOf("useEffect(() => {"));
    const guardIdx = effect.indexOf("if (reduced) return;");
    const liveIdx = effect.indexOf("prefers-reduced-motion");
    const listenIdx = effect.indexOf("addEventListener");
    expect(guardIdx).toBeGreaterThan(-1);
    expect(liveIdx, "the effect must re-read the media query").toBeGreaterThan(-1);
    expect(guardIdx, "guard before any listener").toBeLessThan(listenIdx);
    expect(liveIdx, "live re-read before any listener").toBeLessThan(listenIdx);
    // And the render path returns plain text, not the effect at zero.
    expect(src).toMatch(/if \(reduced\) \{\s*\n\s*return <span[^>]*>\{text\}<\/span>;/);
  });

  it("keeps the accessible name whole and copies it once", () => {
    // Per-letter spans are aria-hidden; one sr-only span carries the sentence.
    // That span must NOT be selectable, or selecting the headline copies the
    // sentence twice — which is what the reference does.
    expect(src).toMatch(/className="sr-only"[^>]*userSelect: "none"/);
    expect(src).toMatch(/aria-hidden="true"/);
  });

  it("does not use inline-block, which swallowed the spaces", () => {
    // font-variation-settings needs no block formatting. inline-block was the
    // reference's leftover from transform animation, and it collapsed every
    // inter-word space: selecting the headline copied "Becauseeverychild...".
    expect(code).not.toMatch(/inline-block/);
    expect(code).toMatch(/whiteSpace: "nowrap"/);
  });

  it("caches letter centres instead of measuring every frame", () => {
    // The reference calls getBoundingClientRect on every letter every frame.
    // Measured: 0.126ms per frame for the rects alone at 38 letters, against
    // 0.029ms for this component's entire loop.
    expect(src).toMatch(/dirtyRef/);
    const frame = code.slice(code.indexOf("const frame = "), code.indexOf("window.addEventListener"));
    expect(frame).not.toMatch(/getBoundingClientRect/);
  });
});
