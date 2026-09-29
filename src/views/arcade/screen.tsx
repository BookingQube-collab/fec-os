"use client";

import { usePathname } from "next/navigation";
import { useTranslation } from "react-i18next";

import { ArcadeSubnav } from "@/components/arcade/ui";
import { FecPage } from "@/components/fec";

import { ArcadeDashboard } from "./dashboard";
import { ArcadeFaultDetail, ArcadeFaultForm, ArcadeFaults } from "./faults";
import { ArcadeHistory, ArcadeKnowledge } from "./knowledge";
import { ArcadeMachineDetail, ArcadeMachineForm, ArcadeMachines, ArcadeQrMachine, ArcadeSite, ArcadeSites } from "./machines";
import { ArcadeReports } from "./reports";
import { ArcadeSearch } from "./search";
import { ArcadeDamage, ArcadeInstallations, ArcadeManuals, ArcadeParts, ArcadeSupplier, ArcadeSuppliers, ArcadeSupport, ArcadeSupportForm } from "./supply";
import { ArcadeObservation, ArcadePm, ArcadeWeek } from "./work";

function route(slug: string[]) {
  const [a, b, c] = slug;
  if (!a) return <ArcadeDashboard />;
  if (a === "week") return <ArcadeWeek />;
  if (a === "sites" && b) return <ArcadeSite locationId={b} />;
  if (a === "sites") return <ArcadeSites />;
  if (a === "machines" && b === "new") return <ArcadeMachineForm />;
  if (a === "machines" && b && c === "edit") return <ArcadeMachineForm machineId={b} />;
  if (a === "machines" && b) return <ArcadeMachineDetail id={b} />;
  if (a === "machines") return <ArcadeMachines />;
  if (a === "m" && b) return <ArcadeQrMachine assetCode={decodeURIComponent(b)} />;
  if (a === "faults" && b === "new") return <ArcadeFaultForm />;
  if (a === "faults" && b) return <ArcadeFaultDetail id={b} />;
  if (a === "faults") return <ArcadeFaults />;
  if (a === "pm") return <ArcadePm />;
  if (a === "observation") return <ArcadeObservation />;
  if (a === "suppliers" && b) return <ArcadeSupplier vendorId={b} />;
  if (a === "suppliers") return <ArcadeSuppliers />;
  if (a === "support" && b === "new") return <ArcadeSupportForm />;
  if (a === "support" && b) return <ArcadeSupport id={b} />;
  if (a === "support") return <ArcadeSupport />;
  if (a === "parts") return <ArcadeParts />;
  if (a === "manuals") return <ArcadeManuals />;
  if (a === "installations") return <ArcadeInstallations />;
  if (a === "damage") return <ArcadeDamage />;
  if (a === "history") return <ArcadeHistory />;
  if (a === "reports") return <ArcadeReports />;
  if (a === "search") return <ArcadeSearch />;
  return <UnknownArcade />;
}

function UnknownArcade() {
  const { t } = useTranslation();
  return <ArcadeKnowledge title={t("nav.arcade")} body={t("arcadeOps.unavailable")} />;
}

export default function ArcadeScreen() {
  const pathname = usePathname();
  const slug = pathname.split("/").filter(Boolean).slice(1);
  return (
    <FecPage>
      <ArcadeSubnav />
      {route(slug)}
    </FecPage>
  );
}
