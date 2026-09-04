"use client";

import { useEffect, useState } from "react";

/**
 * Flags any specimen face that did NOT actually load.
 *
 * Without this, a font that fails silently renders in the fallback and the
 * grid shows you the wrong typeface under the right label — the worst possible
 * failure mode for a specimen sheet.
 */
export function FontLoadCheck({ families }: { families: string[] }) {
  const [failed, setFailed] = useState<string[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await document.fonts.ready;
      } catch {
        /* older engines */
      }
      await new Promise((r) => setTimeout(r, 400));
      if (cancelled) return;
      const bad = families.filter((f) => {
        try {
          return !document.fonts.check(`32px "${f}"`);
        } catch {
          return false;
        }
      });
      setFailed(bad);
    })();
    return () => {
      cancelled = true;
    };
  }, [families]);

  if (failed === null) {
    return <span className="label-mono opacity-60">checking {families.length} faces…</span>;
  }
  if (failed.length === 0) {
    return (
      <span className="label-mono" style={{ color: "#4ade80" }}>
        ✓ all {families.length} faces loaded — nothing is showing a fallback
      </span>
    );
  }
  return (
    <span className="label-mono" style={{ color: "#fc5855" }}>
      ✕ {failed.length} FAILED TO LOAD (showing fallback, do not judge these):{" "}
      {failed.join(", ")}
    </span>
  );
}
