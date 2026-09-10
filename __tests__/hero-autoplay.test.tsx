import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";
import { ScrubVideoHero } from "@/components/hero/scrub-video-hero";

/**
 * Guards for the autoplay hero, replacing __tests__/video-scrub.test.ts.
 *
 * That file had 49 tests and went with the feature it guarded. Two of its
 * assertions were about the hero rather than about scrubbing and are carried
 * over here rather than lost: that the section carries `dark` (load-bearing —
 * it is what makes --accent-edge transparent so the CTA does not wear a dark
 * ring over footage), and that the CTAs are reachable from first paint.
 *
 * jsdom cannot play video, so the timing behaviour — pause only at 100% out of
 * view, resume rather than restart, hold on the last frame, captions following
 * currentTime — is guarded in build/verify-hero.js against a real engine.
 * What is guarded HERE is structure and absence.
 */

vi.mock("@/components/hero/variable-proximity", () => ({
  VariableProximity: ({ text }: { text: string }) => <span>{text}</span>,
}));

/*
 * jsdom has no IntersectionObserver, and the hero uses one to pause the film
 * when the section leaves the viewport. Without a stub every render here
 * throws, which would have failed five tests for a reason unrelated to any of
 * them. The stub records nothing — the pause/resume behaviour it stands in for
 * is guarded against a real engine in build/verify-hero.js.
 */
class StubIO {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() { return []; }
  root = null;
  rootMargin = "";
  thresholds = [];
}
(globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = StubIO;

afterEach(cleanup);

const SRC_DIRS = ["app", "components", "lib"];

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) sourceFiles(p, out);
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
}

describe("the scrub is gone, not dormant", () => {
  /*
   * "Grep afterwards and confirm zero references" as a standing guard rather
   * than a one-off. A dormant module that nothing imports is invisible to
   * every behavioural test in the suite — this is the only kind of assertion
   * that catches it coming back.
   */
  const DEAD = [
    "video-scrub", "RUNWAY_VH", "SCRUB_RATE", "clampToBuffer", "bufferedEdge",
    "easeEdge", "pickMode", "upgradeOnly", "NO_SCRUB_RATIO", "FULL_RATIO",
    "SAFETY_MARGIN", "HeroMode", "filmSecondsPer100vh", "spanVh",
  ];

  it("no source file references the deleted scrub machinery", () => {
    const files = SRC_DIRS.flatMap((d) => sourceFiles(d));
    expect(files.length).toBeGreaterThan(20);
    const hits: string[] = [];
    for (const f of files) {
      /*
       * COMMENTS STRIPPED before matching. constants.ts names the SCRUB_RATE
       * mistake as the precedent for deriving the crossing window from
       * FADE_KNEE, and that history is the reason the derivation exists — an
       * absence check that erases the lesson to satisfy itself is worse than
       * no check. What must not survive is a live reference.
       */
      const text = fs.readFileSync(f, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|[^:])\/\/.*$/gm, "$1");
      for (const name of DEAD) {
        /* TOUR_RUNWAY_VH must not match RUNWAY_VH: the phone tour has its own
           runway and it is not going anywhere. Word boundary on the left. */
        const re = new RegExp(`(^|[^A-Za-z0-9_])${name}\\b`);
        if (re.test(text)) hits.push(`${f}: ${name}`);
      }
    }
    expect(hits).toEqual([]);
  });

  it("the scrub module and its test are actually deleted", () => {
    expect(fs.existsSync("lib/video-scrub.ts")).toBe(false);
    expect(fs.existsSync("__tests__/video-scrub.test.ts")).toBe(false);
  });

  it("the all-intra and mobile-only encodes are gone from public/", () => {
    expect(fs.existsSync("public/video/saferide-hero-scrub-safari.mp4")).toBe(false);
    expect(fs.existsSync("public/video/saferide-hero-mobile.mp4")).toBe(false);
  });
});

describe("the hero renders a film that plays itself", () => {
  it("keeps the dark scope on the section", () => {
    /*
     * Carried over from the deleted suite. `dark` is not cosmetic: it switches
     * --accent-edge to transparent and --accent-lift to the dark-ground
     * shadow. Without it those tokens are defined for this surface and never
     * applied on it, which is how the CTA wore a dark ring over footage.
     */
    const { container } = render(<ScrubVideoHero />);
    const section = container.querySelector("section");
    expect(section?.className).toContain("dark");
    expect(section?.className).toContain("bg-surface-dark");
  });

  it("is one viewport tall, with no runway", () => {
    const { container } = render(<ScrubVideoHero />);
    const section = container.querySelector("section");
    expect(section?.className).toContain("h-svh");
    /* The runway was an inline vh height. Nothing sets one now. */
    expect(section?.getAttribute("style") ?? "").not.toMatch(/height/);
  });

  it("the film does not loop — it holds on the last frame", () => {
    const { container } = render(<ScrubVideoHero />);
    const film = container.querySelector('video[src], video source[src*="saferide-hero."]')
      ?.closest("video") as HTMLVideoElement | null;
    expect(film).not.toBeNull();
    expect(film!.hasAttribute("loop")).toBe(false);
    expect(film!.muted || film!.hasAttribute("muted")).toBe(true);
  });

  /*
   * THE COPY IS BACK, and it does not move.
   *
   * The eyebrow, the headline and both CTAs are on from the first frame and
   * stay there. What this guards is the pair of defects that shape had
   * before: the h1 must exist and be the real headline, because the page
   * needs exactly one and the section is aria-labelledby it; and nothing may
   * be focusable while invisible, which is what the old scroll-timed fade
   * could produce at the end of its travel.
   */
  it("shows its copy and both CTAs, with nothing focusable-but-hidden", () => {
    const { container } = render(<ScrubVideoHero />);
    const h1 = container.querySelector("h1");
    expect(h1, "the page needs exactly one h1 and this is it").not.toBeNull();
    expect(h1?.textContent).toContain("safe ride home");
    expect(h1?.className, "no longer visually hidden").not.toContain("sr-only");
    expect(container.querySelectorAll("a").length).toBeGreaterThanOrEqual(2);
    /* The old hero could reach opacity 0 while still focusable. There is no
       longer a state that does that, so nothing here may be inert. */
    for (const el of container.querySelectorAll("[inert]")) {
      expect(el).toBeNull();
    }
  });

  it("offers no play control until autoplay is actually refused", () => {
    const { container } = render(<ScrubVideoHero />);
    expect(container.querySelector("button")).toBeNull();
  });
});
