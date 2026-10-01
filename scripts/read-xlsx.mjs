import { readFileSync } from "node:fs";

import ExcelJS from "exceljs";

function unwrap(value) {
  if (value == null) return null;
  if (value instanceof Date) return value;
  if (typeof value !== "object") return value;
  if (Array.isArray(value.richText)) return value.richText.map((part) => part.text).join("");
  if (Object.prototype.hasOwnProperty.call(value, "result")) return value.result ?? null;
  if (typeof value.text === "string" && typeof value.hyperlink === "string") return value.text;
  return null;
}

/** Read an .xlsx file into header-less row arrays. Replaces the unmaintained `xlsx` parser. */
export async function readAoaFile(path) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(readFileSync(path));
  const sheets = {};
  for (const sheet of workbook.worksheets) {
    const lastRow = sheet.rowCount;
    let lastCol = 1;
    for (let r = 1; r <= lastRow; r++) {
      lastCol = Math.max(lastCol, Math.min(sheet.getRow(r).cellCount || 1, 256));
    }
    const rows = [];
    for (let r = 1; r <= lastRow; r++) {
      const row = sheet.getRow(r);
      const cells = [];
      for (let c = 1; c <= lastCol; c++) {
        const value = unwrap(row.getCell(c).value);
        cells.push(value == null || value === "" ? null : value);
      }
      rows.push(cells);
    }
    sheets[sheet.name] = rows;
  }
  return { sheetNames: workbook.worksheets.map((sheet) => sheet.name), sheets };
}

/** Object rows starting at a 0-based header index (SheetJS `range`). */
export function objectsFromAoa(matrix, headerRow = 0) {
  const header = (matrix[headerRow] ?? []).map((cell) => (cell == null ? "" : String(cell).trim()));
  const out = [];
  for (let i = headerRow + 1; i < matrix.length; i++) {
    const row = matrix[i] ?? [];
    const record = {};
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
