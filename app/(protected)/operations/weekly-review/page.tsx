import { lazyView } from "@/lib/lazy-view";

export default lazyView(() => import("@/views/weekly-review-page"), "dashboard");
