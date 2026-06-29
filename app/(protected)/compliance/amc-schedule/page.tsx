import { lazyView } from "@/lib/lazy-view";

export default lazyView(() => import("@/views/amc-schedule-page"), "table");
