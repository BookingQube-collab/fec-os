"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { FecButton as Button, FecLoader } from "@/components/fec";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/hooks/use-auth";
import {
  loadCallCenterQualityBundle,
  removeCallCenterQaTemplate,
  saveCallCenterQaEvaluation,
  saveCallCenterQaTemplate,
} from "@/lib/call-center/call-center.functions";
import type { CallCenterQaTemplate } from "@/lib/call-center/types";
import { canUserDo } from "@/lib/rbac";
import { CallCenterShell } from "@/views/call-center-section-nav";

function CallCenterQualityPage() {
  const { t } = useTranslation();
  const { roles } = useAuth();
  const queryClient = useQueryClient();
  const roleNames = roles.map((r) => r.role);
  const maxLevel = roles.reduce((acc, role) => Math.max(acc, role.role_level), 0);
  const canUse = canUserDo(roleNames, "call_center.view");
  const canEdit = canUserDo(roleNames, "admin.view") && maxLevel >= 95;

  const [templateName, setTemplateName] = useState("");
  const [criteriaLabels, setCriteriaLabels] = useState("");
  const [templateActive, setTemplateActive] = useState(true);

  const [evalCallId, setEvalCallId] = useState("");
  const [evalTemplateId, setEvalTemplateId] = useState<string>("");
  const [evalNotes, setEvalNotes] = useState("");
  const [scores, setScores] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);

  const bundle = useQuery({
    queryKey: ["call-center", "quality"],
    enabled: canUse,
    queryFn: async () => {
      const result = await loadCallCenterQualityBundle({});
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
  });

  const selectedTemplate: CallCenterQaTemplate | undefined = useMemo(
    () => bundle.data?.templates.find((tpl) => tpl.id === evalTemplateId),
    [bundle.data?.templates, evalTemplateId],
  );

  if (!canUse) {
    return (
      <CallCenterShell titleKey="callCenter.qualityTitle" subtitleKey="callCenter.qualitySubtitle">
        <p className="text-sm text-muted-foreground">{t("callCenter.forbidden")}</p>
      </CallCenterShell>
    );
  }

  return (
    <CallCenterShell titleKey="callCenter.qualityTitle" subtitleKey="callCenter.qualitySubtitle">
      {bundle.isLoading ? (
        <div className="flex justify-center py-16">
          <FecLoader density="page" />
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          <div className="space-y-4">
            {canEdit ? (
              <section className="rounded-2xl border border-border/50 bg-card p-4">
                <h2 className="text-sm font-semibold">{t("callCenter.qaNewTemplate")}</h2>
                <div className="mt-3 space-y-3">
                  <div>
                    <Label>{t("callCenterAdmin.label")}</Label>
                    <Input
                      className="mt-1"
                      value={templateName}
                      onChange={(e) => setTemplateName(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>{t("callCenter.qaCriteriaLabels")}</Label>
                    <Input
                      className="mt-1"
                      value={criteriaLabels}
                      onChange={(e) => setCriteriaLabels(e.target.value)}
                      placeholder={t("callCenter.qaCriteriaPlaceholder")}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor="qa-active">{t("callCenter.qaTemplateActive")}</Label>
                    <Switch
                      id="qa-active"
                      checked={templateActive}
                      onCheckedChange={setTemplateActive}
                    />
                  </div>
                  <Button
                    type="button"
                    disabled={pending || !templateName.trim()}
                    onClick={() => {
                      void (async () => {
                        setPending(true);
                        try {
                          const result = await saveCallCenterQaTemplate({
                            name: templateName.trim(),
                            criteriaLabels,
                            isActive: templateActive,
                          });
                          if (!result.ok) throw new Error(result.error);
                          toast.success(t("callCenter.qaTemplateSaved"));
                          setTemplateName("");
                          setCriteriaLabels("");
                          await queryClient.invalidateQueries({ queryKey: ["call-center", "quality"] });
                        } catch (error) {
                          toast.error(error instanceof Error ? error.message : t("callCenter.loadError"));
                        } finally {
                          setPending(false);
                        }
                      })();
                    }}
                  >
                    {t("callCenter.qaSaveTemplate")}
                  </Button>
                </div>
              </section>
            ) : null}

            <section className="rounded-2xl border border-border/50 bg-card/60">
              <h2 className="border-b border-border/40 px-4 py-3 text-sm font-semibold">
                {t("callCenter.qaTemplates")}
              </h2>
              {(bundle.data?.templates ?? []).length === 0 ? (
                <p className="p-6 text-sm text-muted-foreground">{t("callCenter.qaTemplatesEmpty")}</p>
              ) : (
                <ul className="divide-y divide-border/50">
                  {(bundle.data?.templates ?? []).map((tpl) => (
                    <li key={tpl.id} className="flex items-start gap-3 px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{tpl.name}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {tpl.criteria.map((c) => c.label).join(" · ") || "—"}
                        </p>
                      </div>
                      {canEdit ? (
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          onClick={() => {
                            void (async () => {
                              const result = await removeCallCenterQaTemplate({ id: tpl.id });
                              if (!result.ok) toast.error(result.error);
                              else {
                                toast.success(t("callCenter.qaTemplateRemoved"));
                                await queryClient.invalidateQueries({ queryKey: ["call-center", "quality"] });
                              }
                            })();
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <div className="space-y-4">
            <section className="rounded-2xl border border-border/50 bg-card p-4">
              <h2 className="text-sm font-semibold">{t("callCenter.qaScoreCall")}</h2>
              <div className="mt-3 space-y-3">
                <div>
                  <Label>{t("callCenter.qaCallId")}</Label>
                  <Input
                    className="mt-1 font-mono text-xs"
                    value={evalCallId}
                    onChange={(e) => setEvalCallId(e.target.value)}
                    placeholder="uuid"
                  />
                </div>
                <div>
                  <Label>{t("callCenter.qaPickTemplate")}</Label>
                  <select
                    className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={evalTemplateId}
                    onChange={(e) => {
                      setEvalTemplateId(e.target.value);
                      setScores({});
                    }}
                  >
                    <option value="">{t("callCenter.qaNoTemplate")}</option>
                    {(bundle.data?.templates ?? []).map((tpl) => (
                      <option key={tpl.id} value={tpl.id}>
                        {tpl.name}
                      </option>
                    ))}
                  </select>
                </div>
                {selectedTemplate?.criteria.map((c) => (
                  <div key={c.id}>
                    <Label>
                      {c.label} (0–{c.maxScore})
                    </Label>
                    <Input
                      className="mt-1"
                      type="number"
                      min={0}
                      max={c.maxScore}
                      value={scores[c.id] ?? ""}
                      onChange={(e) =>
                        setScores((prev) => ({ ...prev, [c.id]: e.target.value }))
                      }
                    />
                  </div>
                ))}
                <div>
                  <Label>{t("callCenter.notes")}</Label>
                  <Input
                    className="mt-1"
                    value={evalNotes}
                    onChange={(e) => setEvalNotes(e.target.value)}
                  />
                </div>
                <Button
                  type="button"
                  disabled={pending || !evalCallId.trim()}
                  onClick={() => {
                    void (async () => {
                      setPending(true);
                      try {
                        const parsedScores: Record<string, number> = {};
                        for (const [key, raw] of Object.entries(scores)) {
                          const n = Number(raw);
                          if (!Number.isNaN(n)) parsedScores[key] = n;
                        }
                        const result = await saveCallCenterQaEvaluation({
                          callId: evalCallId.trim(),
                          templateId: evalTemplateId || null,
                          scores: parsedScores,
                          notes: evalNotes,
                        });
                        if (!result.ok) throw new Error(result.error);
                        toast.success(t("callCenter.qaEvaluationSaved"));
                        setEvalCallId("");
                        setEvalNotes("");
                        setScores({});
                        await queryClient.invalidateQueries({ queryKey: ["call-center", "quality"] });
                      } catch (error) {
                        toast.error(error instanceof Error ? error.message : t("callCenter.loadError"));
                      } finally {
                        setPending(false);
                      }
                    })();
                  }}
                >
                  {t("callCenter.qaSubmitEvaluation")}
                </Button>
              </div>
            </section>

            <section className="rounded-2xl border border-border/50 bg-card/60">
              <h2 className="border-b border-border/40 px-4 py-3 text-sm font-semibold">
                {t("callCenter.qaRecentEvaluations")}
              </h2>
              {(bundle.data?.evaluations ?? []).length === 0 ? (
                <p className="p-6 text-sm text-muted-foreground">{t("callCenter.qaEvaluationsEmpty")}</p>
              ) : (
                <ul className="divide-y divide-border/50">
                  {(bundle.data?.evaluations ?? []).map((ev) => (
                    <li key={ev.id} className="px-4 py-3 text-sm">
                      <p className="font-mono text-xs text-muted-foreground">{ev.callId}</p>
                      <p className="mt-1">
                        {t("callCenter.qaTotalScore", { score: ev.totalScore })}
                        {ev.notes ? ` · ${ev.notes}` : ""}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      )}
    </CallCenterShell>
  );
}

export default CallCenterQualityPage;