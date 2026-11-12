import { lazyView } from "@/lib/lazy-view";

export default lazyView(() => import("@/views/admin-call-center-page"), "dashboard");
