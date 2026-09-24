"use client";

import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";

export type FileExportStage =
  | "idle"
  | "preparing"
  | "generating"
  | "downloading"
  | "success"
  | "error";

export type FileExportKind = "excel" | "pdf" | "csv" | "payroll" | "file";

const STAGE_LABELS: Record<FileExportStage, string> = {
  idle: "",
  preparing: "Preparing…",
  generating: "Generating…",
  downloading: "Downloading…",
  success: "Done",
  error: "Failed",
};

const KIND_PREPARING: Record<FileExportKind, string> = {
  excel: "Preparing Excel…",
  pdf: "Preparing PDF…",
  csv: "Preparing CSV…",
  payroll: "Preparing Payroll…",
  file: "Preparing download…",
};

const KIND_GENERATING: Record<FileExportKind, string> = {
  excel: "Generating Excel…",
  pdf: "Generating PDF…",
  csv: "Generating CSV…",
  payroll: "Generating Payroll…",
  file: "Generating file…",
};

function filenameFromDisposition(header: string | null): string | null {
  if (!header) return null;
  const utf = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (utf?.[1]) {
    try {
      return decodeURIComponent(utf[1].trim());
    } catch {
      return utf[1].trim();
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(header);
  return plain?.[1]?.trim() || null;
}

function userSafeExportError(err: unknown): string {
  if (err instanceof Error && err.message) {
    if (/failed to fetch|network|load failed/i.test(err.message)) {
      return "Download failed. Check your connection and try again.";
    }
    if (/401|403|unauthorized|forbidden/i.test(err.message)) {
      return "You do not have permission to export this report.";
    }
    if (err.message.length <= 120 && !/stack|at\s+\w+/i.test(err.message)) {
      return err.message;
    }
  }
  return "Export failed. Please try again.";
}

export type FileExportRunOptions = {
  url: string;
  /** Preferred filename when Content-Disposition is missing. */
  filename?: string;
  kind?: FileExportKind;
  successMessage?: string;
  /** Extra fetch init (credentials always include). */
  init?: RequestInit;
};

export function useFileExport() {
  const [stage, setStage] = useState<FileExportStage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<FileExportKind>("file");
  const lastOpts = useRef<FileExportRunOptions | null>(null);
  const running = useRef(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearResetTimer = () => {
    if (resetTimer.current) {
      clearTimeout(resetTimer.current);
      resetTimer.current = null;
    }
  };

  const reset = useCallback(() => {
    clearResetTimer();
    running.current = false;
    setStage("idle");
    setError(null);
  }, []);

  const download = useCallback(async (opts: FileExportRunOptions) => {
    if (running.current) return;
    running.current = true;
    clearResetTimer();
    lastOpts.current = opts;
    const exportKind = opts.kind ?? "file";
    setKind(exportKind);
    setError(null);
    setStage("preparing");

    try {
      setStage("generating");
      const res = await fetch(opts.url, {
        ...opts.init,
        credentials: "include",
      });
      if (!res.ok) {
        let detail = `Export failed (${res.status})`;
        try {
          const text = await res.text();
          if (text && text.length < 200 && !text.trimStart().startsWith("<")) detail = text;
        } catch {
          /* ignore */
        }
        throw new Error(detail);
      }

      setStage("downloading");
      const blob = await res.blob();
      const name =
        opts.filename ||
        filenameFromDisposition(res.headers.get("Content-Disposition")) ||
        "download.bin";
      if (/export\.xlsx/i.test(name)) {
        console.warn("[useFileExport] Rejected generic export.xlsx filename; using fallback");
      }
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = name === "export.xlsx" ? opts.filename || "E3_HR_Attendance.xlsx" : name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);

      setStage("success");
      toast.success(opts.successMessage ?? "Download ready");
      resetTimer.current = setTimeout(() => {
        running.current = false;
        setStage("idle");
      }, 1600);
    } catch (err) {
      console.error("[useFileExport]", err);
      const message = userSafeExportError(err);
      setError(message);
      setStage("error");
      toast.error(message);
      running.current = false;
    }
  }, []);

  const retry = useCallback(() => {
    if (!lastOpts.current) return;
    running.current = false;
    void download(lastOpts.current);
  }, [download]);

  const isBusy = stage === "preparing" || stage === "generating" || stage === "downloading";

  const stageLabel =
    stage === "preparing"
      ? KIND_PREPARING[kind]
      : stage === "generating"
        ? KIND_GENERATING[kind]
        : stage === "downloading"
          ? "Downloading…"
          : stage === "error"
            ? "Retry"
            : STAGE_LABELS[stage];

  return {
    stage,
    error,
    kind,
    isBusy,
    stageLabel,
    download,
    retry,
    reset,
  };
}
