import { lazyView } from "@/lib/lazy-view";

export default lazyView(() => import("@/views/roster-history-page"), "table");
