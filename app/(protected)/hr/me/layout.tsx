import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "FEC Employee",
  description: "Check in, attendance, and leave for FEC staff.",
  manifest: "/employee.webmanifest",
  appleWebApp: {
    capable: true,
    title: "FEC Employee",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icon-192.png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#FDF8EC",
};

export default function EmployeeMeLayout({ children }: { children: React.ReactNode }) {
  return children;
}
