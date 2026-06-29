import { lazyView } from "@/lib/lazy-view";

export default lazyView(() => import("@/views/daily-ops-roster-page"), "dailyOps");
