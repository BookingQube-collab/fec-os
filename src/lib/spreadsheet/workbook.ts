import ExcelJS from "exceljs";

/** Byte cap aligned with the largest spreadsheet upload the app already allows. */
export const SPREADSHEET_MAX_BYTES = 20 * 1024 * 1024;
export const SPREADSHEET_MAX_ROWS = 50_000;
export const SPREADSHEET_MAX_COLS = 256;

export class SpreadsheetReadError extends Error {
  code: "too_large" | "too_many_rows" | "legacy_xls" | "unreadable";

  constructor(code: SpreadsheetReadError["code"], message: string) {
    super(message);
    this.name = "SpreadsheetReadError";
    this.code = code;
  }
}

export type WorkbookMatrices = {
  sheetNames: string[];
  sheets: Record<string, unknown[][]>;
};

export type SheetWrite = {
  name: string;
  rows: unknown[][];
  freezeRows?: number;
  colWidths?: number[];
  merges?: { top: number; left: number; bottom: number; right: number }[];
  autoFilter?: { headerRow: number; cols: number };
};

function byteLength(data: ArrayBuffer | Buffer): number {
  return data.byteLength;
}

function asUint8(data: ArrayBuffer | Buffer): Uint8Array {
  if (Buffer.isBuffer(data)) return data;
  return new Uint8Array(data);
}

function isLegacyXls(data: Uint8Array): boolean {
  return data.length >= 4 && data[0] === 0xd0 && data[1] === 0xcf && data[2] === 0x11 && data[3] === 0xe0;
}

function unwrapValue(value: ExcelJS.CellValue): unknown {
  if (value == null) return null;
  if (value instanceof Date) return value;
  if (typeof value !== "object") return value;
  if ("richText" in value && Array.isArray(value.richText)) {
    return value.richText.map((part) => part.text).join("");
  }
  if ("result" in value) {
    const result = value.result;
    if (result == null) return null;
    if (result instanceof Date || typeof result !== "object") return result;
    return String(result);
  }
  if ("text" in value && "hyperlink" in value) return value.text;
  return null;
}

function cellOutput(cell: ExcelJS.Cell, raw: boolean, defval: unknown): unknown {
  // Merged ranges store the value on the master cell. Slave cells stay empty,
  // matching the previous spreadsheet reader.
  if (cell.isMerged && cell.master && cell.master.address !== cell.address) return defval;
  const source = cell;
  if (!raw) {
    try {
      const text = source.text;
      if (text == null || text === "") return defval;
      return text;
    } catch {
      const fallback = unwrapValue(source.value);
      if (fallback == null || fallback === "") return defval;
      return fallback instanceof Date ? fallback.toISOString() : String(fallback);
    }
  }
  const value = unwrapValue(source.value);
  if (value == null || value === "") return defval;
  return value;
}

async function loadWorkbook(data: ArrayBuffer | Buffer, maxRows: number): Promise<ExcelJS.Workbook> {
  if (byteLength(data) > SPREADSHEET_MAX_BYTES) {
    throw new SpreadsheetReadError("too_large", "Spreadsheet exceeds the 20 MB limit.");
  }
  const bytes = asUint8(data);
  if (isLegacyXls(bytes)) {
    throw new SpreadsheetReadError(
      "legacy_xls",
      "Legacy .xls workbooks are not accepted. Save the file as .xlsx and upload it again.",
    );
  }
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(Buffer.from(bytes) as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  } catch {
    throw new SpreadsheetReadError("unreadable", "Could not read this spreadsheet. Save it as .xlsx and try again.");
  }
  for (const sheet of workbook.worksheets) {
    if (sheet.rowCount > maxRows) {
      throw new SpreadsheetReadError(
        "too_many_rows",
        `Spreadsheet has more than ${maxRows} rows.`,
      );
    }
  }
  return workbook;
}

function sheetMatrix(sheet: ExcelJS.Worksheet, raw: boolean, defval: unknown, maxRows: number): unknown[][] {
  const lastRow = Math.min(sheet.rowCount, maxRows);
  let lastCol = 1;
  for (let r = 1; r <= lastRow; r++) {
    lastCol = Math.max(lastCol, Math.min(sheet.getRow(r).cellCount || 1, SPREADSHEET_MAX_COLS));
  }
  lastCol = Math.min(lastCol, SPREADSHEET_MAX_COLS);
  const rows: unknown[][] = [];
  for (let r = 1; r <= lastRow; r++) {
    const row = sheet.getRow(r);
    const cells: unknown[] = [];
    for (let c = 1; c <= lastCol; c++) {
      cells.push(cellOutput(row.getCell(c), raw, defval));
    }
    rows.push(cells);
  }
  return rows;
}

