import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  clampToBuffer, easeEdge, bufferedEdge, pickMode, upgradeOnly,
  VIDEO_DURATION, SAFETY_MARGIN, KNEE, SCRUB_RATE, FULL_RATIO,
  RUNWAY_VH, spanVh, filmSecondsPer100vh,
} from "@/lib/video-scrub";
import {
  CAPTIONS, CAPTION_SCRIM, HERO, HERO_SCRIM, captionOpacity, heroCopyOpacity,
  heroScrimOpacity,
} from "@/lib/hero-captions";

/**
 * CLAMPED is the experience, not the fallback. At ~110s time-to-fully-buffered
 * on Regular 4G and a scrub that advances 7.5x real-time, a Cairo mobile
 * visitor spends the whole visit here.
 *
 * The bar: someone in CLAMPED for the entire visit must never learn that
 * anything did not finish.
 */

const ranges = (pairs: [number, number][]) => ({
  length: pairs.length,
  start: (i: number) => pairs[i][0],
  end: (i: number) => pairs[i][1],
});

describe("buffer edge", () => {
  it("uses only ranges reachable from the start — a scrub always seeks from 0", () => {
    // A range from 30s is useless: seeking to 5s would land in nothing.
    expect(bufferedEdge(ranges([[30, 45]]))).toBe(0);
    expect(bufferedEdge(ranges([[0, 12], [30, 45]]))).toBe(12);
  });

  it("is zero when nothing is buffered", () => {
    expect(bufferedEdge(ranges([]))).toBe(0);
    expect(bufferedEdge(null)).toBe(0);
  });
});

describe("1 · the buffer-edge hold reads as intentional", () => {
  const edge = 20;

  it("follows scroll exactly while well inside the buffer", () => {
    expect(clampToBuffer(5, edge, VIDEO_DURATION)).toBeCloseTo(5, 5);
    expect(clampToBuffer(10, edge, VIDEO_DURATION)).toBeCloseTo(10, 5);
  });

  it("never seeks past the safety margin, however far the user scrolls", () => {
    const limit = edge - SAFETY_MARGIN;
    for (const target of [20, 30, 52, 500]) {
      expect(clampToBuffer(target, edge, VIDEO_DURATION)).toBeLessThanOrEqual(limit + 1e-9);
    }
  });

  it("DECELERATES into the edge rather than snapping", () => {
    // Equal steps of scroll must produce shrinking steps of playhead as the
    // edge approaches. A constant step size right up to a hard stop is exactly
    // what "snapped" looks like.
    const kneeStart = edge - SAFETY_MARGIN - KNEE;
    const step = 0.5;
    const deltas: number[] = [];
    for (let i = 0; i < 8; i++) {
      const a = clampToBuffer(kneeStart + i * step, edge, VIDEO_DURATION);
      const b = clampToBuffer(kneeStart + (i + 1) * step, edge, VIDEO_DURATION);
      deltas.push(b - a);
    }
    // STRICTLY decreasing. A hard clamp yields [0.5, 0.5, 0.5, 0, 0] — which is
    // non-increasing and ends small, so "<=" would pass it. Snapping is exactly
    // what this test exists to reject, so the comparison must be strict.
    for (let i = 1; i < deltas.length; i++) {
      expect(deltas[i], `step ${i} did not decelerate`).toBeLessThan(deltas[i - 1]);
    }
    // Settles, but is still creeping rather than dead-stopped: a hard clamp
    // reaches exactly 0 the moment it hits the limit.
    expect(deltas[deltas.length - 1]).toBeLessThan(deltas[0] * 0.35);
    expect(deltas[deltas.length - 1]).toBeGreaterThan(0);
  });

  it("is continuous — no jump discontinuity anywhere across the range", () => {
    let prev = clampToBuffer(0, edge, VIDEO_DURATION);
    for (let t = 0.01; t <= 40; t += 0.01) {
      const cur = clampToBuffer(t, edge, VIDEO_DURATION);
      expect(Math.abs(cur - prev)).toBeLessThan(0.05);
      prev = cur;
    }
  });

  it("holds at 0 when nothing is buffered rather than seeking into nothing", () => {
    expect(clampToBuffer(10, 0, VIDEO_DURATION)).toBe(0);
    expect(clampToBuffer(10, 0.2, VIDEO_DURATION)).toBe(0);
  });
});

