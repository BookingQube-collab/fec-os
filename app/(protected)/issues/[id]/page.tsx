import { lazyView } from "@/lib/lazy-view";

export default lazyView(() => import("@/views/issue-detail-page"), "table");
