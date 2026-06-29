import { lazyView } from "@/lib/lazy-view";

export default lazyView(() => import("@/views/supervisor-console-page"), "table");
