import { lazyView } from "@/lib/lazy-view";

export default lazyView(() => import("@/views/training-learning-outline-page"), "table");
