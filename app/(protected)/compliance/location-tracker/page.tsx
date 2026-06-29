import { lazyView } from "@/lib/lazy-view";

export default lazyView(() => import("@/views/location-compliance-tracker-page"), "dashboard");
