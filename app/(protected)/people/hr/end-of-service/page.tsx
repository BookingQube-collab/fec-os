import { lazyView } from "@/lib/lazy-view";

export default lazyView(() => import("@/views/hr-end-of-service-page"), "table");
