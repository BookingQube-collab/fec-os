import { lazyView } from "@/lib/lazy-view";

export default lazyView(() => import("@/views/leaderboard-page"), "table");
