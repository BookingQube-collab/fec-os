import { lazyView } from "@/lib/lazy-view";

export default lazyView(() => import("@/views/maintenance-executive-report-page"), "table");
