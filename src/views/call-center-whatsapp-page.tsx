"use client";

import { MessageCircle } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useAuth } from "@/hooks/use-auth";
import { canUserDo } from "@/lib/rbac";
import { CallCenterShell } from "@/views/call-center-section-nav";

function CallCenterWhatsappPage() {
  const { t } = useTranslation();
  const { roles } = useAuth();
  const canUse = canUserDo(
    roles.map((r) => r.role),
    "call_center.view",
  );

  if (!canUse) {
    return (
      <CallCenterShell titleKey="callCenter.whatsappTitle" subtitleKey="callCenter.whatsappSubtitle">
        <p className="text-sm text-muted-foreground">{t("callCenter.forbidden")}</p>
      </CallCenterShell>
    );
  }

  return (
    <CallCenterShell titleKey="callCenter.whatsappTitle" subtitleKey="callCenter.whatsappSubtitle">
      <section className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
        <MessageCircle className="mx-auto h-10 w-10 text-muted-foreground" aria-hidden />
        <h2 className="mt-4 text-lg font-semibold">{t("callCenter.whatsappComing")}</h2>
        <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">
          {t("callCenter.whatsappBody")}
        </p>
        <ul className="mx-auto mt-6 max-w-md space-y-2 text-start text-sm text-muted-foreground">
          <li>• {t("callCenter.whatsappItem1")}</li>
          <li>• {t("callCenter.whatsappItem2")}</li>
          <li>• {t("callCenter.whatsappItem3")}</li>
        </ul>
      </section>
    </CallCenterShell>
  );
}

export default CallCenterWhatsappPage;
