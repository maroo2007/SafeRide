/**
 * Phone tour content (spec §2). Copy verbatim.
 *
 * `screen` is the desktop texture fed to the 3D scene. `mobile` is the
 * purpose-cut 540px JPEG used by the stacked fallback — spec §7.2 as amended,
 * because the three full-size PNGs are 3.11 MiB and the fallback exists to
 * avoid exactly that weight on exactly that connection.
 *
 * Chapter 3 uses the real texture. The camera-feed imagery is AI-generated —
 * no licensing question and no real children — so the earlier exclusion was
 * reversed and the file is tracked. One content note stands: the feeds show
 * bright yellow American school buses, which contradict the cream-and-orange
 * fleet in the hero film and everywhere else. Logged for regeneration, not a
 * build issue. See spec §9.
 */

export type Chapter = {
  id: string;
  side: "right" | "left";
  screen: string;
  mobile: string;
  heading: string;
  body: string;
  bullets: string[];
};

export const CHAPTERS: Chapter[] = [
  {
    id: "home",
    side: "right",
    screen: "/models/screens/screen_01_home.png",
    mobile: "/models/screens/m_screen_01_home.jpg",
    heading: "The whole morning, on one screen",
    body: "Open SafeRide and the answer is already there: where the bus is, which stop it has reached, who is aboard, who is still waiting, and how many minutes until arrival.",
    bullets: [
      "Live trip status with stop-by-stop progress",
      "On-bus, boarding and absent counts at a glance",
      "Every child listed with their current status",
      "One tap to report an issue straight to the school admin",
    ],
  },
  {
    id: "tracking",
    side: "left",
    screen: "/models/screens/screen_02_tracking.png",
    mobile: "/models/screens/m_screen_02_tracking.jpg",
    heading: "The route, as it happens",
    body: "The bus on a real map with an accurate ETA, the driver one tap away, and a timeline that fills in as the morning happens.",
    bullets: [
      "Live position with distance and time remaining, updated against traffic",
      "Face recognition confirms each boarding — the count is verified, not guessed",
      "Call or message the driver without leaving the screen",
      "Every driver carries a performance rating built from braking, speed and fatigue signals",
    ],
  },
  {
    id: "cameras",
    side: "right",
    screen: "/models/screens/screen_03_cameras.png",
    mobile: "/models/screens/m_screen_03_cameras.jpg",
    heading: "See inside, whenever it matters",
    body: "Three cameras — front, rear and door — encrypted and restricted to verified guardians. Most parents look once and never need to again.",
    bullets: [
      "Front driver cam, rear seats and door area, simultaneously",
      "Live timestamps on every feed",
      "Guardian-only access, per bus",
      "One-tap emergency reaches the school, the parents and the operator at once",
    ],
  },
];
