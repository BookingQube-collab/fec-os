import { lazyView } from "@/lib/lazy-view";

export default lazyView(() => import("@/views/compliance-command-page"), "dashboard");