describe("4 · the unlock as buffering advances is invisible", () => {
  it("advances smoothly when the edge jumps by a whole chunk", () => {
    // Buffering lands in chunks. Feeding the step straight in would lurch.
    let eased = 10;
    const jumped = 25;
    // The starting value MUST be in the series. Without it the very first
    // step — the one that lurches if easing is removed — is never measured.
    const frames: number[] = [eased];
    for (let i = 0; i < 60; i++) {
      eased = easeEdge(eased, jumped, 16);
      frames.push(eased);
    }
    for (let i = 1; i < frames.length; i++) {
      expect(frames[i] - frames[i - 1]).toBeLessThan(1.0); // no lurch
      expect(frames[i]).toBeGreaterThanOrEqual(frames[i - 1]); // never backwards
    }
    expect(frames[frames.length - 1]).toBeGreaterThan(20); // and it does get there
  });

  it("never retreats when a buffered range is evicted", () => {
    // Eviction must not drag the playhead backwards mid-scroll.
    let eased = 30;
    eased = easeEdge(eased, 12, 16);
    expect(eased).toBe(30);
  });

  it("playhead moves forward, never backward, as the edge advances", () => {
    const target = 30;
    let last = -1;
    for (let edge = 1; edge <= 40; edge += 0.25) {
      const t = clampToBuffer(target, edge, VIDEO_DURATION);
      expect(t).toBeGreaterThanOrEqual(last - 1e-9);
      last = t;
    }
  });
});

describe("mode selection", () => {
  const base = {
    fileBytesPerSecond: 1_073_741, // ~53.6 MB over 52.29s
    fullyBuffered: false,
    saveData: false,
    bufferedFraction: 0.5,
    elapsedMs: 2000,
  };

  it("saveData forces no-scrub regardless of measured speed", () => {
    expect(pickMode({ ...base, saveData: true, sample: { bytes: 50_000_000, ms: 1000 } })).toBe("no-scrub");
  });

  it("a fully buffered file is FULL", () => {
    expect(pickMode({ ...base, fullyBuffered: true, sample: null })).toBe("full");
  });

  it("Regular 4G lands in CLAMPED, which is the point of the mode", () => {
    // 500 KB/s against a file that needs ~1.05 MB/s of real-time video.
    expect(pickMode({ ...base, sample: { bytes: 500 * 1024, ms: 1000 } })).toBe("clamped");
  });

  it("a genuinely fast connection reaches FULL", () => {
    const bytes = base.fileBytesPerSecond * (SCRUB_RATE + 2);
    expect(pickMode({ ...base, sample: { bytes, ms: 1000 } })).toBe("full");
  });

  it("Fast 3G is no-scrub — 0.19x real-time cannot carry a scrub", () => {
    expect(pickMode({ ...base, sample: { bytes: 200 * 1024, ms: 1000 } })).toBe("no-scrub");
  });

  it("the 3G/4G split is the threshold's whole job", () => {
    const g3 = pickMode({ ...base, sample: { bytes: 200 * 1024, ms: 1000 } });
    const g4 = pickMode({ ...base, sample: { bytes: 512 * 1024, ms: 1000 } });
    expect([g3, g4]).toEqual(["no-scrub", "clamped"]);
  });

  it("nothing to show for it after 10s is its own answer", () => {
    expect(pickMode({ ...base, sample: null, elapsedMs: 11_000, bufferedFraction: 0.1 })).toBe("no-scrub");
  });

  it("mode only ever upgrades — a hero must not degrade under the cursor", () => {
    expect(upgradeOnly("clamped", "no-scrub")).toBe("clamped");
    expect(upgradeOnly("full", "clamped")).toBe("full");
    expect(upgradeOnly("no-scrub", "clamped")).toBe("clamped");
    expect(upgradeOnly("clamped", "full")).toBe("full");
  });
});

