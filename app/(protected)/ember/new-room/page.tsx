import { lazyView } from "@/lib/lazy-view";

export default lazyView(() => import("@/views/ember-new-room-page"), "dashboard");
