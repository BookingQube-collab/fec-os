import { lazyView } from "@/lib/lazy-view";

export default lazyView(() => import("@/views/amc-dashboard-route-page"), "grid");
