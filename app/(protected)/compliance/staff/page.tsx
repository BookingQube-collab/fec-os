import { lazyView } from "@/lib/lazy-view";

export default lazyView(() => import("@/views/compliance-staff-page"), "table");
