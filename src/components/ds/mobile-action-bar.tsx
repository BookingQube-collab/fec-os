import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** Phone-only action bar. Desktop sidebar stays a separate pattern. */
export function MobileActionBar({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <nav
      aria-label={label}
      className={cn(
        "fixed inset-x-0 bottom-0 z-50 border-t border-border/80 bg-background/95 pb-[max(0.35rem,env(safe-area-inset-bottom))] pt-1 backdrop-blur md:hidden",
        className,
      )}
    >
      <ul className="mx-auto flex max-w-lg items-stretch justify-between gap-1 px-2">{children}</ul>
    </nav>
  );
}
