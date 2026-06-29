import { lazyView } from "@/lib/lazy-view";

export default lazyView(() => import("@/views/planned-notifications-page"), "table");
