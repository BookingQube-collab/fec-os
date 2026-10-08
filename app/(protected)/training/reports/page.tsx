import { lazyView } from "@/lib/lazy-view";

export default lazyView(() => import("@/views/training-reports-page"), "table");
