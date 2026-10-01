import { lazyView } from "@/lib/lazy-view";

export default lazyView(() => import("@/views/admin-locations-page"), "table");
