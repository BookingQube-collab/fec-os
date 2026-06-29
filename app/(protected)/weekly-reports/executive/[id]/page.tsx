import { lazyView } from "@/lib/lazy-view";

export default lazyView(() => import("@/views/executive-weekly-report-page"), "table");
