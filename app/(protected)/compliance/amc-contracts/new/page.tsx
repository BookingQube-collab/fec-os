import { lazyView } from "@/lib/lazy-view";

export default lazyView(() => import("@/views/amc-contract-new-page"), "table");
