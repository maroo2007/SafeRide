import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname, relative } from "node:path";

/**
 * preventScroll is the default for every focus() call we ship.
 *
 * An `overflow: hidden` box is still programmatically scrollable, and
 * `.focus()` scrolls every ancestor to reveal its target. The navbar's menu
 * links begin their entrance translated 140% below their own 65px rows, so
 * focusing the first one made the browser scroll THAT ROW down 50px. The link
 * then sat 40.7px below its slot while the other five were fully hidden at
 * 90.7px, and was carried 13px ABOVE its resting line before the scroll
 * clamped back — which reads as "the first one is already settled" and, when
 * it snaps, as stutter.
 *
 * The tween was never wrong: all six travel 90.72px in ~485ms on a clean ~50ms
 * stagger. Measured by build/diagnose-links.js, which is the browser-side
 * guard. This is the source-side one, and it is deliberately CODEBASE-WIDE
 * rather than scoped to the navbar: any focusable inside a masked or
 * transformed container has the same problem, and the next one to appear
 * should not have to rediscover it.
 *
 * If a future call genuinely needs the browser to scroll — moving focus to
 * something off-screen — pass `{ preventScroll: false }` explicitly. That is
 * still a deliberate decision, and it still reads as one here.
 */

const ROOT = process.cwd();
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
    else if ([".ts", ".tsx"].includes(extname(p))) acc.push(p);
  }
  return acc;
}

/** Documentation names the forbidden pattern in order to forbid it. */
function stripComments(src: string): string {
  const BLOCK = new RegExp("/\\*[\\s\\S]*?\\*/", "g");
  const LINE = new RegExp("(^|[^:])//[^\\n]*", "gm");
  return src.replace(BLOCK, " ").replace(LINE, "$1 ");
}

const FILES = SCAN_DIRS.flatMap((d) => sourceFiles(join(ROOT, d)));

describe("focus() never scrolls (codebase-wide)", () => {
  it("scans a real set of files, so the rule is not vacuous", () => {
    expect(FILES.length).toBeGreaterThan(10);
  });

  it("every focus() call states its scroll behaviour", () => {
    const offenders: string[] = [];
    let total = 0;
    for (const f of FILES) {
      const src = stripComments(readFileSync(f, "utf8"));
      for (const m of src.matchAll(/\.focus\(([^)]*)\)/g)) {
        total++;
        if (!/preventScroll\s*:/.test(m[1])) {
          offenders.push(`${relative(ROOT, f)}: ${m[0]}`);
        }
      }
    }
    // NO-OP HALF. "No bare focus() calls" is trivially true of a codebase with
    // no focus management at all, and §2.4 requires some: focus into the panel,
    // focus through the trap, focus back to the toggle.
    expect(total, "focus management must exist to be guarded").toBeGreaterThanOrEqual(3);
    expect(offenders, "a bare focus() scrolls the container it lands in").toEqual([]);
  });

  it("nothing else in shipped source scrolls an ancestor behind our backs", () => {
    // scrollIntoView and autoFocus do the same thing focus() did, without the
    // option to opt out. Neither is used; this keeps it that way.
    const offenders: string[] = [];
    for (const f of FILES) {
      const src = stripComments(readFileSync(f, "utf8"));
      for (const re of [/\bscrollIntoView\s*\(/g, /\bautoFocus\b/g]) {
        for (const m of src.matchAll(re)) offenders.push(`${relative(ROOT, f)}: ${m[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
