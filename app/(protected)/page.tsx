import { lazyView } from "@/lib/lazy-view";

export default lazyView(() => import("@/views/home-page"), "dashboard");
