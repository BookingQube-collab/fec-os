import { lazyView } from "@/lib/lazy-view";

export default lazyView(() => import("@/views/hr-announcements-page"), "table");
