import { lazyView } from "@/lib/lazy-view";

export default lazyView(() => import("@/views/ember-search-page"), "dashboard");
