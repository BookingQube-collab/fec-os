import { lazyView } from "@/lib/lazy-view";

export default lazyView(() => import("@/views/e3-tracker-amc-dashboard-page"), "e3");
