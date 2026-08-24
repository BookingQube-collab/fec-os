"use client";

import { ChevronDown, Download, FileSpreadsheet, FileText } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface DownloadReportButtonProps {
  onPdf: () => void;
  onExcel: () => void;
  onCsv?: () => void;
  disabled?: boolean;
  label?: string;
  csvLabel?: string;
  pdfLabel?: string;
  excelLabel?: string;
}

export function DownloadReportButton({
  onPdf,
  onExcel,
  onCsv,
  disabled,
  label = "Download Report",
  csvLabel = "CSV",
  pdfLabel = "PDF",
  excelLabel = "Excel",
}: DownloadReportButtonProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled}>
          <Download />
          {label}
          <ChevronDown className="opacity-70" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {onCsv ? (
          <DropdownMenuItem onClick={onCsv}>
            <FileText />
            {csvLabel}
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem onClick={onPdf}>
          <Download />
          {pdfLabel}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onExcel}>
          <FileSpreadsheet />
          {excelLabel}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
