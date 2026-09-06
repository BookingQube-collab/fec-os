import { lazyView } from "@/lib/lazy-view";

export default lazyView(() => import("@/views/staff-roster-register-page"), "table");
