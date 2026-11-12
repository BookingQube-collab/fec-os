import { lazyView } from "@/lib/lazy-view";

export default lazyView(() => import("@/views/ember-profile-page"), "dashboard");
