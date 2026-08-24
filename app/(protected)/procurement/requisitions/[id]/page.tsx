import { lazyView } from "@/lib/lazy-view";

export default lazyView(() => import("@/views/procurement-requisition-detail-page"), "table");
