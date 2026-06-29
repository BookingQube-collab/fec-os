import { lazyView } from "@/lib/lazy-view";

export default lazyView(() => import("@/views/weekly-reports-list-page"), "table");
