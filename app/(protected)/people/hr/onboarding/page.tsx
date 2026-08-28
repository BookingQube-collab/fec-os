import { lazyView } from "@/lib/lazy-view";

export default lazyView(() => import("@/views/hr-onboarding-page"), "table");
