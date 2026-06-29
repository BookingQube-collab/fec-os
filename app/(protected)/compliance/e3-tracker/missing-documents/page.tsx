import { lazyView } from "@/lib/lazy-view";

export default lazyView(() => import("@/views/e3-tracker-missing-documents-page"), "e3");
