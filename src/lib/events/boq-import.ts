/** Column aliases accepted in event BOQ bulk-upload CSV / Excel sheets. */
const COL = {
  description: [
    "description",
    "item",
    "item description",
    "particulars",
    "desc",
    "details",
    "item name",
    "الوصف",
    "البند",
  ],
  qty: ["qty", "quantity", "qty.", "nos", "no", "الكمية"],
  unit: ["unit", "uom", "unit of measure", "الوحدة"],
  rate: ["rate", "unit rate", "unit price", "price", "السعر", "سعر الوحدة"],
  amount: ["amount", "total", "line total", "line amount", "المبلغ", "الإجمالي"],
  cost_category: ["cost category", "category", "cost_category", "cost code", "الفئة"],
} as const;

function pick(row: Record<string, string>, keys: readonly string[]): string {
  for (const k of keys) {
    const v = row[k];
    if (v?.trim()) return v.trim();
  }
  return "";
}

function parseNum(raw: string): number | null {
  const cleaned = raw.replace(/[, ]/g, "").replace(/qar|qr|ر\.?\s*ق/gi, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export interface EventBoqImportLine {
  description: string;
  qty: number;
  unit: string | null;
  rate: number | null;
  amount: number;
  cost_category: string | null;
}

export interface EventBoqImportPreview {
  rows: EventBoqImportLine[];
  errors: { row: number; message: string }[];
}

export const EVENT_BOQ_TEMPLATE_HEADERS =
  "description,qty,unit,rate,amount,cost_category";

export function buildEventBoqTemplateCsv(): string {
  return [
    EVENT_BOQ_TEMPLATE_HEADERS,
    "Stage lighting kit,10,ea,250,2500,production",
    "Ushers — evening shift,24,hr,35,840,staffing",
    "Forklift hire,2,day,450,900,logistics",
  ].join("\n");
}

export function parseEventBoqImportRows(rawRows: Record<string, string>[]): EventBoqImportPreview {
  const rows: EventBoqImportLine[] = [];
  const errors: { row: number; message: string }[] = [];

  rawRows.forEach((raw, idx) => {
    const rowNum = idx + 2;
    const description = pick(raw, COL.description);
    const qtyRaw = pick(raw, COL.qty);
    const unit = pick(raw, COL.unit) || null;
    const rateRaw = pick(raw, COL.rate);
    const amountRaw = pick(raw, COL.amount);
    const costCategory = pick(raw, COL.cost_category) || null;

    if (!description && !qtyRaw && !rateRaw && !amountRaw) return;

    if (!description) {
      errors.push({ row: rowNum, message: "Description is required" });
      return;
    }

    const qty = parseNum(qtyRaw) ?? 0;
    const rate = parseNum(rateRaw);
    const amount = parseNum(amountRaw) ?? (rate != null ? qty * rate : 0);
    if (qty < 0 || amount < 0 || (rate != null && rate < 0)) {
      errors.push({ row: rowNum, message: "Qty, rate, and amount must be zero or more" });
      return;
    }

    rows.push({
      description: description.slice(0, 500),
      qty,
      unit: unit ? unit.slice(0, 40) : null,
      rate,
      amount: Math.round(amount * 100) / 100,
      cost_category: costCategory ? costCategory.slice(0, 80) : null,
    });
  });

  return { rows, errors };
}

export function isBoqSpreadsheetName(fileName: string): boolean {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  return ext === "csv" || ext === "xlsx" || ext === "xls";
}

export function isBoqPdfName(fileName: string): boolean {
  return (fileName.split(".").pop()?.toLowerCase() ?? "") === "pdf";
}
