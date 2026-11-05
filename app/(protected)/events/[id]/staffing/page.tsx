import { lazyView } from "@/lib/lazy-view";

export default lazyView(() => import("@/views/event-staffing-page"), "table");
