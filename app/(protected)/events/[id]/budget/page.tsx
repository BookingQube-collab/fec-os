import { lazyView } from "@/lib/lazy-view";

export default lazyView(() => import("@/views/event-budget-page"), "table");
