import { lazyView } from "@/lib/lazy-view";

export default lazyView(() => import("@/views/maintenance-page"), "table");
