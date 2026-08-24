import { lazyView } from "@/lib/lazy-view";

export default lazyView(() => import("@/views/attendance-hr-reports-page"), "table");
