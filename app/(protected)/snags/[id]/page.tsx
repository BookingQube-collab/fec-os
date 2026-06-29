import { lazyView } from "@/lib/lazy-view";

export default lazyView(() => import("@/views/snag-detail-page"), "table");
