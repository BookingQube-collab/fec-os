import { lazyView } from "@/lib/lazy-view";

export default lazyView(() => import("@/views/ember-dms-page"), "dashboard");
