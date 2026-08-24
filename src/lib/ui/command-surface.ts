/** Purchase Requests visual tokens — shared command-surface language. */

export const KPI_TINTS = ["green", "orange", "sky", "amber", "red", "slate"] as const;
export type KpiTint = (typeof KPI_TINTS)[number];

/** Pale card fill + matching border (PR KPI strip). */
export const KPI_TINT_CLASS: Record<KpiTint, string> = {
  green: "kpi-tint-green",
  orange: "kpi-tint-orange",
  sky: "kpi-tint-sky",
  amber: "kpi-tint-amber",
  red: "kpi-tint-red",
  slate: "kpi-tint-slate",
};

/** Icon well on a tinted KPI card. */
export const KPI_ICON_CLASS: Record<KpiTint, string> = {
  green: "kpi-icon-green",
  orange: "kpi-icon-orange",
  sky: "kpi-icon-sky",
  amber: "kpi-icon-amber",
  red: "kpi-icon-red",
  slate: "kpi-icon-slate",
};

export const SURFACE_CARD = "surface-card";
export const FILTER_CHIP = "filter-chip";
export const FILTER_CHIP_ACTIVE = "filter-chip filter-chip-active";

const WIDGET_ACCENT_TO_TINT = {
  blue: "sky",
  cyan: "sky",
  purple: "slate",
  green: "green",
  amber: "orange",
  red: "red",
} as const;

export function widgetAccentToTint(
  accent: "blue" | "cyan" | "purple" | "green" | "amber" | "red" | undefined,
): KpiTint {
  return WIDGET_ACCENT_TO_TINT[accent ?? "blue"];
}
