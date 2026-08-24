import { lazyView } from "@/lib/lazy-view";

export default lazyView(() => import("@/views/events-list-page"), "table");
