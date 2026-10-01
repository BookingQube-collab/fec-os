"use client";

import { Download, Upload } from "lucide-react";
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import type { SiteOption } from "@/components/weekly-review/fields";
import type { ReviewPack } from "@/lib/weekly-review/model";
import { downloadXlsx, readWorkbookMatrices } from "@/lib/spreadsheet/workbook";
import { applySheetMap, packToSheetMap, sampleSheetMap, type SheetMap } from "@/lib/weekly-review/workbook";

async function writeWorkbook(sheets: SheetMap, filename: string) {
  await downloadXlsx(
    filename,
    Object.entries(sheets).map(([name, rows]) => ({ name, rows })),
  );
}

async function readWorkbook(file: File): Promise<SheetMap> {
  const wb = await readWorkbookMatrices(await file.arrayBuffer(), { raw: false, defval: "" });
  const sheets: SheetMap = {};
  for (const name of wb.sheetNames) {
    sheets[name] = (wb.sheets[name] ?? []).map((row) => row.map((cell) => String(cell ?? ""))) as SheetMap[string];
  }
  return sheets;
}

export function WeeklyReviewDataTools({
  pack,
  sites,
  canEdit,
  onApplied,
}: {
  pack: ReviewPack | null;
  sites: SiteOption[];
  canEdit: boolean;
  onApplied: (next: ReviewPack) => void;
}) {
  const { t } = useTranslation();
  const fileRef = useRef<HTMLInputElement>(null);

  const downloadSample = () => {
    void writeWorkbook(sampleSheetMap(), "weekly-review-sample.xlsx");
  };

  const downloadWeek = () => {
    if (!pack) return;
    void writeWorkbook(packToSheetMap(pack, sites), `weekly-review-${pack.review.week_label.replace(/\s+/g, "-")}.xlsx`);
  };

  const onFile = async (file: File | null) => {
    if (!file || !canEdit || !pack) return;
    try {
      const sheets = await readWorkbook(file);
      const { pack: next, errors } = applySheetMap(pack, sheets, sites);
      onApplied(next);
      if (errors.length) toast.error(errors.slice(0, 3).join(" "));
      else toast.success(t("weeklyReview.import.applied"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("common.tryAgain"));
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" variant="outline" size="sm" onClick={downloadSample}>
        <Download className="h-4 w-4" />
        {t("weeklyReview.import.sample")}
      </Button>
      {pack ? (
        <Button type="button" variant="outline" size="sm" onClick={downloadWeek}>
          <Download className="h-4 w-4" />
          {t("weeklyReview.import.downloadWeek")}
        </Button>
      ) : null}
      {canEdit && pack ? (
        <>
          <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
            <Upload className="h-4 w-4" />
            {t("weeklyReview.import.upload")}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="sr-only"
            onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
          />
        </>
      ) : null}
    </div>
  );
}
