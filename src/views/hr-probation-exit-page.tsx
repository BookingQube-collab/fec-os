"use client";

import { LogOut } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslation } from "react-i18next";

import { HrSection } from "@/components/hr/hr-section";
import { HrShell } from "@/components/hr/hr-shell";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import HrProbationPage from "@/views/hr-probation-page";
import HrResignationsPage from "@/views/hr-resignations-page";
import HrTerminationsPage from "@/views/hr-terminations-page";

export const PROBATION_EXIT_HREF = "/people/hr/probation-exit";

export const PROBATION_EXIT_TABS = ["probation", "resignation", "termination"] as const;

export type ProbationExitTab = (typeof PROBATION_EXIT_TABS)[number];

export function probationExitHref(tab: ProbationExitTab): string {
  return `${PROBATION_EXIT_HREF}?tab=${tab}`;
}

function parseTab(value: string | null): ProbationExitTab {
  return PROBATION_EXIT_TABS.includes(value as ProbationExitTab) ? (value as ProbationExitTab) : "probation";
}

export default function HrProbationExitPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = parseTab(searchParams.get("tab"));

  const setTab = (next: string) => {
    if (!PROBATION_EXIT_TABS.includes(next as ProbationExitTab)) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", next);
    router.replace(`${PROBATION_EXIT_HREF}?${params.toString()}`, { scroll: false });
  };

  return (
    <HrShell>
      <HrSection
        icon={LogOut}
        kicker={t("hrWorkspace.probationExit.kicker")}
        title={t("hrWorkspace.probationExit.title")}
        subtitle={t("hrWorkspace.probationExit.subtitle")}
      >
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList aria-label={t("hrWorkspace.probationExit.tabsLabel")} className="max-w-full">
            <TabsTrigger value="probation">{t("hrWorkspace.probationExit.tabs.probation")}</TabsTrigger>
            <TabsTrigger value="resignation">{t("hrWorkspace.probationExit.tabs.resignation")}</TabsTrigger>
            <TabsTrigger value="termination">{t("hrWorkspace.probationExit.tabs.termination")}</TabsTrigger>
          </TabsList>
          <TabsContent value="probation" className="min-w-0">
            <HrProbationPage embedded />
          </TabsContent>
          <TabsContent value="resignation" className="min-w-0">
            <HrResignationsPage embedded />
          </TabsContent>
          <TabsContent value="termination" className="min-w-0">
            <HrTerminationsPage embedded />
          </TabsContent>
        </Tabs>
      </HrSection>
    </HrShell>
  );
}
