import { lazyView } from "@/lib/lazy-view";

export default lazyView(() => import("@/views/compliance-calendar-page"), "table");