export async function readWorkbookMatrices(
  data: ArrayBuffer | Buffer,
  options?: { raw?: boolean; defval?: unknown; maxRows?: number },
): Promise<WorkbookMatrices> {
  const raw = options?.raw ?? false;
  const defval = options?.defval ?? (raw ? null : "");
  const maxRows = options?.maxRows ?? SPREADSHEET_MAX_ROWS;
  const workbook = await loadWorkbook(data, maxRows);
  const sheetNames = workbook.worksheets.map((sheet) => sheet.name);
  const sheets: Record<string, unknown[][]> = {};
  for (const sheet of workbook.worksheets) {
    sheets[sheet.name] = sheetMatrix(sheet, raw, defval, maxRows);
  }
  return { sheetNames, sheets };
}

export function matrixToCsv(matrix: unknown[][]): string {
  return matrix
    .map((row) =>
      row
        .map((cell) => {
          const value = cell == null ? "" : cell instanceof Date ? cell.toISOString() : String(cell);
          return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
        })
        .join(","),
    )
    .join("\n");
}

export async function readFirstSheetCsv(data: ArrayBuffer | Buffer): Promise<string> {
  const book = await readWorkbookMatrices(data, { raw: false, defval: "" });
  const name = book.sheetNames[0];
  if (!name) throw new SpreadsheetReadError("unreadable", "Excel file has no worksheets");
  return matrixToCsv(book.sheets[name] ?? []);
}

/** Header row is 0-based, matching SheetJS `sheet_to_json({ range })`. */
export function matrixToObjects(matrix: unknown[][], headerRow = 0): Record<string, unknown>[] {
  const header = (matrix[headerRow] ?? []).map((cell) => (cell == null ? "" : String(cell).trim()));
  const out: Record<string, unknown>[] = [];
  for (let i = headerRow + 1; i < matrix.length; i++) {
    const row = matrix[i] ?? [];
    const record: Record<string, unknown> = {};
    let any = false;
    header.forEach((key, col) => {
      if (!key) return;
      const value = row[col] ?? null;
      record[key] = value;
      if (value != null && value !== "") any = true;
    });
    if (any) out.push(record);
  }
  return out;
}

export function objectsToRows(rows: Record<string, unknown>[]): unknown[][] {
  const headers: string[] = [];
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!headers.includes(key)) headers.push(key);
    }
  }
  if (!headers.length) return [[]];
  return [headers, ...rows.map((row) => headers.map((key) => row[key] ?? ""))];
}

function writeCell(value: unknown): ExcelJS.CellValue {
  if (value == null || value === "") return null;
  if (value instanceof Date || typeof value === "number" || typeof value === "boolean") return value;
  return String(value);
}

export async function writeXlsxArrayBuffer(sheets: SheetWrite[]): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  for (const spec of sheets) {
    const sheet = workbook.addWorksheet(spec.name.slice(0, 31) || "Sheet1");
    for (const row of spec.rows) {
      sheet.addRow(row.map((value) => writeCell(value)));
    }
    if (spec.freezeRows && spec.freezeRows > 0) {
      sheet.views = [{ state: "frozen", ySplit: spec.freezeRows, xSplit: 0 }];
    }
    spec.colWidths?.forEach((width, index) => {
      sheet.getColumn(index + 1).width = width;
    });
    spec.merges?.forEach((merge) => {
      sheet.mergeCells(merge.top, merge.left, merge.bottom, merge.right);
    });
    if (spec.autoFilter && spec.rows.length > spec.autoFilter.headerRow) {
      const header = spec.autoFilter.headerRow + 1;
      sheet.autoFilter = {
        from: { row: header, column: 1 },
        to: { row: spec.rows.length, column: Math.max(1, spec.autoFilter.cols) },
      };
    }
  }
  const out = await workbook.xlsx.writeBuffer();
  return out as ArrayBuffer;
}

export async function writeXlsxBuffer(sheets: SheetWrite[]): Promise<Buffer> {
  return Buffer.from(await writeXlsxArrayBuffer(sheets));
}

export async function downloadXlsx(filename: string, sheets: SheetWrite[]): Promise<void> {
  const bytes = await writeXlsxArrayBuffer(sheets);
  const blob = new Blob([bytes], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
