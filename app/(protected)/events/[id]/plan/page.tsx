import { lazyView } from "@/lib/lazy-view";

export default lazyView(() => import("@/views/event-plan-page"), "table");
