import { type NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  compiler: {
    removeConsole: process.env.NODE_ENV === "production" ? { exclude: ["error", "warn"] } : false,
  },
  images: {
    formats: ["image/avif", "image/webp"],
  },
  serverExternalPackages: ["xlsx", "jspdf", "jspdf-autotable"],
  experimental: {
    serverActions: {
      bodySizeLimit: "25mb",
    },
    // Next 15 defaults dynamic RSC cache to 0s — every click re-renders the page
    // on the server. This app is client-data-driven (React Query), so keep the
    // last page payload briefly and reuse fully prefetched routes.
    staleTimes: {
      dynamic: 60,
      static: 300,
    },
    optimizePackageImports: [
      "lucide-react",
      "date-fns",
      "recharts",
      "zod",
      "@radix-ui/react-alert-dialog",
      "@radix-ui/react-avatar",
      "@radix-ui/react-checkbox",
      "@radix-ui/react-collapsible",
      "@radix-ui/react-dialog",
      "@radix-ui/react-dropdown-menu",
      "@radix-ui/react-label",
      "@radix-ui/react-popover",
      "@radix-ui/react-progress",
      "@radix-ui/react-select",
      "@radix-ui/react-slider",
      "@radix-ui/react-switch",
      "@radix-ui/react-tabs",
    ],
  },
  async rewrites() {
    return [
      { source: "/iclock", destination: "/api/public/iclock/cdata" },
      { source: "/iclock.aspx", destination: "/iclock/cdata" },
      { source: "/iclock.aspx/:path*", destination: "/iclock/:path*" },
    ];
  },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        source: "/icon-:size(\\d+).png",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      {
        source: "/apple-touch-icon.png",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ];
  },
};

export default nextConfig;
