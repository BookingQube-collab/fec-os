import { lazyView } from "@/lib/lazy-view";

export default lazyView(() => import("@/views/event-schedule-page"), "table");
