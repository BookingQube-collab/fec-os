import { lazyView } from "@/lib/lazy-view";

export default lazyView(() => import("@/views/hr-quota-page"), "table");
