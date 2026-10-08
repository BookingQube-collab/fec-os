import type { Metadata, Viewport } from "next";

import { Providers } from "@/components/providers";
import { fontClassNames } from "@/lib/fonts";
import "@/styles.css";

export const metadata: Metadata = {
  title: {
    default: "FEC-OS — Operations Command Center",
    template: "%s — FEC-OS",
  },
  description:
    "Enterprise AI-powered Operations Command Center for multi-location Family Entertainment Centers.",
  authors: [{ name: "FEC-OS" }],
  openGraph: {
    title: "FEC-OS — Operations Command Center",
    description:
      "Real-time operations, revenue intelligence, and AI insights across every branch.",
    type: "website",
  },
  twitter: { card: "summary" },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "FEC-OS",
  },
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icon-192.png" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#FDF8EC",
};

/** Runs during HTML parse, before first paint. English stays the server default. */
const localeBootScript = `(function(){try{var raw=localStorage.getItem("fec-os-app");if(!raw)return;var lang=(JSON.parse(raw).state||{}).language;if(lang==="ar"){var el=document.documentElement;el.lang="ar-QA";el.dir="rtl";}}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <head>
        <script id="fec-locale-boot" dangerouslySetInnerHTML={{ __html: localeBootScript }} />
      </head>
      <body
        className={`${fontClassNames} bg-background text-foreground antialiased`}
        suppressHydrationWarning
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
