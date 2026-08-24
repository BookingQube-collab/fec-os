import { lazyView } from "@/lib/lazy-view";

export default lazyView(() => import("@/views/procurement-dashboard-page"), "dashboard");
