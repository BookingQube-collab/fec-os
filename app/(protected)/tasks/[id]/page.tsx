import { lazyView } from "@/lib/lazy-view";

export default lazyView(() => import("@/views/task-detail-page"), "table");
