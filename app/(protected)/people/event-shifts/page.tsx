import { lazyView } from "@/lib/lazy-view";

export default lazyView(() => import("@/views/people-event-shifts-page"), "table");
