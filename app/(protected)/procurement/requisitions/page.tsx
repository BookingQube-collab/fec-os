import { lazyView } from "@/lib/lazy-view";

const ProcurementRequisitionsPage = lazyView(
  () => import("@/views/procurement-requisitions-page"),
  "table",
);

export default function ProcurementRequisitionsRoutePage() {
  return <ProcurementRequisitionsPage />;
}
