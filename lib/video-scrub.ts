/**
 * Scrub binding logic, isolated from React so it can be tested directly.
 *
 * The load-bearing idea: on Regular 4G the scrub file needs ~110s to fully
 * buffer, while a scrub advances ~7.5x real-time. A cold scrub can therefore
 * NEVER outrun a partial buffer. CLAMPED is not a degraded path for a Cairo
 * mobile visitor — it is the whole visit.
 *
 * So the playhead is a pure function of (scroll progress, buffered edge), and
 * it is designed to look deliberate at the edge rather than stalled.
 */

/** Locked by the encode. 2510 frames at 48fps. */
export const VIDEO_DURATION = 2510 / 48;

export type HeroMode = "no-scrub" | "clamped" | "full";

/** Mode may only ever move forward. A hero that degrades mid-scroll is worse
 *  than one that was never fancy. */
const MODE_RANK: Record<HeroMode, number> = { "no-scrub": 0, clamped: 1, full: 2 };

export function upgradeOnly(current: HeroMode, next: HeroMode): HeroMode {
  return MODE_RANK[next] > MODE_RANK[current] ? next : current;
}

/* ------------------------------------------------------------------ *
 * Buffer edge
 * ------------------------------------------------------------------ */

/** Seconds held back from the true buffer edge so we never seek into nothing. */
export const SAFETY_MARGIN = 0.35;

/** Seconds over which the playhead decelerates into the edge. */
export const KNEE = 2.5;

/** How much scroll overshoot the knee absorbs before it is fully settled. */
const KNEE_SPAN = 3;

/**
 * End of the buffered range that starts at (or before) 0.
 * Ranges that do not include the start are useless to a scrub, which always
 * seeks from the beginning.
 */
export function bufferedEdge(ranges: { length: number; start(i: number): number; end(i: number): number } | null): number {
  if (!ranges) return 0;
  let edge = 0;
  for (let i = 0; i < ranges.length; i++) {
    if (ranges.start(i) <= 0.05) edge = Math.max(edge, ranges.end(i));
  }
  return edge;
}

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * Map a desired playhead time to one the buffer can actually serve.
 *
 * Below the knee the video follows scroll exactly. Approaching the edge it
 * decelerates and asymptotically settles at the limit — a held frame that
 * *settles* reads as deliberate; one that snaps reads as stalled.
 *
 * Continuous in both arguments, which is what makes the unlock invisible:
 * when `edge` advances, the output advances smoothly rather than jumping.
 */
export function clampToBuffer(target: number, edge: number, duration: number): number {
  const hardLimit = Math.max(0, Math.min(edge - SAFETY_MARGIN, duration));
  if (hardLimit <= 0) return 0;

  const kneeStart = Math.max(0, hardLimit - KNEE);
  if (target <= kneeStart) return Math.max(0, target);

  const over = target - kneeStart;
  const t = Math.min(1, over / (KNEE * KNEE_SPAN));
  return kneeStart + (hardLimit - kneeStart) * easeOutCubic(t);
}

/**
 * Smooth the buffered edge itself. Buffering advances in chunks; feeding those
 * steps straight into the clamp would make the video lurch each time a chunk
 * lands. Chasing the real edge turns every chunk into a glide.
 *
 * Monotonic by construction — the eased edge never retreats, so the playhead
 * cannot travel backwards when a range is evicted.
 */
export function easeEdge(previous: number, actual: number, dtMs: number): number {
  if (actual <= previous) return previous;
  const k = 1 - Math.exp(-dtMs / 260);
  return previous + (actual - previous) * k;
}

/* ------------------------------------------------------------------ *
 * Mode selection
 * ------------------------------------------------------------------ */

/** Scroll advances the playhead ~7.5x faster than real time. */
export const SCRUB_RATE = 7.5;

/** Throughput, as a multiple of the file's own real-time bitrate, at which a
 *  cold scrub can keep up and FULL is honest. */
export const FULL_RATIO = SCRUB_RATE + 0.5;

/**
 * Floor below which we do not attempt a scrub at all.
 *
 * DEVIATION, flagged: the brief said "below ~1.5x real-time -> NO SCRUB". But
 * measured, Regular 4G delivers 512 KB/s against a file needing 1.07 MB/s of
 * real-time video — 0.48x. The 1.5x rule would therefore send Regular 4G to
 * NO SCRUB, which contradicts the brief's own conclusion that 4G users are
 * precisely the CLAMPED case (110s to fully buffer). Both cannot hold.
 *
 * 0.3x resolves it against real measurements rather than a guess:
 *     Fast 3G     204 KB/s = 0.19x  -> no-scrub
 *     Regular 4G  512 KB/s = 0.48x  -> clamped
 * The 25%-in-10s rule below remains the real backstop for a connection that
 * measures acceptably and then stalls.
 */
export const NO_SCRUB_RATIO = 0.3;

export type ThroughputSample = { bytes: number; ms: number };

/**
 * Decide the mode from MEASURED throughput, not from
 * navigator.connection.effectiveType, which is a coarse hint and lies often.
 *
 * `bitrate` is the file's own average bytes-per-second of video, so the ratio
 * is "how many times real-time can this connection deliver".
 */
export function pickMode(opts: {
  sample: ThroughputSample | null;
  fileBytesPerSecond: number;
  fullyBuffered: boolean;
  saveData: boolean;
  bufferedFraction: number;
  elapsedMs: number;
}): HeroMode {
  // A real user signal, not a guess. Always wins.
  if (opts.saveData) return "no-scrub";
  if (opts.fullyBuffered) return "full";

  const ratio =
    opts.sample && opts.sample.ms > 0
      ? (opts.sample.bytes / (opts.sample.ms / 1000)) / opts.fileBytesPerSecond
      : null;

  if (ratio !== null && ratio >= FULL_RATIO) return "full";
  if (ratio !== null && ratio < NO_SCRUB_RATIO) return "no-scrub";
  // Nothing to show for it after 10s is its own answer.
  if (opts.elapsedMs > 10_000 && opts.bufferedFraction < 0.25) return "no-scrub";
  return "clamped";
}

/* ------------------------------------------------------------------ *
 * Captions
 * ------------------------------------------------------------------ */

/** Convert a timestamp in the source film to scroll progress 0..1. */
export const atSecond = (s: number) => s / VIDEO_DURATION;
