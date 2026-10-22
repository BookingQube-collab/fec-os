import {
  layoutOrgChart,
  layoutOrgChartLevels,
  ORG_NODE_WIDTH,
  orgChartNodeHeight,
  orgChartWrappedName,
  orgCurve,
  orgRankCurve,
  personInitials,
  type OrgChartViewMode,
} from "@/lib/org-hierarchy";

/** Readable card width in PDF points. Independent of the on-screen zoom. */
export const ORG_PDF_CARD_WIDTH = 180;
export const ORG_PDF_MARGIN = 36;
export const ORG_PDF_HEADER = 52;
export const ORG_PDF_FOOTER = 28;
export const ORG_PDF_CARD_PAD = 8;
export const ORG_PDF_TITLE_BLOCK = 12;
/** PDF user-space limit used by common viewers (200 inches). */
export const ORG_PDF_MAX_PAGE = 14400;
/**
 * Preferred tile budget so wide top-down charts split into readable pages
 * instead of one oversized landscape sheet that looks cropped when opened.
 */
export const ORG_PDF_TILE_PAGE = 2880;
const ORG_PDF_MIN_PAGE_WIDTH = 720;
const ORG_PDF_MIN_PAGE_HEIGHT = 480;
const CHART_PAD = 16;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

export type OrgChartPdfPerson = {
  staffId: string;
  fullName: string;
  jobTitle: string | null;
};

export type OrgChartPdfRequest = {
  rootIds: readonly string[];
  childIdsOf: ReadonlyMap<string, readonly string[]>;
  people: ReadonlyMap<string, OrgChartPdfPerson>;
  readOnly?: boolean;
  rtl?: boolean;
  title: string;
  generatedAt?: Date;
  /** Test hook. Production uses ORG_PDF_TILE_PAGE (capped at ORG_PDF_MAX_PAGE). */
  maxPage?: number;
  /** On-screen layout to mirror. The export always includes every report. */
  layout?: OrgChartViewMode;
};

