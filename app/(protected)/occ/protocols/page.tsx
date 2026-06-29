import { lazyView } from "@/lib/lazy-view";

export default lazyView(() => import("@/views/occ-protocols-page"), "occ");
