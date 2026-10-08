import { lazyView } from "@/lib/lazy-view";

export default lazyView(() => import("@/views/training-assignments-page"), "table");
