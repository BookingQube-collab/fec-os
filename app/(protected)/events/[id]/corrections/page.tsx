import { lazyView } from "@/lib/lazy-view";

export default lazyView(() => import("@/views/event-corrections-page"), "table");
