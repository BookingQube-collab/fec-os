"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  Eye,
  EyeOff,
  Loader2,
  RefreshCw,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { PageHeader } from "@/components/layout/page-header";
import { NeumorphicCard } from "@/components/dashboard/neumorphic-card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAiIntegrations } from "@/hooks/queries/useAiIntegrations";
import { useAuth } from "@/hooks/use-auth";
import { apiDelete, apiPatch, apiPost } from "@/lib/api-client";
import type {
  AiIntegrationsSnapshot,
  AiProviderCode,
  AiProviderPublicConfig,
  AiRoutingSettings,
} from "@/lib/ai/types";
import { queryKeys } from "@/lib/query-keys";

const NONE = "__none__";
const MANUAL = "__manual__";

type ProviderDraft = {
  apiKey: string;
  showKey: boolean;
  selectedModel: string;
  manualModel: string;
  useManual: boolean;
};

function emptyDraft(provider: AiProviderPublicConfig): ProviderDraft {
  const known = provider.models.some((m) => m.id === provider.selected_model);
  return {
    apiKey: "",
    showKey: false,
    selectedModel: known ? provider.selected_model ?? "" : MANUAL,
    manualModel: known ? "" : provider.selected_model ?? "",
    useManual: !known,
  };
}

function statusVariant(status: string): "success" | "warning" | "destructive" | "muted" | "info" {
  if (status === "connected") return "success";
  if (status === "failed") return "destructive";
  if (status === "disabled") return "muted";
  if (status === "untested") return "warning";
  return "info";
}

function ProviderMark({ code }: { code: AiProviderCode }) {
  const letter = code === "gemini" ? "G" : code === "groq" ? "Q" : "O";
  const tone =
    code === "gemini"
      ? "bg-emerald-600/15 text-emerald-700 dark:text-emerald-300"
      : code === "groq"
        ? "bg-orange-500/15 text-orange-700 dark:text-orange-300"
        : "bg-violet-500/15 text-violet-700 dark:text-violet-300";
  return (
    <span
      className={`flex h-10 w-10 items-center justify-center rounded-2xl text-sm font-bold ${tone}`}
      aria-hidden
    >
      {letter}
    </span>
  );
}

