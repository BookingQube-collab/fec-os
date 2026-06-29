import { lazyView } from "@/lib/lazy-view";

export default lazyView(() => import("@/views/notifications-page"), "table");
