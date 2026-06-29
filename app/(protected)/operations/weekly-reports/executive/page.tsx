import { lazyView } from "@/lib/lazy-view";

export default lazyView(() => import("@/views/weekly-reports-executive-page"), "dashboard");
