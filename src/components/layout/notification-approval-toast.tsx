"use client";

import { Info, X } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";

type NotificationApprovalToastProps = {
  title: string;
  body: string;
  actionLabel: string;
  actionUrl: string;
  onDismiss: () => void;
  onReview?: () => void;
};

/**
 * Screenshot-style actionable toast: light blue card, info icon, Review CTA.
 * On phone: stacks body + full-width CTA so the card stays short and readable.
 */
export function NotificationApprovalToast({
  title,
  body,
  actionLabel,
  actionUrl,
  onDismiss,
  onReview,
}: NotificationApprovalToastProps) {
  return (
    <div
      className={cn(
        "relative w-[min(26rem,calc(100vw-1.5rem))] rounded-xl border border-[#b7d0ea] bg-[#e7f1fb] p-3 shadow-md",
      )}
      role="status"
    >
      <button
        type="button"
        aria-label="Dismiss"
        onClick={onDismiss}
        className="absolute -start-2 -top-2 z-10 inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-500 shadow-sm hover:bg-slate-50"
      >
        <X className="h-3.5 w-3.5" strokeWidth={2.25} />
      </button>

      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:gap-3">
        <div className="flex min-w-0 items-start gap-2.5 sm:items-center sm:gap-3">
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#2f80ed] text-white">
            <Info className="h-4 w-4" strokeWidth={2.5} aria-hidden />
          </span>

          <div className="min-w-0 flex-1 pe-1">
            <div className="text-sm font-bold leading-tight text-[#2b6cb0]">{title}</div>
            <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-[#3d7ab5] sm:line-clamp-3">{body}</p>
          </div>
        </div>

        <Link
          href={actionUrl}
          onClick={onReview}
          className="inline-flex min-h-10 w-full shrink-0 items-center justify-center rounded-full bg-[#4a2c6a] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#3d2459] sm:min-h-0 sm:w-auto"
        >
          {actionLabel}
        </Link>
      </div>
    </div>
  );
}
