import dynamic from "next/dynamic";
import type { ComponentType } from "react";

import {
  RouteLoadingSkeleton,
  type RouteLoadingVariant,
} from "@/components/layout/route-loading";
import { retryImport } from "@/lib/retry-import";

/** Code-split a client view — shows skeleton while the route chunk loads. */
export function lazyView<P = Record<string, never>>(
  loader: () => Promise<{ default: ComponentType<P> }>,
  variant: RouteLoadingVariant = "dashboard",
) {
  return dynamic(() => retryImport(loader), {
    loading: () => <RouteLoadingSkeleton variant={variant} />,
  });
}
