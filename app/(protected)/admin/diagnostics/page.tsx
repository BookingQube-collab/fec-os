import { lazyView } from "@/lib/lazy-view";

export default lazyView(() => import("@/views/diagnostics-page"), "dashboard");
