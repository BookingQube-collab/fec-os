import { lazyView } from "@/lib/lazy-view";

export default lazyView(() => import("@/views/supervisor-checklist-page"), "table");
