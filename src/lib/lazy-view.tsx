import dynamic from "next/dynamic";
import type { ComponentType } from "react";

import {
  RouteLoadingSkeleton,
  type RouteLoadingVariant,
} from "@/components/layout/route-loading";

/** Code-split a client view — shows skeleton while the route chunk loads. */
export function lazyView<P = Record<string, never>>(
  loader: () => Promise<{ default: ComponentType<P> }>,
  variant: RouteLoadingVariant = "dashboard",
) {
  return dynamic(loader, {
    loading: () => <RouteLoadingSkeleton variant={variant} />,
  });
}
