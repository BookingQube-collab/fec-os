import { lazyView } from "@/lib/lazy-view";

export default lazyView(() => import("@/views/call-center-calls-page"), "dashboard");
