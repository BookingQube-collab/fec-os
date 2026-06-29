import { lazyView } from "@/lib/lazy-view";

export default lazyView(() => import("@/views/compliance-calendar-items-page"), "table");
