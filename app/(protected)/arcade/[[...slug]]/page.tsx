import { Suspense } from "react";

import { RouteLoadingSkeleton } from "@/components/layout/route-loading";
import { lazyView } from "@/lib/lazy-view";

const ArcadeScreen = lazyView(() => import("@/views/arcade/screen"), "dashboard");

export default function ArcadePage() {
  return (
    <Suspense fallback={<RouteLoadingSkeleton variant="dashboard" />}>
      <ArcadeScreen />
    </Suspense>
  );
}
