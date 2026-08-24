import { lazyView } from "@/lib/lazy-view";

export default lazyView(() => import("@/views/performance-staff-profile-page"), "table");
