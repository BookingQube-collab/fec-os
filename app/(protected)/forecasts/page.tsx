import { lazyView } from "@/lib/lazy-view";

export default lazyView(() => import("@/views/forecasts-page"), "dashboard");
