import { lazyView } from "@/lib/lazy-view";

export default lazyView(() => import("@/views/admin-livekit-page"), "dashboard");
