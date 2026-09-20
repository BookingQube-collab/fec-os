import { lazyView } from "@/lib/lazy-view";

export default lazyView(() => import("@/views/hr-job-requests-admin-page"), "table");
