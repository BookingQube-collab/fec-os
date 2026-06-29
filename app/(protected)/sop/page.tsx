import { lazyView } from "@/lib/lazy-view";

export default lazyView(() => import("@/views/sop-page"), "table");
