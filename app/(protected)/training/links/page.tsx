import { lazyView } from "@/lib/lazy-view";

export default lazyView(() => import("@/views/training-links-page"), "table");
