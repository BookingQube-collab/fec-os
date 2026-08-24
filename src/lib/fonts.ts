import { Poppins } from "next/font/google";

/** FEC-OS UI typeface — Crextio-style geometric sans. */
export const fontSans = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

/** @deprecated Alias kept so any legacy imports of fontDisplay keep resolving. */
export const fontDisplay = fontSans;

export const fontClassNames = fontSans.variable;
