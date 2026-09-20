import { lazyView } from "@/lib/lazy-view";

export default lazyView(() => import("@/views/hr-ot-page"), "table");
