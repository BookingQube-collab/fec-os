import { lazyView } from "@/lib/lazy-view";

export default lazyView(() => import("@/views/performance-scoreboard-page"), "table");