function AiIntegrationsPage() {
  const { t } = useTranslation();
  const { roles } = useAuth();
  const maxLevel = roles.reduce((acc, r) => Math.max(acc, r.role_level), 0);
  const canManage = maxLevel >= 95;
  const qc = useQueryClient();
  const query = useAiIntegrations({ enabled: canManage });
  const data = query.data;

  const [drafts, setDrafts] = useState<Partial<Record<AiProviderCode, ProviderDraft>>>({});
  const [removeTarget, setRemoveTarget] = useState<AiProviderCode | null>(null);
  const [replaceTarget, setReplaceTarget] = useState<AiProviderCode | null>(null);
  const [routingDraft, setRoutingDraft] = useState<AiRoutingSettings | null>(null);

  const routing = routingDraft ?? data?.routing ?? null;

  function draftFor(provider: AiProviderPublicConfig): ProviderDraft {
    return drafts[provider.provider_code] ?? emptyDraft(provider);
  }

  function patchDraft(code: AiProviderCode, patch: Partial<ProviderDraft>) {
    setDrafts((prev) => ({
      ...prev,
      [code]: { ...(prev[code] ?? emptyDraft(data!.providers.find((p) => p.provider_code === code)!)), ...patch },
    }));
  }

  function isDirty(provider: AiProviderPublicConfig) {
    const draft = draftFor(provider);
    const model = draft.useManual || draft.selectedModel === MANUAL ? draft.manualModel.trim() : draft.selectedModel;
    return Boolean(draft.apiKey.trim()) || model !== (provider.selected_model ?? "");
  }

  const invalidate = () => qc.invalidateQueries({ queryKey: queryKeys.admin.aiIntegrations() });

  const saveMut = useMutation({
    mutationFn: (body: { provider_code: AiProviderCode; api_key?: string; selected_model?: string }) =>
      apiPost("/api/admin/ai-integrations", body),
    onSuccess: (_res, vars) => {
      toast.success(t("aiIntegrations.toasts.saved"));
      setDrafts((prev) => {
        const current = prev[vars.provider_code];
        if (!current) return prev;
        return { ...prev, [vars.provider_code]: { ...current, apiKey: "", showKey: false } };
      });
      void invalidate();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const testMut = useMutation({
    mutationFn: (body: { provider_code: AiProviderCode; api_key?: string }) =>
      apiPost<{ ok: boolean; error?: string }>("/api/admin/ai-integrations/test", body),
    onSuccess: (res) => {
      if (res.ok) toast.success(t("aiIntegrations.toasts.testOk"));
      else toast.error(res.error ?? t("aiIntegrations.toasts.testFail"));
      void invalidate();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const modelsMut = useMutation({
    mutationFn: (body: { provider_code: AiProviderCode }) =>
      apiPost("/api/admin/ai-integrations/models", body),
    onSuccess: () => {
      toast.success(t("aiIntegrations.toasts.modelsRefreshed"));
      void invalidate();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const enableMut = useMutation({
    mutationFn: (body: { provider_code: AiProviderCode; enabled: boolean }) =>
      apiPatch("/api/admin/ai-integrations/enable", body),
    onSuccess: () => void invalidate(),
    onError: (e) => toast.error((e as Error).message),
  });

  const removeMut = useMutation({
    mutationFn: (body: { provider_code: AiProviderCode }) =>
      apiDelete("/api/admin/ai-integrations/key", body),
    onSuccess: () => {
      toast.success(t("aiIntegrations.toasts.keyRemoved"));
      setRemoveTarget(null);
      void invalidate();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const routingMut = useMutation({
    mutationFn: (body: AiRoutingSettings) => apiPatch("/api/admin/ai-integrations/routing", body),
    onSuccess: () => {
      toast.success(t("aiIntegrations.toasts.routingSaved"));
      setRoutingDraft(null);
      void invalidate();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const eligible = useMemo(
    () => (data?.providers ?? []).filter((p) => p.routing_eligible).map((p) => p.provider_code),
    [data],
  );

  if (!canManage) {
    return (
      <div className="space-y-5">
        <PageHeader icon={Sparkles} kicker={t("aiIntegrations.kicker")} title={t("aiIntegrations.title")} />
        <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          {t("aiIntegrations.forbidden")}
        </p>
      </div>
    );
  }

  if (query.isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 p-16 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        {t("aiIntegrations.loading")}
      </div>
    );
  }

  if (query.isError || !data) {
    return (
      <div className="space-y-5">
        <PageHeader icon={Sparkles} kicker={t("aiIntegrations.kicker")} title={t("aiIntegrations.title")} />
        <p className="text-sm text-destructive">{(query.error as Error | undefined)?.message ?? t("aiIntegrations.loadError")}</p>
      </div>
    );
  }

  const routingDirty = routingDraft != null && JSON.stringify(routingDraft) !== JSON.stringify(data.routing);

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Sparkles}
        kicker={t("aiIntegrations.kicker")}
        title={t("aiIntegrations.title")}
        subtitle={t("aiIntegrations.subtitle")}
      />

      {!data.encryption_configured ? (
        <div className="rounded-2xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {t("aiIntegrations.encryptionMissing")}
        </div>
      ) : null}

      <p className="text-xs text-muted-foreground">{t("aiIntegrations.disclaimer")}</p>

      <Tabs defaultValue="providers">
        <TabsList>
          <TabsTrigger value="providers">{t("aiIntegrations.tabs.providers")}</TabsTrigger>
          <TabsTrigger value="routing">{t("aiIntegrations.tabs.routing")}</TabsTrigger>
          <TabsTrigger value="usage">{t("aiIntegrations.tabs.usage")}</TabsTrigger>
        </TabsList>

        <TabsContent value="providers" className="mt-5 space-y-4">
          <div className="grid gap-4 xl:grid-cols-3">
            {data.providers.map((provider) => {
              const catalog = data.catalog.find((c) => c.code === provider.provider_code);
              const draft = draftFor(provider);
              const dirty = isDirty(provider);
              const pending =
                (saveMut.isPending && saveMut.variables?.provider_code === provider.provider_code) ||
                (testMut.isPending && testMut.variables?.provider_code === provider.provider_code) ||
                (modelsMut.isPending && modelsMut.variables?.provider_code === provider.provider_code) ||
                (enableMut.isPending && enableMut.variables?.provider_code === provider.provider_code);
              const modelValue = draft.useManual || draft.selectedModel === MANUAL ? draft.manualModel.trim() : draft.selectedModel;
              const steps = t(`aiIntegrations.howto.${provider.provider_code}`, { returnObjects: true }) as string[];

              return (
                <NeumorphicCard key={provider.id} className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <ProviderMark code={provider.provider_code} />
                      <div className="min-w-0">
                        <h2 className="text-sm font-semibold">{catalog?.displayName ?? provider.display_name}</h2>
                        <p className="mt-1 text-xs text-muted-foreground">{catalog?.description}</p>
                      </div>
                    </div>
                    <Badge variant={statusVariant(provider.connection_status)}>
                      {t(`aiIntegrations.status.${provider.connection_status}`)}
                    </Badge>
                  </div>

                  <div className="mt-4 flex items-center justify-between gap-3">
                    <Label htmlFor={`enable-${provider.provider_code}`} className="text-xs">
                      {t("aiIntegrations.enable")}
                    </Label>
                    <Switch
                      id={`enable-${provider.provider_code}`}
                      checked={provider.enabled}
                      disabled={!provider.key_last_four || pending}
                      onCheckedChange={(enabled) =>
                        enableMut.mutate({ provider_code: provider.provider_code, enabled })
                      }
                    />
                  </div>

                  <div className="mt-4 space-y-2">
                    <Label htmlFor={`key-${provider.provider_code}`}>{t("aiIntegrations.apiKey")}</Label>
                    {provider.key_masked ? (
                      <p className="font-mono text-xs text-muted-foreground" aria-live="polite">
                        {t("aiIntegrations.savedKey")}: {provider.key_masked}
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground">{t("aiIntegrations.noKey")}</p>
                    )}
                    <div className="relative">
                      <Input
                        id={`key-${provider.provider_code}`}
                        type={draft.showKey ? "text" : "password"}
                        autoComplete="off"
                        spellCheck={false}
                        placeholder={provider.key_last_four ? t("aiIntegrations.replaceKeyPlaceholder") : t("aiIntegrations.keyPlaceholder")}
                        value={draft.apiKey}
                        onChange={(e) => patchDraft(provider.provider_code, { apiKey: e.target.value })}
                      />
                      {draft.apiKey ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="absolute end-1 top-1/2 h-8 w-8 -translate-y-1/2"
                          onClick={() => patchDraft(provider.provider_code, { showKey: !draft.showKey })}
                          aria-label={draft.showKey ? t("aiIntegrations.hideKey") : t("aiIntegrations.showKey")}
                        >
                          {draft.showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-4 space-y-2">
                    <Label>{t("aiIntegrations.defaultModel")}</Label>
                    <Select
                      value={draft.useManual ? MANUAL : draft.selectedModel || MANUAL}
                      onValueChange={(value) =>
                        patchDraft(provider.provider_code, {
                          selectedModel: value,
                          useManual: value === MANUAL,
                        })
                      }
                    >
                      <SelectTrigger aria-label={t("aiIntegrations.defaultModel")}>
                        <SelectValue placeholder={t("aiIntegrations.selectModel")} />
                      </SelectTrigger>
                      <SelectContent>
                        {provider.models.map((model) => (
                          <SelectItem key={model.id} value={model.id}>
                            {model.displayName}
                          </SelectItem>
                        ))}
                        <SelectItem value={MANUAL}>{t("aiIntegrations.manualModel")}</SelectItem>
                      </SelectContent>
                    </Select>
                    {draft.useManual || draft.selectedModel === MANUAL ? (
                      <Input
                        value={draft.manualModel}
                        onChange={(e) => patchDraft(provider.provider_code, { manualModel: e.target.value, useManual: true })}
                        placeholder={t("aiIntegrations.manualModelPlaceholder")}
                      />
                    ) : null}
                  </div>

                  {provider.last_tested_at ? (
                    <p className="mt-3 text-xs text-muted-foreground">
                      {t("aiIntegrations.lastTested")}: {new Date(provider.last_tested_at).toLocaleString()}
                    </p>
                  ) : null}
                  {provider.last_test_result ? (
                    <p className="mt-1 text-xs text-muted-foreground">{provider.last_test_result}</p>
                  ) : null}

                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      disabled={!dirty || pending}
                      onClick={() => {
                        const payload = {
                          provider_code: provider.provider_code,
                          selected_model: modelValue || undefined,
                          api_key: draft.apiKey.trim() || undefined,
                        };
                        if (draft.apiKey.trim() && provider.key_last_four) {
                          setReplaceTarget(provider.provider_code);
                          return;
                        }
                        saveMut.mutate(payload);
                      }}
                    >
                      {saveMut.isPending && saveMut.variables?.provider_code === provider.provider_code ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4" />
                      )}
                      {t("aiIntegrations.save")}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={pending || (!draft.apiKey.trim() && !provider.key_last_four)}
                      onClick={() =>
                        testMut.mutate({
                          provider_code: provider.provider_code,
                          api_key: draft.apiKey.trim() || undefined,
                        })
                      }
                    >
                      {testMut.isPending && testMut.variables?.provider_code === provider.provider_code ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : null}
                      {t("aiIntegrations.test")}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={pending || !provider.key_last_four}
                      onClick={() => modelsMut.mutate({ provider_code: provider.provider_code })}
                    >
                      <RefreshCw className="h-4 w-4" />
                      {t("aiIntegrations.refreshModels")}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={!provider.key_last_four || pending}
                      onClick={() => setRemoveTarget(provider.provider_code)}
                    >
                      <Trash2 className="h-4 w-4" />
                      {t("aiIntegrations.removeKey")}
                    </Button>
                  </div>

                  {catalog ? (
                    <a
                      href={catalog.keysUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary underline-offset-2 hover:underline"
                    >
                      {t("aiIntegrations.getKeyLink")}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : null}

                  <Collapsible className="mt-3">
                    <CollapsibleTrigger className="flex items-center gap-1 text-xs font-semibold text-foreground">
                      <ChevronDown className="h-3.5 w-3.5" />
                      {t("aiIntegrations.howtoTitle")}
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <ol className="mt-2 list-decimal space-y-1 ps-5 text-xs text-muted-foreground">
                        {(Array.isArray(steps) ? steps : []).map((step) => (
                          <li key={step}>{step}</li>
                        ))}
                      </ol>
                    </CollapsibleContent>
                  </Collapsible>
                </NeumorphicCard>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="routing" className="mt-5">
          <NeumorphicCard className="space-y-4 p-5">
            <div>
              <h2 className="text-sm font-semibold">{t("aiIntegrations.routing.title")}</h2>
              <p className="mt-1 text-xs text-muted-foreground">{t("aiIntegrations.routing.help")}</p>
            </div>
            {routing ? (
              <div className="grid gap-4 md:grid-cols-2">
                {(["primary", "secondary", "tertiary"] as const).map((slot) => (
                  <div key={slot} className="space-y-2">
                    <Label>{t(`aiIntegrations.routing.${slot}`)}</Label>
                    <Select
                      value={routing[slot] ?? NONE}
                      onValueChange={(value) =>
                        setRoutingDraft({
                          ...(routingDraft ?? data.routing),
                          [slot]: value === NONE ? null : (value as AiProviderCode),
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>{t("aiIntegrations.routing.none")}</SelectItem>
                        {eligible.map((code) => (
                          <SelectItem key={code} value={code}>
                            {data.catalog.find((c) => c.code === code)?.displayName ?? code}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
                <div className="space-y-2">
                  <Label htmlFor="timeout">{t("aiIntegrations.routing.timeout")}</Label>
                  <Input
                    id="timeout"
                    type="number"
                    min={3000}
                    max={120000}
                    value={routing.timeout_ms}
                    onChange={(e) =>
                      setRoutingDraft({
                        ...(routingDraft ?? data.routing),
                        timeout_ms: Number(e.target.value),
                      })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="retries">{t("aiIntegrations.routing.retries")}</Label>
                  <Input
                    id="retries"
                    type="number"
                    min={0}
                    max={3}
                    value={routing.max_retries}
                    onChange={(e) =>
                      setRoutingDraft({
                        ...(routingDraft ?? data.routing),
                        max_retries: Number(e.target.value),
                      })
                    }
                  />
                </div>
                <div className="flex items-center justify-between gap-3 rounded-2xl border border-border/50 px-3 py-2">
                  <Label htmlFor="fallback">{t("aiIntegrations.routing.autoFallback")}</Label>
                  <Switch
                    id="fallback"
                    checked={routing.auto_fallback}
                    onCheckedChange={(auto_fallback) =>
                      setRoutingDraft({ ...(routingDraft ?? data.routing), auto_fallback })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="month-limit">{t("aiIntegrations.routing.monthlyLimit")}</Label>
                  <Input
                    id="month-limit"
                    type="number"
                    min={0}
                    placeholder={t("aiIntegrations.routing.unlimited")}
                    value={routing.monthly_limit_usd ?? ""}
                    onChange={(e) =>
                      setRoutingDraft({
                        ...(routingDraft ?? data.routing),
                        monthly_limit_usd: e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                  />
                </div>
              </div>
            ) : null}
            <Button
              type="button"
              disabled={!routingDirty || routingMut.isPending}
              onClick={() => routing && routingMut.mutate(routing)}
            >
              {routingMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {t("aiIntegrations.save")}
            </Button>
          </NeumorphicCard>
        </TabsContent>

        <TabsContent value="usage" className="mt-5">
          <NeumorphicCard className="p-5">
            <h2 className="text-sm font-semibold">{t("aiIntegrations.usage.title")}</h2>
            <p className="mt-1 text-xs text-muted-foreground">{t("aiIntegrations.usage.estimateNote")}</p>
            <div className="mt-4 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("aiIntegrations.usage.date")}</TableHead>
                    <TableHead>{t("aiIntegrations.usage.provider")}</TableHead>
                    <TableHead>{t("aiIntegrations.usage.model")}</TableHead>
                    <TableHead>{t("aiIntegrations.usage.module")}</TableHead>
                    <TableHead>{t("aiIntegrations.usage.success")}</TableHead>
                    <TableHead>{t("aiIntegrations.usage.fail")}</TableHead>
                    <TableHead>{t("aiIntegrations.usage.tokens")}</TableHead>
                    <TableHead>{t("aiIntegrations.usage.cost")}</TableHead>
                    <TableHead>{t("aiIntegrations.usage.latency")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.usage.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center text-sm text-muted-foreground">
                        {t("aiIntegrations.usage.empty")}
                      </TableCell>
                    </TableRow>
                  ) : (
                    data.usage.map((row) => (
                      <TableRow key={`${row.usage_date}-${row.provider_code}-${row.model}-${row.module_source}`}>
                        <TableCell>{row.usage_date}</TableCell>
                        <TableCell>{row.provider_code}</TableCell>
                        <TableCell className="font-mono text-xs">{row.model}</TableCell>
                        <TableCell>{row.module_source}</TableCell>
                        <TableCell>{row.success_count}</TableCell>
                        <TableCell>{row.fail_count}</TableCell>
                        <TableCell>
                          {row.input_tokens} / {row.output_tokens}
                        </TableCell>
                        <TableCell>${row.estimated_cost_usd.toFixed(4)}</TableCell>
                        <TableCell>{row.avg_latency_ms} ms</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </NeumorphicCard>
        </TabsContent>
      </Tabs>

      <AlertDialog open={removeTarget != null} onOpenChange={(open) => !open && setRemoveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("aiIntegrations.confirmRemove.title")}</AlertDialogTitle>
            <AlertDialogDescription>{t("aiIntegrations.confirmRemove.body")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("aiIntegrations.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => removeTarget && removeMut.mutate({ provider_code: removeTarget })}
            >
              {t("aiIntegrations.removeKey")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={replaceTarget != null} onOpenChange={(open) => !open && setReplaceTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("aiIntegrations.confirmReplace.title")}</AlertDialogTitle>
            <AlertDialogDescription>{t("aiIntegrations.confirmReplace.body")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("aiIntegrations.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!replaceTarget || !data) return;
                const provider = data.providers.find((p) => p.provider_code === replaceTarget);
                if (!provider) return;
                const draft = draftFor(provider);
                const model = draft.useManual || draft.selectedModel === MANUAL ? draft.manualModel.trim() : draft.selectedModel;
                saveMut.mutate({
                  provider_code: replaceTarget,
                  api_key: draft.apiKey.trim(),
                  selected_model: model || undefined,
                });
                setReplaceTarget(null);
              }}
            >
              {t("aiIntegrations.save")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default AiIntegrationsPage;
