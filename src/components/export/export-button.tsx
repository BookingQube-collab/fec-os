"use client";

import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";

import { Button, type ButtonProps } from "@/components/ui/button";
import { type FileExportKind, useFileExport } from "@/hooks/use-file-export";
import { cn } from "@/lib/utils";

export type ExportButtonProps = Omit<ButtonProps, "onClick"> & {
  href: string;
  filename?: string;
  kind?: FileExportKind;
  idleLabel: ReactNode;
  successMessage?: string;
  /** External export controller — share one hook across a menu. */
  exportState?: ReturnType<typeof useFileExport>;
};

export function ExportButton({
  href,
  filename,
  kind = "file",
  idleLabel,
  successMessage,
  exportState,
  disabled,
  className,
  children,
  ...buttonProps
}: ExportButtonProps) {
  const local = useFileExport();
  const api = exportState ?? local;

  return (
    <Button
      type="button"
      disabled={disabled || api.isBusy}
      className={cn(className)}
      onClick={() => {
        void api.download({ url: href, filename, kind, successMessage });
      }}
      {...buttonProps}
    >
      {api.isBusy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
      {children ?? idleLabel}
    </Button>
  );
}
