import { lazyView } from "@/lib/lazy-view";

export default lazyView(() => import("@/views/call-center-settings-page"), "dashboard");
