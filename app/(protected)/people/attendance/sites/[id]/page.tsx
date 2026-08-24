import { lazyView } from "@/lib/lazy-view";

export default lazyView(() => import("@/views/attendance-hr-site-page"), "dashboard");
