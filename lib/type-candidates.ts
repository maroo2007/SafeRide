/**
 * Stage 1 heading-candidate list.
 *
 * `styles` and `arabic` are VERIFIED, not assumed:
 *   - Google families from https://fonts.google.com/metadata/fonts
 *   - Fontshare families by probing weights 100-900 against their CSS API
 *
 * Only 57 of 1946 Google families carry an Arabic subset, and none of the
 * Latin display faces below do. So "arabic" here means: does this family (or
 * its own superfamily) cover Arabic, or would SafeRide need an unrelated
 * second face?
 */

export type Arabic =
  | { kind: "native" }
  | { kind: "companion"; family: string; styles: number }
  | { kind: "none" };

export type Candidate = {
  name: string;
  /** CSS font-family as embedded in public/specimen/fonts.css */
  css: string;
  source: "Google" | "Fontshare";
  styles: number;
  italic?: boolean;
  arabic: Arabic;
};

const none: Arabic = { kind: "none" };
const native: Arabic = { kind: "native" };

export const BUCKETS: { id: string; label: string; blurb: string; fonts: Candidate[] }[] = [
  {
    id: "editorial",
    label: "High-contrast editorial serif",
    blurb: "Fashion/magazine register. Elegant, but thin strokes are the first thing to disappear over a bright video frame.",
    fonts: [
      { name: "Playfair Display", css: "Playfair Display", source: "Google", styles: 12, arabic: none },
      { name: "Fraunces", css: "Fraunces", source: "Google", styles: 18, arabic: none },
      { name: "Bodoni Moda", css: "Bodoni Moda", source: "Google", styles: 12, arabic: none },
      { name: "Prata", css: "Prata", source: "Google", styles: 1, arabic: none },
      { name: "DM Serif Display", css: "DM Serif Display", source: "Google", styles: 2, arabic: none },
      { name: "Instrument Serif", css: "Instrument Serif", source: "Google", styles: 2, arabic: none },
      { name: "Gilda Display", css: "Gilda Display", source: "Google", styles: 1, arabic: none },
      { name: "Abril Fatface", css: "Abril Fatface", source: "Google", styles: 1, arabic: none },
      { name: "Yeseva One", css: "Yeseva One", source: "Google", styles: 1, arabic: none },
      { name: "Cormorant Garamond", css: "Cormorant Garamond", source: "Google", styles: 10, arabic: none },
      { name: "Newsreader", css: "Newsreader", source: "Google", styles: 14, arabic: none },
      { name: "Bespoke Serif", css: "Bespoke Serif", source: "Fontshare", styles: 5, italic: true, arabic: none },
      { name: "Gambetta", css: "Gambetta", source: "Fontshare", styles: 5, italic: true, arabic: none },
      { name: "Sentient", css: "Sentient", source: "Fontshare", styles: 5, italic: true, arabic: none },
    ],
  },
  {
    id: "condensed",
    label: "Condensed / industrial",
    blurb: "Space-efficient and urgent. Reads as transit/utility — apt for fleet, risky for the emotional register.",
    fonts: [
      { name: "Tanker", css: "Tanker", source: "Fontshare", styles: 1, arabic: none },
      { name: "Oswald", css: "Oswald", source: "Google", styles: 6, arabic: none },
      { name: "Archivo Narrow", css: "Archivo Narrow", source: "Google", styles: 8, arabic: none },
      { name: "Barlow Condensed", css: "Barlow Condensed", source: "Google", styles: 18, arabic: none },
      { name: "Anton", css: "Anton", source: "Google", styles: 1, arabic: none },
      { name: "Big Shoulders", css: "Big Shoulders", source: "Google", styles: 9, arabic: none },
      { name: "Saira Condensed", css: "Saira Condensed", source: "Google", styles: 9, arabic: none },
    ],
  },
  {
    id: "slab",
    label: "Slab",
    blurb: "Mass survives busy backgrounds better than anything else here — measured, not assumed.",
    fonts: [
      { name: "Boxing", css: "Boxing", source: "Fontshare", styles: 1, arabic: none },
      { name: "Roboto Slab", css: "Roboto Slab", source: "Google", styles: 9, arabic: none },
      { name: "Zilla Slab", css: "Zilla Slab", source: "Google", styles: 10, arabic: none },
      { name: "Bitter", css: "Bitter", source: "Google", styles: 18, arabic: none },
      { name: "Josefin Slab", css: "Josefin Slab", source: "Google", styles: 14, arabic: none },
    ],
  },
  {
    id: "display",
    label: "Geometric / grotesque display",
    blurb: "Contemporary tech register. Neutral enough to carry product copy, distinctive enough to be a brand.",
    fonts: [
      { name: "Clash Display", css: "Clash Display", source: "Fontshare", styles: 6, arabic: none },
      { name: "Space Grotesk", css: "Space Grotesk", source: "Google", styles: 5, arabic: none },
      { name: "Familjen Grotesk", css: "Familjen Grotesk", source: "Google", styles: 8, arabic: none },
      { name: "Bricolage Grotesque", css: "Bricolage Grotesque", source: "Google", styles: 7, arabic: none },
      { name: "Unbounded", css: "Unbounded", source: "Google", styles: 8, arabic: none },
      { name: "Chillax", css: "Chillax", source: "Fontshare", styles: 6, arabic: none },
      { name: "Khand", css: "Khand", source: "Google", styles: 5, arabic: none },
    ],
  },
  {
    id: "workhorse",
    label: "Humanist workhorse",
    blurb: "The safe end. Will never embarrass the brand, will never be the reason anyone remembers it.",
    fonts: [
      { name: "Inter", css: "Inter", source: "Google", styles: 18, arabic: none },
      { name: "Geist", css: "Geist", source: "Google", styles: 18, arabic: none },
      { name: "Instrument Sans", css: "Instrument Sans", source: "Google", styles: 8, arabic: none },
      { name: "Manrope", css: "Manrope", source: "Google", styles: 7, arabic: none },
      { name: "Synonym", css: "Synonym", source: "Fontshare", styles: 6, arabic: none },
      { name: "Satoshi", css: "Satoshi", source: "Fontshare", styles: 5, italic: true, arabic: none },
      { name: "General Sans", css: "General Sans", source: "Fontshare", styles: 6, italic: true, arabic: none },
      { name: "Public Sans", css: "Public Sans", source: "Google", styles: 18, arabic: none },
    ],
  },
  {
    id: "bilingual",
    label: "Bilingual-native & institutional — added",
    blurb:
      "The direction the buckets miss. SafeRide ships English AND Arabic, and none of the 40 above cover Arabic — every one of them forces a second, unrelated face. These do not.",
    fonts: [
      { name: "Rubik", css: "Rubik", source: "Google", styles: 14, arabic: native },
      { name: "Readex Pro", css: "Readex Pro", source: "Google", styles: 6, arabic: native },
      { name: "Alexandria", css: "Alexandria", source: "Google", styles: 9, arabic: native },
      {
        name: "IBM Plex Sans",
        css: "IBM Plex Sans",
        source: "Google",
        styles: 14,
        arabic: { kind: "companion", family: "IBM Plex Sans Arabic", styles: 7 },
      },
      {
        name: "Baloo 2",
        css: "Baloo 2",
        source: "Google",
        styles: 5,
        arabic: { kind: "companion", family: "Baloo Bhaijaan 2", styles: 5 },
      },
      { name: "Lexend", css: "Lexend", source: "Google", styles: 9, arabic: none },
    ],
  },
];

export const ALL: Candidate[] = BUCKETS.flatMap((b) => b.fonts);
