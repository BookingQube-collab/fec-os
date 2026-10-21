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
        "relative w-[min(26rem,calc(100vw-1.5rem))] rounded-xl border border-[#b7d0ea] bg-[#e7f1fb] p-3 pe-3 ps-3 shadow-md",
      )}
      role="status"
    >
      <button
        type="button"
        aria-label="Dismiss"
        onClick={onDismiss}
        className="absolute -start-2 -top-2 inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-500 shadow-sm hover:bg-slate-50"
      >
        <X className="h-3.5 w-3.5" strokeWidth={2.25} />
      </button>

      <div className="flex items-center gap-3">
        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#2f80ed] text-white">
          <Info className="h-4 w-4" strokeWidth={2.5} aria-hidden />
        </span>

        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold leading-tight text-[#2b6cb0]">{title}</div>
          <p className="mt-1 text-xs leading-snug text-[#3d7ab5]">{body}</p>
        </div>

        <Link
          href={actionUrl}
          onClick={onReview}
          className="inline-flex shrink-0 items-center justify-center rounded-full bg-[#4a2c6a] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#3d2459]"
        >
          {actionLabel}
        </Link>
      </div>
    </div>
  );
}
