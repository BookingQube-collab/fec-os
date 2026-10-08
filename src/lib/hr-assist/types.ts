export type AssistItem = {
  id: string;
  titleKey: string;
  whyKey: string;
  evidenceKey: string;
  actionKey: string;
  values: Record<string, string | number>;
  href?: string;
  /** i18n key for the record link. Attendance keeps the corrections label when this is omitted. */
  linkKey?: string;
};

export type AssistResult = {
  status: "ok" | "empty" | "insufficient";
  items: AssistItem[];
};

export const INSUFFICIENT_HR_DATA = "Insufficient HR data to answer this reliably.";
