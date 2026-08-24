import { lazyView } from "@/lib/lazy-view";

export default lazyView(() => import("@/views/events-dashboard-page"), "dashboard");
