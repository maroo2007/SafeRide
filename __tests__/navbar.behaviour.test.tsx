import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup, screen, act } from "@testing-library/react";
import { gsap } from "@/lib/gsap";

/**
 * Behavioural guards for the navbar (spec 2.3 / 2.4).
 *
 * The rest of the navbar's guards read the source files, and every one of them
 * has the same weakness: a component that renders nothing satisfies any
 * assertion phrased as an absence. These render the thing and drive it, so a
 * no-op component fails all of them — there is no toggle to click, no dialog
 * to find, and no focus to move.
 *
 * The no-op check was run: replacing the component body with `return null`
 * fails every test in this file.
 */

const h = vi.hoisted(() => ({
  stopSpy: vi.fn(),
  startSpy: vi.fn(),
}));

vi.mock("lenis", () => ({
  default: class MockLenis {
    on = vi.fn();
    raf = vi.fn();
    stop = h.stopSpy;
    start = h.startSpy;
    destroy = vi.fn();
  },
}));

import { SmoothScrollProvider } from "@/components/providers/smooth-scroll-provider";
import { SterlingGateNavigation } from "@/components/ui/sterling-gate-kinetic-navigation";
import { __resetLenisForTest } from "@/lib/lenis";

function matchMedia(opts: { reduced?: boolean; hover?: boolean } = {}) {
  const { reduced = false, hover = true } = opts;
  window.matchMedia = vi.fn().mockImplementation((q: string) => ({
    matches: q.includes("reduce") ? reduced : q.includes("hover") ? hover : false,
    media: q,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

function mount() {
  return render(
    <>
      <button type="button">outside</button>
      <SmoothScrollProvider>
        <SterlingGateNavigation />
      </SmoothScrollProvider>
    </>,
  );
}

const toggle = () => screen.getByRole("button", { name: /menu$/i });
const click = (el: HTMLElement) => act(() => { el.click(); });
const press = (key: string, shiftKey = false) =>
  act(() => {
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key, shiftKey, bubbles: true, cancelable: true }),
    );
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key, shiftKey, bubbles: true, cancelable: true }),
    );
  });

beforeEach(() => {
  vi.clearAllMocks();
  __resetLenisForTest();
  matchMedia();
});
afterEach(() => {
  cleanup();
  gsap.globalTimeline.clear();
});

describe("the trigger is a real button (§2.4)", () => {
  it("has a state-reflecting name and reports expansion", () => {
    mount();
    const btn = toggle();
    expect(btn.tagName).toBe("BUTTON");
    expect(btn).toHaveAccessibleName("Open menu");
    expect(btn).toHaveAttribute("aria-expanded", "false");
    expect(btn).toHaveAttribute("aria-controls", "site-menu");

    click(btn);
    expect(btn).toHaveAccessibleName("Close menu");
    expect(btn).toHaveAttribute("aria-expanded", "true");
  });

  it("has one source of truth: no checkbox shadowing React state", () => {
    const { container } = mount();
    expect(container.querySelector('input[type="checkbox"]')).toBeNull();
    // The CSS keys off this, so it has to track the state it claims to.
    expect(toggle()).toHaveAttribute("data-open", "false");
    click(toggle());
    expect(toggle()).toHaveAttribute("data-open", "true");
  });
});

describe("the overlay is a modal dialog (§2.4)", () => {
  it("claims dialog + aria-modal only while open", () => {
    mount();
    expect(screen.queryByRole("dialog")).toBeNull();
    click(toggle());
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("id", "site-menu");
  });
});

describe("focus (§2.4)", () => {
  it("moves into the panel when the menu opens", () => {
    mount();
    expect(document.activeElement).not.toBe(screen.queryByRole("link", { name: "Features" }));
    click(toggle());
    expect(document.activeElement).toBe(screen.getByRole("link", { name: "Features" }));
  });

  it("cycles within the menu and never reaches the page behind it", () => {
    mount();
    const outside = screen.getByRole("button", { name: "outside" });
    click(toggle());

    // Six links, then the utilities, then the toggle, then back to the first.
    const seen = new Set<Element | null>();
    for (let i = 0; i < 20; i++) {
      press("Tab");
      seen.add(document.activeElement);
      expect(document.activeElement, "focus escaped the trap").not.toBe(outside);
      expect(document.body.contains(document.activeElement)).toBe(true);
    }
    // NO-OP CHECK: a trap that simply pinned focus to one element would also
    // never reach `outside`. It has to actually move.
    expect(seen.size).toBeGreaterThan(3);
    expect([...seen]).toContain(toggle());
    expect([...seen]).toContain(screen.getByRole("link", { name: "Contact" }));
  });

  it("wraps backwards too", () => {
    mount();
    click(toggle());
    expect(document.activeElement).toBe(screen.getByRole("link", { name: "Features" }));
    press("Tab", true);
    // Backwards from the first item lands on the last member of the cycle.
    expect(document.activeElement).toBe(toggle());
  });

  it("returns to the toggle when the menu closes", () => {
    mount();
    click(toggle());
    expect(document.activeElement).not.toBe(toggle());
    press("Escape");
    expect(toggle()).toHaveAttribute("aria-expanded", "false");
    expect(document.activeElement).toBe(toggle());
  });
});

describe("scroll is locked while the menu is open (§2.3)", () => {
  it("stops Lenis on open and starts it again on close", () => {
    mount();
    expect(h.stopSpy).not.toHaveBeenCalled();
    click(toggle());
    expect(h.stopSpy).toHaveBeenCalledTimes(1);
    expect(h.startSpy).not.toHaveBeenCalled();
    click(toggle());
    expect(h.startSpy).toHaveBeenCalledTimes(1);
  });
});

describe("reduced motion opens instantly, not faster (§2.4)", () => {
  it("runs no tween at all when the user prefers reduced motion", () => {
    matchMedia({ reduced: true });
    mount();
    click(toggle());
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(gsap.globalTimeline.getChildren(true, true, false).length).toBe(0);
  });

  it("does run tweens when motion is allowed, so the check above is not vacuous", () => {
    matchMedia({ reduced: false });
    mount();
    click(toggle());
    expect(gsap.globalTimeline.getChildren(true, true, false).length).toBeGreaterThan(0);
  });
});
