import { type NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
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
      "@radix-ui/react-dialog",
      "@radix-ui/react-dropdown-menu",
      "@radix-ui/react-popover",
      "@radix-ui/react-select",
      "@radix-ui/react-tabs",
    ],
  },
  async rewrites() {
    return [{ source: "/iclock", destination: "/api/public/iclock/cdata" }];
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
    ];
  },
};

export default nextConfig;
