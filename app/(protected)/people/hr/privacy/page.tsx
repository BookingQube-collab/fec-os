import { lazyView } from "@/lib/lazy-view";

export default lazyView(() => import("@/views/hr-privacy-page"), "table");
