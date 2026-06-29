"use client";

import { E3TrackerPageShell } from "@/components/compliance-tracker/E3TrackerLayout";
import { AmcDashboardPage } from "@/views/amc-dashboard-page";

export default function E3TrackerAmcDashboardPage() {
  return (
    <E3TrackerPageShell
      title="AMC Contracts"
      subtitle="Site-wise contracts, payment tracker, service visits, and renewals across all FEC locations."
    >
      <AmcDashboardPage embedded />
    </E3TrackerPageShell>
  );
}
