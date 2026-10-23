import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "nyumbani · Kenyan rentals with full costs up front",
    short_name: "nyumbani",
    description: "Search Kenyan rentals with rent, charges and move-in totals shown up front.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#FCF9F4",
    theme_color: "#FCF9F4",
    lang: "en-KE",
    categories: ["lifestyle", "business"],
    icons: [
      { src: "/icons/192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Search homes", url: "/search" },
      { name: "Saved homes", url: "/saved" },
      { name: "Messages", url: "/messages" },
    ],
  };
}
