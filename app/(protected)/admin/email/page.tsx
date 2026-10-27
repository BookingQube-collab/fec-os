import { lazyView } from "@/lib/lazy-view";

export default lazyView(() => import("@/views/admin-email-settings-page"), "dashboard");
