import { lazyView } from "@/lib/lazy-view";

export default lazyView(() => import("@/views/procurement-compliance-page"), "table");
