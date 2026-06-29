import { lazyView } from "@/lib/lazy-view";

export default lazyView(() => import("@/views/utilities-page"), "table");
