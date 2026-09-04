/**
 * Colour maths for contrast verification.
 *
 * Used by the token contrast test to check WCAG AA against the *actual*
 * shipped CSS rather than a duplicated copy of the palette.
 */

export type Rgb = { r: number; g: number; b: number };

/** Parse `#rgb`, `#rrggbb`, or `#rrggbbaa`. Alpha is returned separately. */
export function parseHex(hex: string): { rgb: Rgb; alpha: number } | null {
  const m = /^#([0-9a-f]{3,8})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (h.length !== 6 && h.length !== 8) return null;
  return {
    rgb: {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
    },
    alpha: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1,
  };
}

/** Composite a possibly-translucent colour over an opaque backdrop. */
export function flatten(fg: Rgb, alpha: number, bg: Rgb): Rgb {
  return {
    r: Math.round(fg.r * alpha + bg.r * (1 - alpha)),
    g: Math.round(fg.g * alpha + bg.g * (1 - alpha)),
    b: Math.round(fg.b * alpha + bg.b * (1 - alpha)),
  };
}

/** WCAG relative luminance. */
export function luminance({ r, g, b }: Rgb): number {
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG contrast ratio, 1..21. */
export function contrast(a: Rgb, b: Rgb): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Resolve a CSS custom-property map, following `var(--x)` chains, and return
 * flattened RGB. Returns null for values that are not resolvable hex colours.
 */
export function resolveToken(
  name: string,
  vars: Record<string, string>,
  backdrop: Rgb = { r: 255, g: 255, b: 255 },
  depth = 0,
): Rgb | null {
  if (depth > 10) return null;
  const raw = vars[name];
  if (!raw) return null;

  const varRef = /^var\(\s*(--[a-z0-9-]+)\s*\)$/i.exec(raw.trim());
  if (varRef) return resolveToken(varRef[1], vars, backdrop, depth + 1);

  const parsed = parseHex(raw);
  if (!parsed) return null;
  return parsed.alpha < 1 ? flatten(parsed.rgb, parsed.alpha, backdrop) : parsed.rgb;
}

/** Strip `/* ... *\/` comments so prose cannot be mistaken for CSS. */
export function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

/**
 * Extract custom properties from one CSS rule block by selector.
 *
 * The selector must be matched as an actual rule head — i.e. at the start of a
 * line and followed by `{`. Matching a bare substring is not safe: a comment
 * mentioning ":root" or ".dark" in prose would otherwise be treated as the rule
 * and silently yield the wrong block.
 */
export function extractVars(rawCss: string, selector: string): Record<string, string> {
  const css = stripComments(rawCss);
  const head = new RegExp(
    `(^|[};])\\s*${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{`,
    "m",
  );
  const m = head.exec(css);
  if (!m) return {};
  const idx = m.index + m[0].length - 1;
  const open = idx;
  if (css[open] !== "{") return {};
  let depth = 0;
  let end = open;
  for (let i = open; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}") {
      depth--;
      if (depth === 0) { end = i; break; }
    }
  }
  const body = css.slice(open + 1, end);
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)) {
    out[m[1]] = m[2].trim();
  }
  return out;
}
