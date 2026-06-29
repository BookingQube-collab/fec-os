import { lazyView } from "@/lib/lazy-view";

export default lazyView(() => import("@/views/risk-register-page"), "table");
