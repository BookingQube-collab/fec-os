import { lazyView } from "@/lib/lazy-view";

export default lazyView(() => import("@/views/hr-ats-candidate-detail-page"), "table");
