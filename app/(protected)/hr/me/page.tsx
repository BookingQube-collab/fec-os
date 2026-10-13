import { lazyView } from "@/lib/lazy-view";

export const maxDuration = 60;

export default lazyView(() => import("@/views/employee-me-page"), "dashboard");
