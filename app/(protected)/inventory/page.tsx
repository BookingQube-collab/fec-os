import { lazyView } from "@/lib/lazy-view";

export default lazyView(() => import("@/views/inventory-page"), "table");
