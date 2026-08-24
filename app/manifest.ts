import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "FEC Operations Command",
    short_name: "FEC OS",
    description:
      "Enterprise AI-powered Operations Command Center for multi-location Family Entertainment Centers.",
    start_url: "/",
    scope: "/",
    id: "/",
    display: "standalone",
    background_color: "#FDF8EC",
    theme_color: "#FDF8EC",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
