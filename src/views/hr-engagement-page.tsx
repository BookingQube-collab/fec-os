"use client";

import { HeartHandshake } from "lucide-react";
import { useTranslation } from "react-i18next";

import { CapabilityGate } from "@/components/auth/capability-gate";
import { HrEmptyState } from "@/components/hr/hr-empty-state";
import { HrPanel } from "@/components/hr/hr-panel";
import { HrSection } from "@/components/hr/hr-section";
import { HrShell } from "@/components/hr/hr-shell";

export default function HrEngagementPage() {
  const { t } = useTranslation();
  return (
    <CapabilityGate
      capability="people.view_roster"
      fallback={
        <HrShell>
          <HrPanel>
            <HrEmptyState message={t("hr.dashboard.noAccess")} />
          </HrPanel>
        </HrShell>
      }
    >
      <HrShell>
        <HrSection icon={HeartHandshake} kicker={t("nav.people")} title={t("nav.hrEngagement")}>
          {null}
        </HrSection>
      </HrShell>
    </CapabilityGate>
  );
}
