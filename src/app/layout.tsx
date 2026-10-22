import type { Metadata, Viewport } from "next";
import { DM_Mono, Instrument_Sans } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";

// Cabinet Grotesk (Fontshare, ITF Free Font License) is not on Google Fonts, so it is self-hosted.
// It has no 600; font-semibold headings use 700.
const cabinet = localFont({
  variable: "--font-cabinet",
  src: [
    { path: "./fonts/CabinetGrotesk-500.woff2", weight: "500" },
    { path: "./fonts/CabinetGrotesk-700.woff2", weight: "700" },
    { path: "./fonts/CabinetGrotesk-800.woff2", weight: "800" },
  ],
});
const instrument = Instrument_Sans({ variable: "--font-instrument", subsets: ["latin"] });
const dmMono = DM_Mono({ variable: "--font-dm-mono", subsets: ["latin"], weight: ["400", "500"] });

export const metadata: Metadata = {
  title: { default: "nyumbani · Find your next home without the hassle", template: "%s · nyumbani" },
  description:
    "Search Kenyan rentals with rent, charges and move-in totals shown up front. Landlords and agents list vacancies and keep simple rent records.",
  applicationName: "nyumbani",
};

export const viewport: Viewport = {
  themeColor: "#FCF9F4",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-KE" className={`${cabinet.variable} ${instrument.variable} ${dmMono.variable}`}>
      <body className="min-h-dvh antialiased">
        <a
          href="#main"
          className="sr-only z-50 rounded-[10px] bg-ink px-4 py-3 text-white focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
        >
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
