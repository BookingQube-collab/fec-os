import { lazyView } from "@/lib/lazy-view";

export default lazyView(() => import("@/views/training-questions-page"), "table");
