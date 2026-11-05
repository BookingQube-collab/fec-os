import { lazyView } from "@/lib/lazy-view";

export default lazyView(() => import("@/views/people-event-crew-page"), "table");