describe("1b · the scroll runway", () => {
  it("is 1200vh, and the scrub rate is DERIVED from it", () => {
    expect(RUNWAY_VH).toBe(1200);
    // One viewport is the sticky frame, so 1100vh actually scrolls.
    expect(spanVh(RUNWAY_VH)).toBe(1100);
    // 7.5 was calibrated at 600vh (500vh of span). Doubling the runway must
    // scale it, or pickMode demands throughput the scrub no longer needs.
    expect(SCRUB_RATE).toBeCloseTo(7.5 * (500 / 1100), 4);
    expect(SCRUB_RATE).toBeCloseTo(3.409, 3);
    expect(FULL_RATIO).toBeCloseTo(3.909, 3);
  });

  it("delivers 4.75 seconds of film per 100vh", () => {
    expect(filmSecondsPer100vh(1200)).toBeCloseTo(4.754, 3);
    // Half the previous rate: the same film over twice the scrolling.
    expect(filmSecondsPer100vh(600)).toBeCloseTo(10.458, 3);
    expect(filmSecondsPer100vh(600) / filmSecondsPer100vh(1200)).toBeCloseTo(2.2, 5);
  });

  it("the encode is untouched by the runway change", () => {
    // The runway maps scroll to PROGRESS; progress maps to film time. Neither
    // touches the file, so frame timing cannot move.
    expect(VIDEO_DURATION).toBeCloseTo(2510 / 48, 10);
    expect(VIDEO_DURATION).toBeCloseTo(52.2917, 4);
  });

  it("every caption still lands on the same frame of film", () => {
    // Captions are scheduled in progress, and t = progress x duration. A
    // longer runway changes how far you scroll to reach a caption, never
    // which frame it lands on.
    const filmTimes = CAPTIONS.map((c) => [c.from * VIDEO_DURATION, c.to * VIDEO_DURATION]);
    expect(filmTimes[0][0]).toBeCloseTo(11.1, 6);
    expect(filmTimes[0][1]).toBeCloseTo(17.0, 6);
    expect(filmTimes[1][0]).toBeCloseTo(22.0, 6);
    expect(filmTimes[1][1]).toBeCloseTo(32.6, 6);
    expect(filmTimes[2][0]).toBeCloseTo(34.0, 6);
    expect(filmTimes[2][1]).toBeCloseTo(43.0, 6);
  });

  it("the hero copy fade now spans more than twice the scroll distance", () => {
    // The fade window is unchanged in PROGRESS (spec 1.6, 0.00-0.12); what
    // changes is how long a reader spends inside it. At a 900px viewport that
    // is 1188px of scrolling against 540px before.
    const px = (runway: number, h = 900) => (spanVh(runway) / 100) * h * HERO.fadeOutTo;
    expect(px(600)).toBeCloseTo(540, 6);
    expect(px(1200)).toBeCloseTo(1188, 6);
  });
});

describe("2 · captions run on SCROLL progress, never on currentTime", () => {
  it("the caption module never reads currentTime", () => {
    // The whole point: in CLAMPED the video sits at the edge while the page
    // keeps moving. Captions must stay on schedule regardless.
    const src = readFileSync(join(process.cwd(), "lib", "hero-captions.ts"), "utf8");
    expect(src).not.toMatch(/currentTime/);
  });

  it("captions are scheduled in progress space, 0..1, in order, no overlap", () => {
    for (const c of CAPTIONS) {
      expect(c.from).toBeGreaterThanOrEqual(0);
      expect(c.to).toBeLessThanOrEqual(1);
      expect(c.to).toBeGreaterThan(c.from);
    }
    for (let i = 1; i < CAPTIONS.length; i++) {
      expect(CAPTIONS[i].from).toBeGreaterThan(CAPTIONS[i - 1].to);
    }
  });

  it("a caption at the same scroll position shows identically no matter where the video sits", () => {
    const c = CAPTIONS[1];
    const mid = (c.from + c.to) / 2;
    // The function takes progress only — there is no video input to differ on.
    expect(captionOpacity(c, mid)).toBe(1);
    expect(captionOpacity(c, mid)).toBe(captionOpacity(c, mid));
  });

  it("caption 3 runs from the spec's 34.0s", () => {
    // It was shifted to 35.0s to dodge the white-out tail for unscrimmed white
    // ink. With the scrim the two windows measure identically, so the
    // deviation no longer buys anything and the spec timing stands.
    const coverage = CAPTIONS.find((c) => c.id === "coverage")!;
    expect(coverage.from * VIDEO_DURATION).toBeCloseTo(34.0, 3);
  });

  it("every caption clears 4.5:1 at its WORST measured pixel", () => {
    // This replaces two earlier tests that asserted which caption carried a
    // scrim and which ink each used. Those pinned my conclusions rather than
    // the property that matters, so they passed happily while the numbers
    // underneath them were wrong. Assert the requirement instead.
    for (const c of CAPTIONS) {
      expect(c.worstContrast, `${c.id} worst-case contrast`).toBeGreaterThanOrEqual(4.5);
      expect(c.evidence.length, `${c.id} must record how it was measured`).toBeGreaterThan(60);
    }
  });

  it("the hero copy clears 4.5:1 at its worst measured pixel too", () => {
    expect(HERO.worstContrast.headline).toBeGreaterThanOrEqual(4.5);
    expect(HERO.worstContrast.eyebrow).toBeGreaterThanOrEqual(4.5);
  });

  it("the scrim outlasts the copy it protects", () => {
    // Tying the two together meant the ground brightened at exactly the rate
    // the ink weakened, which is how the headline reached 2.15:1 while still
    // 58% opaque. The scrim must still be at full strength at the point the
    // copy passes half opacity.
    const halfOpaque = HERO.fadeOutTo / 2;
    expect(heroCopyOpacity(halfOpaque)).toBeCloseTo(0.5, 6);
    expect(heroScrimOpacity(halfOpaque)).toBe(1);
    expect(HERO.scrimGoneBy).toBeGreaterThan(HERO.fadeOutTo);
    // ...and it must still finish, or it dims footage that has no copy on it.
    expect(heroScrimOpacity(HERO.scrimGoneBy)).toBe(0);
    expect(heroScrimOpacity(1)).toBe(0);
  });
});

