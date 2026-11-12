import { lazyView } from "@/lib/lazy-view";

export default lazyView(() => import("@/views/ember-bots-page"), "dashboard");
