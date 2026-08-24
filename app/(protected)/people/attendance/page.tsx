import { lazyView } from "@/lib/lazy-view";

export default lazyView(() => import("@/views/attendance-hr-dashboard-page"), "dashboard");
