import { lazyView } from "@/lib/lazy-view";

export default lazyView(() => import("@/views/chat-page"), "table");
