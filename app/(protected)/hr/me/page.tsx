import { lazyView } from "@/lib/lazy-view";

export default lazyView(() => import("@/views/employee-me-page"), "dashboard");
