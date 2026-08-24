import { lazyView } from "@/lib/lazy-view";

export default lazyView(() => import("@/views/ai-integrations-page"), "dashboard");
