import { lazyView } from "@/lib/lazy-view";

export default lazyView(() => import("@/views/issues-page"), "table");
