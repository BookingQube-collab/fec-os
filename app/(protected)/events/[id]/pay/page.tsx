import { lazyView } from "@/lib/lazy-view";

export default lazyView(() => import("@/views/event-payroll-page"), "table");
