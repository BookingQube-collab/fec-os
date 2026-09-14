import { lazyView } from "@/lib/lazy-view";

export default lazyView(() => import("@/views/corporate-deals-page"), "dashboard");
