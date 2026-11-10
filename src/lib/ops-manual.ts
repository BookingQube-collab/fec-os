/** Public URL for the MkDocs FEC-OS operations manual. */
export const OPS_MANUAL_URL =
  (typeof process !== "undefined" && process.env.NEXT_PUBLIC_OPS_MANUAL_URL?.trim()) ||
  (typeof process !== "undefined" && process.env.NODE_ENV === "development"
    ? "http://127.0.0.1:8000"
    : "https://bookingqube-collab.github.io/fec-os/");

export const OPS_MANUAL_LABEL_KEY = "layout.helpOpsManual";
