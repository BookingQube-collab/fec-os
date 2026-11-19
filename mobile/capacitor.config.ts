import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Thin shell: loads the production FEC web softphone.
 * Override with CAPACITOR_SERVER_URL when pointing at preview / staging.
 */
const serverUrl =
  process.env.CAPACITOR_SERVER_URL?.trim() ||
  process.env.NEXT_PUBLIC_APP_URL?.trim() ||
  "https://e3fec.vercel.app";

const config: CapacitorConfig = {
  appId: "qa.e3.fec.callcenter",
  appName: "FEC Call Center",
  webDir: "www",
  server: {
    url: serverUrl,
    cleartext: false,
    allowNavigation: [
      "e3fec.vercel.app",
      "*.vercel.app",
      "localhost",
      "127.0.0.1",
    ],
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
    LocalNotifications: {
      smallIcon: "ic_stat_icon_config_sample",
      iconColor: "#0B3D2E",
    },
  },
  android: {
    allowMixedContent: false,
    backgroundColor: "#0B3D2E",
  },
};

export default config;
