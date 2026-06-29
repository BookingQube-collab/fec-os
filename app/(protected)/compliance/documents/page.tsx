import { lazyView } from "@/lib/lazy-view";

export default lazyView(() => import("@/views/compliance-documents-register-page"), "table");
