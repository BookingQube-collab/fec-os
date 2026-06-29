import { lazyView } from "@/lib/lazy-view";

export default lazyView(() => import("@/views/decisions-page"), "table");
