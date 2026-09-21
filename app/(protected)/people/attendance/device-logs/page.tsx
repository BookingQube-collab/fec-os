import { lazyView } from "@/lib/lazy-view";

export default lazyView(() => import("@/views/attendance-hr-device-logs-page"), "table");
