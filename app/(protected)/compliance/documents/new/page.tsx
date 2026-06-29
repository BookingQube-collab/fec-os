import { lazyView } from "@/lib/lazy-view";

export default lazyView(() => import("@/views/compliance-document-new-page"), "table");
