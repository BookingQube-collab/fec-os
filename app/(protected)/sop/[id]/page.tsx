import { lazyView } from "@/lib/lazy-view";

export default lazyView(() => import("@/views/sop-detail-page"), "table");
