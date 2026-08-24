import { lazyView } from "@/lib/lazy-view";

export default lazyView(() => import("@/views/event-scope-page"), "dashboard");
