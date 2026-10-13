import { lazyView } from "@/lib/lazy-view";

export const maxDuration = 60;

export default lazyView(() => import("@/views/people-page"), "table");
