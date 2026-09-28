import { lazyView } from "@/lib/lazy-view";

export default lazyView(() => import("@/views/kra-scorecard-page"), "table");
