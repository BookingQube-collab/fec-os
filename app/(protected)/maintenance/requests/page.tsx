import { lazyView } from "@/lib/lazy-view";

export default lazyView(() => import("@/views/maintenance-requests-page"), "table");
