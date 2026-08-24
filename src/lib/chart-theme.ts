/**
 * Canonical Recharts chrome — Crextio tokens from styles.css
 * (--chart-1…5, --foreground, --muted-foreground, --border, --font-sans).
 */

export const CHART_FONT = "var(--font-sans), ui-sans-serif, system-ui, sans-serif";

export const CHART = {
  ink: "#1a1a1a",
  gold: "#f5c518",
  teal: "#0f7a5a",
  amber: "#c47a0a",
  red: "#c93c37",
  info: "#2a6f97",
  muted: "#6b6560",
  grid: "#e8e0d0",
  card: "#ffffff",
  border: "#e8e0d0",
} as const;

/** Sequential series — chart-1…5 then info / muted. */
export const CHART_SERIES = [
  CHART.ink,
  CHART.gold,
  CHART.teal,
  CHART.amber,
  CHART.red,
  CHART.info,
  CHART.muted,
] as const;

export const CHART_PLOT = "h-56";

export const CHART_MARGIN = { top: 8, right: 12, left: 8, bottom: 8 } as const;

export const chartTick = {
  fontSize: 10,
  fill: CHART.muted,
  fontFamily: CHART_FONT,
} as const;

export const chartGridProps = {
  strokeDasharray: "3 3",
  stroke: CHART.grid,
} as const;

export const chartTooltipStyle = {
  background: CHART.card,
  border: `1px solid ${CHART.border}`,
  borderRadius: 12,
  fontFamily: CHART_FONT,
  fontSize: 12,
  color: CHART.ink,
  boxShadow: "0 4px 20px rgba(26, 26, 26, 0.07)",
} as const;

export const chartTooltipLabelStyle = {
  fontFamily: CHART_FONT,
  fontWeight: 600,
  color: CHART.ink,
} as const;

export const chartLegendStyle = {
  fontSize: 11,
  fontFamily: CHART_FONT,
  color: CHART.muted,
} as const;

export const chartBarRadius: [number, number, number, number] = [4, 4, 0, 0];
export const chartBarRadiusH: [number, number, number, number] = [0, 6, 6, 0];

export function seriesColor(index: number): string {
  return CHART_SERIES[index % CHART_SERIES.length];
}

export function truncateAxisLabel(label: string, maxLen = 16): string {
  return label.length > maxLen ? `${label.slice(0, maxLen - 1)}…` : label;
}
