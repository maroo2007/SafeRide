import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { StrictMode } from "react";

/**
 * Guards spec 12: "One Lenis instance, one ScrollTrigger registration."
 *
 * This is the invariant the whole scroll system rests on. Two Lenis instances
 * fight over the same scroll and break the page; two ScrollTrigger
 * registrations desync the scrub. Both pasted components (spec 2, spec 3) ship
 * code that violates it, so this must fail loudly if that code is ever wired in
 * unchanged.
 */

// vi.mock is hoisted above module scope, so anything its factory closes over
// must be created with vi.hoisted().
const h = vi.hoisted(() => ({
  lenisCtor: vi.fn(),
  rafSpy: vi.fn(),
  onSpy: vi.fn(),
  stopSpy: vi.fn(),
  startSpy: vi.fn(),
  destroySpy: vi.fn(),
  registerPlugin: vi.fn(),
}));
const { lenisCtor, stopSpy, startSpy, registerPlugin } = h;

vi.mock("lenis", () => ({
  default: class MockLenis {
    constructor(opts: unknown) {
      h.lenisCtor(opts);
    }
    on = h.onSpy;
    raf = h.rafSpy;
    stop = h.stopSpy;
    start = h.startSpy;
    destroy = h.destroySpy;
  },
}));

vi.mock("gsap", () => ({
  default: {
    registerPlugin: h.registerPlugin,
    ticker: { add: vi.fn(), remove: vi.fn(), lagSmoothing: vi.fn() },
  },
}));
vi.mock("gsap/ScrollTrigger", () => ({ ScrollTrigger: { update: vi.fn() } }));

import { SmoothScrollProvider, useSmoothScroll } from "@/components/providers/smooth-scroll-provider";
import { __getCreatedCount, __resetLenisForTest, stopScroll, startScroll, isScrollStopped, getLenis } from "@/lib/lenis";
import { __getRegistrationCount, __isRegistered, __resetGsapRegistration, registerGsap } from "@/lib/gsap";

function matchMedia(reduced: boolean) {
  window.matchMedia = vi.fn().mockImplementation((q: string) => ({
    matches: reduced && q.includes("reduce"),
    media: q,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

beforeEach(() => {
  vi.clearAllMocks();
  __resetLenisForTest();
  __resetGsapRegistration();
  matchMedia(false);
});
afterEach(cleanup);

function Consumer() {
  const { ready } = useSmoothScroll();
  return <div data-testid="c">{String(ready)}</div>;
}

describe("exactly one Lenis instance", () => {
  it("creates one instance for one provider", () => {
    render(<SmoothScrollProvider><Consumer /></SmoothScrollProvider>);
    expect(__getCreatedCount()).toBe(1);
  });

  it("still creates only one under StrictMode double-invoked effects", () => {
    render(
      <StrictMode>
        <SmoothScrollProvider><Consumer /></SmoothScrollProvider>
      </StrictMode>,
    );
    // StrictMode mounts, unmounts, remounts. The module owns the instance, so
    // teardown+recreate is allowed, but never two live at once.
    expect(__getCreatedCount()).toBeLessThanOrEqual(2);
    expect(lenisCtor.mock.calls.length).toBe(__getCreatedCount());
  });

  it("does not create a second instance when nested providers are mounted", () => {
    render(
      <SmoothScrollProvider>
        <SmoothScrollProvider><Consumer /></SmoothScrollProvider>
      </SmoothScrollProvider>,
    );
    expect(__getCreatedCount()).toBe(1);
  });
});

describe("exactly one ScrollTrigger registration", () => {
  it("registers the plugin once even when requested repeatedly", () => {
    render(<SmoothScrollProvider><Consumer /></SmoothScrollProvider>);
    registerGsap();
    registerGsap();
    expect(__getRegistrationCount()).toBeGreaterThan(1); // requested many times
    expect(registerPlugin).toHaveBeenCalledTimes(1);     // registered once
    expect(__isRegistered()).toBe(true);
  });
});

describe("reduced motion means no smooth scroll at all", () => {
  it("creates no Lenis instance when the user prefers reduced motion", () => {
    matchMedia(true);
    render(<SmoothScrollProvider><Consumer /></SmoothScrollProvider>);
    expect(__getCreatedCount()).toBe(0);
    expect(lenisCtor).not.toHaveBeenCalled();
  });

  // The provider ALSO short-circuits before calling getLenis(), so the test
  // above passes even if the library-level guard is deleted. Assert the
  // library guard directly, or this is defence-in-depth with only one layer
  // actually covered.
  it("getLenis() itself refuses to construct, independent of the provider", () => {
    matchMedia(true);
    expect(getLenis()).toBeNull();
    expect(__getCreatedCount()).toBe(0);
    expect(lenisCtor).not.toHaveBeenCalled();
  });

  it("getLenis() does construct when motion is allowed (guard is not vacuous)", () => {
    matchMedia(false);
    expect(getLenis()).not.toBeNull();
    expect(__getCreatedCount()).toBe(1);
  });
});

describe("scroll locking is reference counted", () => {
  it("only resumes once every owner has released", () => {
    render(<SmoothScrollProvider><Consumer /></SmoothScrollProvider>);
    stopSpy.mockClear();
    startSpy.mockClear();

    stopScroll();            // menu opens
    stopScroll();            // modal opens on top
    expect(stopSpy).toHaveBeenCalledTimes(1);
    expect(isScrollStopped()).toBe(true);

    startScroll();           // modal closes - must NOT resume yet
    expect(startSpy).not.toHaveBeenCalled();
    expect(isScrollStopped()).toBe(true);

    startScroll();           // menu closes - now it resumes
    expect(startSpy).toHaveBeenCalledTimes(1);
    expect(isScrollStopped()).toBe(false);
  });

  it("ignores an unbalanced release", () => {
    render(<SmoothScrollProvider><Consumer /></SmoothScrollProvider>);
    startSpy.mockClear();
    startScroll();
    expect(startSpy).not.toHaveBeenCalled();
    expect(isScrollStopped()).toBe(false);
  });
});

describe("consumers cannot silently opt out", () => {
  it("throws a directive error when used outside the provider", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Consumer />)).toThrow(/Do not create your own Lenis/);
    spy.mockRestore();
  });
});
