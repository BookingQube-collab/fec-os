import { lazyView } from "@/lib/lazy-view";

export default lazyView(() => import("@/views/performance-evaluation-page"), "table");
