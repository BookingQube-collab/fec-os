import { lazyView } from "@/lib/lazy-view";

export default lazyView(() => import("@/views/e3-tracker-monthly-scheduler-page"), "e3");
