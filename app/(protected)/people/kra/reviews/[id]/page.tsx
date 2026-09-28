import { lazyView } from "@/lib/lazy-view";

export default lazyView(() => import("@/views/kra-scorecard-review-page"), "table");
