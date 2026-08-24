"use client";

import { useTranslation } from "react-i18next";

import { E3TrackerPageShell } from "@/components/compliance-tracker/E3TrackerLayout";
import { AmcDashboardPage } from "@/views/amc-dashboard-page";

export default function E3TrackerAmcDashboardPage() {
  const { t } = useTranslation();
  return (
    <E3TrackerPageShell
      title={t("e3Tracker.pages.amcDashboard.title")}
      subtitle={t("e3Tracker.pages.amcDashboard.subtitle")}
    >
      <AmcDashboardPage embedded />
    </E3TrackerPageShell>
  );
}
