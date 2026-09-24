/**
 * Apply E3 colorful theme onto SheetJS / xlsx-js-style worksheets.
 * Community `xlsx` ignores fills — callers must write via `xlsx-js-style`.
 */

import {
  E3_SHEET_TAB_COLORS,
  EXCEL_THEME,
  dataCellStyle,
  headerCellStyle,
  metaCellStyle,
  sectionHeaderStyle,
  titleCellStyle,
  type ExcelCellStyle,
} from "@/lib/attendance-hr/excel-theme";

type WorkSheet = import("xlsx").WorkSheet;

/** Minimal sheet shape needed for theming (avoids circular import with export-workbook). */
export type StyleableExcelSheet = {
  name: string;
  aoa: (string | number | boolean | null)[][];
  titleRowCount?: number;
  filterHeaderRow?: number;
  sectionHeaderRows?: number[];
  cellFills?: Record<string, string>;
  alternatingRows?: boolean;
  tabColor?: string;
};

function encodeCell(r: number, c: number): string {
  let col = "";
  let n = c;
  while (n >= 0) {
    col = String.fromCharCode((n % 26) + 65) + col;
    n = Math.floor(n / 26) - 1;
  }
  return `${col}${r + 1}`;
}

function ensureCell(ws: WorkSheet, r: number, c: number): Record<string, unknown> {
  const addr = encodeCell(r, c);
  if (!ws[addr]) ws[addr] = { t: "s", v: "" };
  return ws[addr] as Record<string, unknown>;
}

function mergeStyle(existing: unknown, next: ExcelCellStyle): ExcelCellStyle {
  const prev = (existing ?? {}) as ExcelCellStyle;
  return {
    ...prev,
    ...next,
    fill: next.fill ?? prev.fill,
    font: { ...prev.font, ...next.font },
    alignment: { ...prev.alignment, ...next.alignment },
    border: next.border ?? prev.border,
    numFmt: next.numFmt ?? prev.numFmt,
  };
}

function applyStyle(ws: WorkSheet, r: number, c: number, style: ExcelCellStyle): void {
  const cell = ensureCell(ws, r, c);
  cell.s = mergeStyle(cell.s, style);
}

function colCount(aoa: StyleableExcelSheet["aoa"]): number {
  let max = 1;
  for (const row of aoa) max = Math.max(max, row.length);
  return max;
}

/** Paint title / meta / table chrome + optional per-cell fills. */
export function applyE3SheetStyles(ws: WorkSheet, sheet: StyleableExcelSheet): void {
  const cols = colCount(sheet.aoa);
  const titleRows = sheet.titleRowCount ?? 0;
  const headerRow = sheet.filterHeaderRow;
  const fills = sheet.cellFills ?? {};

  for (let r = 0; r < titleRows; r++) {
    const style = r === 0 ? titleCellStyle() : metaCellStyle();
    for (let c = 0; c < Math.max(cols, 1); c++) {
      if (sheet.aoa[r]?.[c] != null && sheet.aoa[r]![c] !== "") {
        applyStyle(ws, r, c, style);
      }
    }
  }

  for (const r of sheet.sectionHeaderRows ?? []) {
    for (let c = 0; c < cols; c++) {
      if (sheet.aoa[r]?.[c] != null && sheet.aoa[r]![c] !== "") {
        applyStyle(ws, r, c, sectionHeaderStyle());
      }
    }
  }

  if (headerRow != null) {
    const header = sheet.aoa[headerRow] ?? [];
    for (let c = 0; c < header.length; c++) {
      applyStyle(ws, headerRow, c, headerCellStyle(EXCEL_THEME.primaryHeader));
    }
    const lastRow = sheet.aoa.length - 1;
    for (let r = headerRow + 1; r <= lastRow; r++) {
      const row = sheet.aoa[r] ?? [];
      const alt =
        sheet.alternatingRows && (r - headerRow) % 2 === 0 ? EXCEL_THEME.altRow : undefined;
      for (let c = 0; c < Math.max(row.length, header.length); c++) {
        const key = `${r},${c}`;
        const fill = fills[key] ?? alt;
        applyStyle(ws, r, c, dataCellStyle(fill));
      }
    }
  } else {
    // Freeform sheets (HR Summary): paint titled KPI tables via cellFills + section rows only
    for (const [key, rgb] of Object.entries(fills)) {
      const [rs, cs] = key.split(",").map(Number);
      if (!Number.isFinite(rs) || !Number.isFinite(cs)) continue;
      applyStyle(ws, rs, cs, dataCellStyle(rgb));
    }
  }

  // Explicit fills always win (matrix day cells, employee exceptions)
  for (const [key, rgb] of Object.entries(fills)) {
    const [rs, cs] = key.split(",").map(Number);
    if (!Number.isFinite(rs) || !Number.isFinite(cs)) continue;
    applyStyle(ws, rs, cs, dataCellStyle(rgb));
  }

  const tab = sheet.tabColor ?? E3_SHEET_TAB_COLORS[sheet.name];
  if (tab) {
    (ws as WorkSheet & { "!tabColor"?: { rgb: string } })["!tabColor"] = { rgb: tab };
  }

  if (!ws["!rows"]) ws["!rows"] = [];
  const rows = ws["!rows"] as Array<{ hpt?: number } | undefined>;
  if (titleRows > 0) {
    rows[0] = { ...(rows[0] ?? {}), hpt: 24 };
  }
}
