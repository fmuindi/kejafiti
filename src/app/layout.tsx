import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, DM_Mono, Instrument_Sans } from "next/font/google";
import "./globals.css";

const bricolage = Bricolage_Grotesque({ variable: "--font-bricolage", subsets: ["latin"], weight: ["500", "600", "700", "800"] });
const instrument = Instrument_Sans({ variable: "--font-instrument", subsets: ["latin"] });
const dmMono = DM_Mono({ variable: "--font-dm-mono", subsets: ["latin"], weight: ["400", "500"] });

export const metadata: Metadata = {
  title: { default: "nyumbani · Find a home you can afford to move into", template: "%s · nyumbani" },
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
    <html lang="en-KE" className={`${bricolage.variable} ${instrument.variable} ${dmMono.variable}`}>
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
