import { lazyView } from "@/lib/lazy-view";

export default lazyView(() => import("@/views/amc-contract-detail-route-page"), "table");
