import { lazyView } from "@/lib/lazy-view";

export default lazyView(() => import("@/views/revenue-page"), "dashboard");
