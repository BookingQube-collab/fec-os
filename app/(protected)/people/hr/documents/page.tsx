import { lazyView } from "@/lib/lazy-view";

export const maxDuration = 60;

export default lazyView(() => import("@/views/hr-documents-page"), "table");