export type OrgChartPdfCard = {
  staffId: string;
  fullName: string;
  initials: string;
  nameLines: string[];
  jobTitle: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type OrgChartPdfCurve = {
  x1: number;
  y1: number;
  c1x: number;
  c1y: number;
  c2x: number;
  c2y: number;
  x2: number;
  y2: number;
};

export type OrgChartPdfTile = {
  column: number;
  row: number;
  columns: number;
  rows: number;
  originX: number;
  originY: number;
  contentWidth: number;
  contentHeight: number;
  pageWidth: number;
  pageHeight: number;
};

export type OrgChartPdfPlan = {
  heading: string;
  dateLabel: string;
  scale: number;
  cards: OrgChartPdfCard[];
  curves: OrgChartPdfCurve[];
  tiles: OrgChartPdfTile[];
  chartWidth: number;
  chartHeight: number;
};

/** jsPDF swaps the format array when it disagrees with the orientation, so the longer side picks it. */
export function orgChartPdfPageOrientation(pageWidth: number, pageHeight: number): "portrait" | "landscape" {
  return pageWidth >= pageHeight ? "landscape" : "portrait";
}

export function orgChartPdfFilename(generatedAt: Date, kind: "company" | "team" = "company"): string {
  const slug = kind === "team" ? "your-team" : "company-hierarchy";
  const month = String(generatedAt.getMonth() + 1).padStart(2, "0");
  const day = String(generatedAt.getDate()).padStart(2, "0");
  return `${slug}-${generatedAt.getFullYear()}-${month}-${day}.pdf`;
}

export function orgChartPdfDateLabel(generatedAt: Date): string {
  const month = MONTHS[generatedAt.getMonth()] ?? "";
  return `${generatedAt.getDate()} ${month} ${generatedAt.getFullYear()}`;
}

/** Helvetica cannot draw Arabic, so a translated heading falls back to English. */
export function orgChartPdfHeading(title: string, fallback: string): string {
  const trimmed = title.trim();
  if (!trimmed || /[^\u0000-\u00FF]/.test(trimmed)) return fallback;
  return trimmed;
}

/** One job-title line. Names are never passed through this. */
export function orgChartPdfJobTitle(jobTitle: string | null, maxChars = 32): string {
  const text = jobTitle?.trim() || "Staff";
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(1, maxChars - 3)).trimEnd()}...`;
}

/** Line height that keeps every wrapped name line inside the card. */
export function orgChartPdfNameLineHeight(cardHeight: number, lineCount: number): number {
  const available = cardHeight - ORG_PDF_CARD_PAD * 2 - ORG_PDF_TITLE_BLOCK;
  return available / Math.max(1, lineCount);
}

type Span = { start: number; end: number };

function axisSlices(total: number, limit: number, spans: readonly Span[]): Array<{ origin: number; size: number }> {
  const size = Math.max(0, total);
  const cap = Math.max(1, limit);
  if (size <= cap) return [{ origin: 0, size }];
  const slices: Array<{ origin: number; size: number }> = [];
  let origin = 0;
  let guard = 0;
  while (origin < size - 0.5 && guard < 500) {
    guard += 1;
    let end = Math.min(origin + cap, size);
    if (end < size - 0.5) {
      // Keep pulling the cut back until it does not fall through any card.
      // One snap can still bisect another card that fit inside the original
      // window — common across a wide top-down rank of siblings.
      let pullGuard = 0;
      while (pullGuard < 200) {
        pullGuard += 1;
        const cut = spans.filter((span) => span.start < end - 0.5 && span.end > end + 0.5);
        if (!cut.length) break;
        const snappable = cut.filter((span) => span.start > origin + 0.5);
        if (snappable.length) {
          const snap = Math.min(...snappable.map((span) => span.start));
          if (snap <= origin + 1) break;
          end = snap;
          continue;
        }
        // A card that began on this slice is wider than the remaining window —
        // extend just far enough to keep the name on one page.
        end = Math.min(size, Math.max(end, ...cut.map((span) => span.end)));
        break;
      }
    }
    if (end <= origin + 0.5) end = Math.min(size, origin + cap);
    slices.push({ origin, size: end - origin });
    origin = end;
  }
  return slices.length ? slices : [{ origin: 0, size }];
}

export function tileOrgChartPdf(
  chartWidth: number,
  chartHeight: number,
  cards: readonly Pick<OrgChartPdfCard, "x" | "y" | "width" | "height">[],
  maxPage = ORG_PDF_TILE_PAGE,
): OrgChartPdfTile[] {
  const limit = Math.min(ORG_PDF_MAX_PAGE, Math.max(ORG_PDF_MIN_PAGE_WIDTH, maxPage));
  const maxContentW = Math.max(1, limit - ORG_PDF_MARGIN * 2);
  const maxContentH = Math.max(1, limit - ORG_PDF_HEADER - ORG_PDF_FOOTER);
  const xSpans = cards.map((card) => ({ start: card.x, end: card.x + card.width }));
  const ySpans = cards.map((card) => ({ start: card.y, end: card.y + card.height }));
  const columns = axisSlices(chartWidth, maxContentW, xSpans);
  const rows = axisSlices(chartHeight, maxContentH, ySpans);
  const tiles: OrgChartPdfTile[] = [];
  rows.forEach((row, rowIndex) => {
    columns.forEach((column, columnIndex) => {
      const contentWidth = Math.max(column.size, 1);
      const contentHeight = Math.max(row.size, 1);
      tiles.push({
        column: columnIndex,
        row: rowIndex,
        columns: columns.length,
        rows: rows.length,
        originX: column.origin,
        originY: row.origin,
        contentWidth,
        contentHeight,
        pageWidth: Math.max(ORG_PDF_MIN_PAGE_WIDTH, contentWidth + ORG_PDF_MARGIN * 2),
        pageHeight: Math.max(ORG_PDF_MIN_PAGE_HEIGHT, contentHeight + ORG_PDF_HEADER + ORG_PDF_FOOTER),
      });
    });
  });
  return tiles;
}

/** True when the card sits entirely inside the tile, so the name is not sliced. */
export function orgChartPdfCardOnTile(card: Pick<OrgChartPdfCard, "x" | "y" | "width" | "height">, tile: OrgChartPdfTile): boolean {
  return (
    card.x >= tile.originX - 0.5 &&
    card.y >= tile.originY - 0.5 &&
    card.x + card.width <= tile.originX + tile.contentWidth + 0.5 &&
    card.y + card.height <= tile.originY + tile.contentHeight + 0.5
  );
}

/** Card rectangle in page points, after the tile origin is applied. */
export function orgChartPdfCardFrame(
  card: Pick<OrgChartPdfCard, "x" | "y" | "width" | "height">,
  tile: OrgChartPdfTile,
): { left: number; top: number; right: number; bottom: number } {
  const left = ORG_PDF_MARGIN + card.x - tile.originX;
  const top = ORG_PDF_HEADER + card.y - tile.originY;
  return { left, top, right: left + card.width, bottom: top + card.height };
}

/**
 * Full reporting tree in PDF points. Pan, zoom, and collapsed branches are ignored:
 * every placed person and reporting line is included at a fixed readable scale.
 */
export function prepareOrgChartPdf(input: OrgChartPdfRequest): OrgChartPdfPlan {
  const readOnly = input.readOnly ?? false;
  const rtl = input.rtl ?? false;
  const generatedAt = input.generatedAt ?? new Date();
  const scale = ORG_PDF_CARD_WIDTH / ORG_NODE_WIDTH;
  const heights = new Map<string, number>();
  for (const [staffId, person] of input.people) {
    heights.set(staffId, orgChartNodeHeight(person.fullName, readOnly));
  }
  const layout =
    input.layout === "levels"
      ? layoutOrgChartLevels(input.rootIds, input.childIdsOf, heights)
      : layoutOrgChart(input.rootIds, input.childIdsOf, heights);
  const nodes = layout.nodes.map((node) => ({
    ...node,
    x: rtl ? layout.width - node.x - ORG_NODE_WIDTH : node.x,
  }));
  const byId = new Map(nodes.map((node) => [node.staffId, node]));
  const cards: OrgChartPdfCard[] = [];
  for (const node of nodes) {
    const person = input.people.get(node.staffId);
    const fullName = person?.fullName?.trim() || "Staff";
    cards.push({
      staffId: node.staffId,
      fullName,
      initials: personInitials(fullName),
      nameLines: orgChartWrappedName(fullName, readOnly),
      jobTitle: orgChartPdfJobTitle(person?.jobTitle ?? null),
      x: node.x * scale + CHART_PAD,
      y: node.y * scale + CHART_PAD,
      width: ORG_PDF_CARD_WIDTH,
      height: node.height * scale,
    });
  }
  const curves: OrgChartPdfCurve[] = [];
  for (const [parentId, kids] of input.childIdsOf) {
    const parent = byId.get(parentId);
    if (!parent) continue;
    for (const kid of kids) {
      const child = byId.get(kid);
      if (!child) continue;
      const curve = input.layout === "levels" ? orgRankCurve(parent, child) : orgCurve(parent, child, rtl);
      curves.push({
        x1: curve.x1 * scale + CHART_PAD,
        y1: curve.y1 * scale + CHART_PAD,
        c1x: curve.c1x * scale + CHART_PAD,
        c1y: curve.c1y * scale + CHART_PAD,
        c2x: curve.c2x * scale + CHART_PAD,
        c2y: curve.c2y * scale + CHART_PAD,
        x2: curve.x2 * scale + CHART_PAD,
        y2: curve.y2 * scale + CHART_PAD,
      });
    }
  }
  const chartWidth = Math.max(layout.width * scale, 0) + CHART_PAD * 2;
  const chartHeight = Math.max(layout.height * scale, 0) + CHART_PAD * 2;
  return {
    heading: orgChartPdfHeading(input.title, readOnly ? "Your team" : "Company hierarchy"),
    dateLabel: orgChartPdfDateLabel(generatedAt),
    scale,
    cards,
    curves,
    tiles: tileOrgChartPdf(chartWidth, chartHeight, cards, input.maxPage),
    chartWidth,
    chartHeight,
  };
}
