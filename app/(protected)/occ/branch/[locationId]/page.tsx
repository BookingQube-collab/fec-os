import { lazyView } from "@/lib/lazy-view";

export default lazyView(() => import("@/views/occ-branch-page"), "occ");
