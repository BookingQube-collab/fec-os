import { lazyView } from "@/lib/lazy-view";

export default lazyView(() => import("@/views/daily-ops-complaints-page"), "dailyOps");
