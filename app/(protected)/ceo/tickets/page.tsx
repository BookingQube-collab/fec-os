import { lazyView } from "@/lib/lazy-view";

export default lazyView(() => import("@/views/ceo-tickets-page"), "table");
