import { lazyView } from "@/lib/lazy-view";

export default lazyView(() => import("@/views/api-explorer-page"), "table");
