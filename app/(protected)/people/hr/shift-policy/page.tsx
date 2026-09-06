import { lazyView } from "@/lib/lazy-view";

export default lazyView(() => import("@/views/hr-shift-policy-page"), "table");
