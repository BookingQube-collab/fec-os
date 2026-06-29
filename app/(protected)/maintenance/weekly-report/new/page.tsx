import { lazyView } from "@/lib/lazy-view";

export default lazyView(() => import("@/views/maintenance-weekly-reports-form-page"), "table");
