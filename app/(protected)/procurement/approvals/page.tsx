import { lazyView } from "@/lib/lazy-view";

export default lazyView(() => import("@/views/procurement-approvals-page"), "table");
