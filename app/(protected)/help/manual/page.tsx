import { redirect } from "next/navigation";

import { OPS_MANUAL_URL } from "@/lib/ops-manual";

/** In-app entry point for the MkDocs operations manual (external site). */
export default function HelpManualPage() {
  redirect(OPS_MANUAL_URL);
}
