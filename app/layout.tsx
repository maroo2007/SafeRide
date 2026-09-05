import type { Metadata, Viewport } from "next";
import { Fraunces, JetBrains_Mono, Amiri, Noto_Naskh_Arabic } from "next/font/google";
import { SmoothScrollProvider } from "@/components/providers/smooth-scroll-provider";
import "./globals.css";

/* next/font self-hosts and subsets these, so there is no request to
   fonts.googleapis.com, no FOIT, and Latin visitors never download Arabic.

   Fraunces carries BOTH Latin heading and Latin body. That is only possible
   because of its optical-size axis: opsz 144 for display, opsz 9 for text.
   Arabic needs two families precisely because Amiri has no equivalent lever
   and its x-height is fixed at 0.67x. */
const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
  axes: ["opsz"],
  style: ["normal", "italic"],
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
  weight: ["400", "500"],
});

/* Arabic headings. Amiri has no variable version, so 400 + 700 are two files.
   Deliberately NOT given the latin subset: its Latin is markedly lighter and
   smaller than its Arabic, and SafeRide's Arabic copy is full of Latin terms
   (GPS, QR, AI). Leaving latin out makes those fall through to Fraunces. */
const amiri = Amiri({
  subsets: ["arabic"],
  variable: "--font-amiri",
  display: "swap",
  weight: ["400", "700"],
});

/* Arabic body. 0.84x x-height against Amiri's 0.67x — the reason for the split. */
const notoNaskh = Noto_Naskh_Arabic({
  subsets: ["arabic"],
  variable: "--font-naskh",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://saferide.app"),
  title: {
    default: "SafeRide — AI-Powered School Transportation Safety",
    template: "%s · SafeRide",
  },
  description:
    "Because every child deserves a safe ride home. Live GPS tracking, AI attendance, and instant parent alerts for schools across Egypt.",
  openGraph: {
    type: "website",
    siteName: "SafeRide",
    title: "SafeRide — AI-Powered School Transportation Safety",
    description:
      "Because every child deserves a safe ride home. Live GPS tracking, AI attendance, and instant parent alerts for schools across Egypt.",
    images: ["/images/hero-poster.jpg"],
  },
  twitter: {
    card: "summary_large_image",
    title: "SafeRide — AI-Powered School Transportation Safety",
    description: "Because every child deserves a safe ride home.",
    images: ["/images/hero-poster.jpg"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Never disable zoom (ui-ux-pro-max §5, viewport-meta).
  maximumScale: 5,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fdf8f0" },
    { media: "(prefers-color-scheme: dark)", color: "#030302" },
  ],
};

/* Applies the stored/system theme before first paint so the page never flashes
   the wrong ground. Kept inline and tiny on purpose. */
/* Light is the DEFAULT, deliberately — system preference is not followed.
   The buyer is a school principal or transport administrator, and a dark site
   reads as developer tooling rather than as something a school procures. Dark
   is an explicit opt-in only, and dark SECTIONS (footer, video, the navbar
   bridge) carry the film's own #030302 regardless of theme. */
const themeScript = `
(function(){try{
  if(localStorage.getItem("saferide-theme")==="dark")
    document.documentElement.classList.add("dark");
}catch(e){}})();
`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      dir="ltr"
      suppressHydrationWarning
      className={`${fraunces.variable} ${jetbrains.variable} ${amiri.variable} ${notoNaskh.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        {/* The idle loop is the LCP-critical hero asset at 336 KB, not the
            53 MB scrub file. Preload it; the scrub file loads lazily behind. */}
        <link
          rel="preload"
          as="video"
          href="/video/saferide-hero-idle.mp4"
          type="video/mp4"
        />
      </head>
      <body className="min-h-dvh bg-background text-foreground antialiased">
        <a
          href="#main"
          className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:left-4 focus-visible:top-4 focus-visible:z-[100] focus-visible:rounded-brand focus-visible:bg-card focus-visible:px-4 focus-visible:py-3 focus-visible:text-card-foreground focus-visible:shadow-lg"
        >
          Skip to main content
        </a>
        <SmoothScrollProvider>
          <div id="top" />
          {children}
        </SmoothScrollProvider>
      </body>
    </html>
  );
}
