import { lazyView } from "@/lib/lazy-view";

export default lazyView(() => import("@/views/maintenance-weekly-reports-list-page"), "table");
