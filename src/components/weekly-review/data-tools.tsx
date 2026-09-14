"use client";

import { Download, Upload } from "lucide-react";
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import type { SiteOption } from "@/components/weekly-review/fields";
import type { ReviewPack } from "@/lib/weekly-review/model";
import { applySheetMap, packToSheetMap, sampleSheetMap, type SheetMap } from "@/lib/weekly-review/workbook";

async function writeWorkbook(sheets: SheetMap, filename: string) {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name.slice(0, 31));
  }
  XLSX.writeFile(wb, filename);
}

async function readWorkbook(file: File): Promise<SheetMap> {
  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array" });
  const sheets: SheetMap = {};
  for (const name of wb.SheetNames) {
    const sheet = wb.Sheets[name];
    if (!sheet) continue;
    sheets[name] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" }) as string[][];
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
