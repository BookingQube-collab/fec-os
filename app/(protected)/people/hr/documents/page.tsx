import { lazyView } from "@/lib/lazy-view";

export default lazyView(() => import("@/views/hr-documents-page"), "table");