/* ------------------------------------------------------------------ *
 * A scrim that does not reach zero before it runs out of box gets cut
 * off square, and that square is a visible hard edge. Both defects
 * shipped once already, so the geometry is now a test.
 * ------------------------------------------------------------------ */
describe("2b · scrims fade out with no visible boundary", () => {
  type Stop = [number, number];
  const stops = (css: string): Stop[] =>
    [...css.matchAll(/rgba\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*,\s*([\d.]+)\s*\)\s+([\d.]+)%/g)]
      .map((m) => [parseFloat(m[2]) / 100, parseFloat(m[1])] as Stop);

  const alphaAt = (ss: Stop[], t: number) => {
    if (t <= ss[0][0]) return ss[0][1];
    if (t >= ss[ss.length - 1][0]) return ss[ss.length - 1][1];
    for (let i = 1; i < ss.length; i++) {
      if (t <= ss[i][0]) {
        const [p0, a0] = ss[i - 1], [p1, a1] = ss[i];
        return a0 + (a1 - a0) * ((t - p0) / (p1 - p0));
      }
    }
    return 0;
  };

  const VIEWPORTS: [number, number][] = [[1440, 900], [1920, 1080]];

  it("HERO_SCRIM is fully transparent at the right edge of every target viewport", () => {
    const deg = parseFloat(/linear-gradient\((\d+(?:\.\d+)?)deg/.exec(HERO_SCRIM)![1]);
    const ss = stops(HERO_SCRIM);
    const A = (deg * Math.PI) / 180, dx = Math.sin(A), dy = -Math.cos(A);
    for (const [W, H] of VIEWPORTS) {
      const len = Math.abs(W * dx) + Math.abs(H * dy);
      for (let y = 0; y <= H; y += 4) {
        const t = 0.5 + ((W - W / 2) * dx + (y - H / 2) * dy) / len;
        expect(alphaAt(ss, t), `hero scrim at right edge, ${W}x${H} y=${y}`).toBe(0);
      }
    }
  });

  it("CAPTION_SCRIM is fully transparent along the top and right edges", () => {
    const m = /radial-gradient\(([\d.]+)% ([\d.]+)% at ([\d.]+)% ([\d.]+)%/.exec(CAPTION_SCRIM)!;
    const [rxP, ryP, cxP, cyP] = m.slice(1).map(parseFloat);
    const ss = stops(CAPTION_SCRIM);
    for (const [W, H] of VIEWPORTS) {
      const cx = (cxP / 100) * W, cy = (cyP / 100) * H;
      const rx = (rxP / 100) * W, ry = (ryP / 100) * H;
      const t = (x: number, y: number) => Math.hypot((x - cx) / rx, (y - cy) / ry);
      for (let x = 0; x <= W; x += 4) {
        expect(alphaAt(ss, t(x, 0)), `caption scrim at top edge, ${W}x${H} x=${x}`).toBe(0);
      }
      for (let y = 0; y <= H; y += 4) {
        expect(alphaAt(ss, t(W, y)), `caption scrim at right edge, ${W}x${H} y=${y}`).toBe(0);
      }
    }
  });

  it("the caption scrim is rendered against the VIEWPORT, not the content column", () => {
    // inset-0 inside the centred max-w-6xl column would slice the ellipse at
    // x=(W-1152)/2 and draw a vertical seam. The scrim layer must therefore be
    // a sibling of that column, not a child of it.
    const src = readFileSync(join(process.cwd(), "components", "hero", "scrub-video-hero.tsx"), "utf8");
    // Anchor on the className LITERAL, not the bare token: the token also
    // appears in the comment explaining this very rule, which is enough to
    // make an index comparison lie.
    const column = src.indexOf('className="relative z-10 mx-auto flex h-full max-w-6xl');
    const scrim = src.indexOf("background: CAPTION_SCRIM }}");
    expect(column, "content column not found").toBeGreaterThan(-1);
    expect(scrim).toBeGreaterThan(-1);
    expect(scrim, "caption scrim must be declared before the max-w-6xl column").toBeLessThan(column);
  });
});

describe("3 · CTAs never gate on video progress", () => {
  it("hero copy fades but the CTA schedule is not a function of the video", () => {
    // heroCopyOpacity takes scroll progress only. There is no video argument
    // to gate on, by construction.
    expect(heroCopyOpacity(0)).toBe(1);
    expect(heroCopyOpacity(HERO.fadeOutTo)).toBe(0);
    expect(heroCopyOpacity(0.06)).toBeGreaterThan(0);
    expect(heroCopyOpacity(0.06)).toBeLessThan(1);
  });

  it("the hero never uses the page-surface outline variant over footage", () => {
    // `outline` resolves text-foreground to the LIGHT theme's ink. On paper
    // that is right; on footage it rendered the ghost CTA at rgb(3,9,23) over
    // a scrimmed ground — 1.62:1, invisible. Media grounds get outlineOnMedia.
    const src = readFileSync(join(process.cwd(), "components", "hero", "scrub-video-hero.tsx"), "utf8");
    expect(src).not.toMatch(/variant="outline"/);
    expect(src).not.toMatch(/fill="outlineInk/);
    // The hero now uses CtaButton. The property under test is unchanged: the
    // secondary over footage must carry light ink, not the light theme's.
    expect(src).toMatch(/fill="outlineOnMediaBorder"/);
    expect(src).toMatch(/route="below"/);
  });

  it("the faded copy block goes inert, so invisible controls cannot be hit", () => {
    // Opacity is not interactivity. Measured before this: effective opacity 0
    // at progress 0.13 with both CTAs still hit-testing and still focusable.
    const src = readFileSync(join(process.cwd(), "components", "hero", "scrub-video-hero.tsx"), "utf8");
    expect(src).toMatch(/inert=\{copyOpacity === 0\}/);
    // And the claim that a child can opt out of an ancestor's opacity is gone.
    expect(src).not.toMatch(/opacity: 1, pointerEvents/);
  });

  it("both CTAs have real destinations, not placeholders", () => {
    for (const cta of [HERO.primaryCta, HERO.ghostCta]) {
      expect(cta.href).not.toBe("#");
      expect(cta.href.length).toBeGreaterThan(1);
    }
  });
});



describe("3 · the hero component itself never gates on video state", () => {
  const HERO_SRC = readFileSync(
    join(process.cwd(), "components", "hero", "scrub-video-hero.tsx"),
    "utf8",
  );
  // Comments are stripped so the guard never fires on its own explanation.
  const body = HERO_SRC
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/gm, "$1 ");

  it("renders the CTA block unconditionally — no mode or readyState gate", () => {
    const i = body.indexOf("primaryCta");
    expect(i).toBeGreaterThan(-1);
    const around = body.slice(Math.max(0, i - 700), i + 300);
    for (const gate of ["readyState", "buffered", "mode ===", "mode !==", "canplay"]) {
      expect(around, `CTA must not be gated on ${gate}`).not.toContain(gate);
    }
  });

  it("drives overlay opacity from scroll progress, never from currentTime", () => {
    expect(body).toContain("heroCopyOpacity(progress)");
    expect(body).toContain("captionOpacity(c, progress)");
    // currentTime may only be WRITTEN (it is the playhead). Reading it to
    // drive anything would couple the overlay to the video, which is the bug
    // CLAMPED exists to avoid.
    const reads = body.match(/=\s*v\.currentTime/g) || [];
    expect(reads).toEqual([]);
  });

  it("shows no spinner, progress bar or loading language anywhere", () => {
    for (const banned of ["Loading", "Buffering", "spinner", "Please wait", "progress-bar"]) {
      expect(body, `hero must not contain "${banned}"`).not.toContain(banned);
    }
  });

  it("collapses the runway when not scrubbing, so no-scrub is not dead scroll", () => {
    expect(body).toContain('scrubs ? `${RUNWAY_VH}vh` : "100svh"');
  });

  it("reduced motion renders a still, never a paused video", () => {
    expect(body).toContain("hero-poster.jpg");
    expect(body).toContain("reducedMotion ?");
  });
});
