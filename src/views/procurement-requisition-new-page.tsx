"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Link2,
  Loader2,
  Package,
  Plus,
  ShieldCheck,
  Sparkles,
  Upload,
  X,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { PrAiAssist } from "@/components/procurement/pr-ai-assist";
import {
  compactLineSpec,
  emptyPrLine,
  newPrLineKey,
  PrLineItemsEditor,
  PR_LINE_CATEGORIES,
  type PrLineDraft,
} from "@/components/procurement/pr-line-items-editor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { usePermission } from "@/hooks/use-permission";
import { fmtQar } from "@/lib/currency";
import {
  inferPaymentStructure,
  isFreightLine,
  latestPrReturnOrReject,
  splitJustification,
} from "@/lib/procurement/display";
import {
  aiDraftPurchaseRequisition,
  getProcurementConfig,
  getProcurementOptions,
  getPurchaseRequisition,
  lookupEventForPr,
  savePurchaseRequisition,
} from "@/lib/procurement.functions";
import { sortDepartmentsTree } from "@/lib/departments";
import { computeDepartmentBudgetCheck } from "@/lib/procurement/department-budget";
import { resolveApprovalRoute, type ApprovalStepRole } from "@/lib/procurement/routing";
import { queryKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";
import { createVendor } from "@/lib/vendors.functions";
import { useAppStore } from "@/stores/app-store";

type WizardTab = "details" | "items" | "payment" | "files";
type PrAiFocus = "all" | "details" | "items" | "payment" | "approvers";
type PaymentStructure = "full_advance" | "milestones" | "post_delivery";
type DraftFields = Awaited<ReturnType<typeof aiDraftPurchaseRequisition>>["fields"];

const TABS: WizardTab[] = ["details", "items", "payment", "files"];
const PAYMENTS: PaymentStructure[] = ["full_advance", "milestones", "post_delivery"];

function isNetworkFailure(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error ?? "");
  return /failed to fetch|networkerror|load failed|aborterror|the operation was aborted/i.test(msg);
}

function draftLines(fields: DraftFields, notes: string, headerVendorId: string | null): PrLineDraft[] {
  const named = fields.lines.filter((l) => l.name.trim());
  if (!named.length) return [emptyPrLine()];
  return named.map((l) => ({
    key: newPrLineKey(),
    name: l.name,
    description: compactLineSpec(l.name, l.description, notes) || l.description.trim(),
    category: l.category,
    qty: l.qty,
    unit: l.unit,
    unit_price: l.unit_price,
    preferred_vendor_id: l.preferred_vendor_id || headerVendorId,
    remarks: l.remarks,
    item_id: l.item_id,
    price_source: l.price_source,
    previous_supplier_note: l.previous_supplier_note,
    previous_vendor_name: l.previous_vendor_name,
    previous_pr_number: l.previous_pr_number,
    previous_supplied_on: l.previous_supplied_on,
  }));
}

export default function ProcurementRequisitionNewPage() {
  return (
    <Suspense fallback={null}>
      <ProcurementRequisitionNewInner />
    </Suspense>
  );
}

function ProcurementRequisitionNewInner() {
  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams<{ id?: string }>();
  const searchParams = useSearchParams();
  const existingId = (pathname.includes("/edit") ? params.id : null) || searchParams.get("id");
  const isRevision = Boolean(existingId);
  const eventIdParam = searchParams.get("eventId");
  const projectParam = searchParams.get("project");
  const qc = useQueryClient();
  const locationId = useAppStore((s) => s.currentLocationId);
  const canManageVendors = usePermission("vendors.manage");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const options = useQuery({
    queryKey: queryKeys.procurement.options(),
    queryFn: () => getProcurementOptions(),
  });
  const config = useQuery({
    queryKey: queryKeys.procurement.config(),
    queryFn: () => getProcurementConfig(),
  });
  const existing = useQuery({
    queryKey: queryKeys.procurement.detail(existingId),
    queryFn: () => getPurchaseRequisition({ id: existingId! }),
    enabled: Boolean(existingId),
  });
  const linkedEvent = useQuery({
    queryKey: [...queryKeys.procurement.all, "event-link", eventIdParam],
    queryFn: () => lookupEventForPr({ eventId: eventIdParam! }),
    enabled: Boolean(eventIdParam && !existingId),
  });
  const [linkedEventId, setLinkedEventId] = useState(eventIdParam || "");

  const [tab, setTab] = useState<WizardTab>("details");
  const [notes, setNotes] = useState("");
  const [title, setTitle] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [vendorId, setVendorId] = useState("");
  const [purposeCategory, setPurposeCategory] = useState("");
  const [project, setProject] = useState("");
  const [priority, setPriority] = useState<"low" | "normal" | "high" | "emergency">("normal");
  const [siteId, setSiteId] = useState(locationId ?? "");
  const [overview, setOverview] = useState("");
  const [costCenter, setCostCenter] = useState("");
  const [requestType, setRequestType] = useState<"goods" | "services" | "mixed">("goods");
  const [spendType, setSpendType] = useState<"opex" | "capex">("opex");
  const [requiredBy, setRequiredBy] = useState("");
  const [lines, setLines] = useState<PrLineDraft[]>([emptyPrLine()]);
  const [freight, setFreight] = useState(0);
  const [payment, setPayment] = useState<PaymentStructure>("post_delivery");
  const [paymentReason, setPaymentReason] = useState("");
  const [extraApproverIds, setExtraApproverIds] = useState<string[]>([]);
  const [fileNames, setFileNames] = useState<string[]>([]);
  const [aiGenerated, setAiGenerated] = useState(false);
  const [defaultsApplied, setDefaultsApplied] = useState(false);
  const [hydrated, setHydrated] = useState(!existingId);
  const [vendorOpen, setVendorOpen] = useState(false);
  const [vendorName, setVendorName] = useState("");

  useEffect(() => {
    if (!locationId) return;
    setSiteId((prev) => prev || locationId);
  }, [locationId]);

  useEffect(() => {
    if (existingId || defaultsApplied || !options.data) return;
    setDepartmentId((prev) => prev || options.data.staff?.department_id || "");
    setSiteId((prev) => prev || locationId || options.data.staff?.location_id || "");
    if (projectParam?.trim()) setProject((prev) => prev || projectParam.trim());
    setDefaultsApplied(true);
  }, [options.data, defaultsApplied, locationId, existingId, projectParam]);

  useEffect(() => {
    const event = linkedEvent.data;
    if (!event || existingId) return;
    setLinkedEventId(event.id);
    setProject((prev) => prev || event.project_name || event.name);
    if (event.location_id) setSiteId((prev) => prev || event.location_id);
  }, [linkedEvent.data, existingId]);

  useEffect(() => {
    if (!existingId || existing.isLoading || hydrated) return;
    if (existing.isError) {
      toast.error(t("procurement.detail.notFound"));
      router.replace("/procurement/requisitions");
      return;
    }
    if (!existing.data) return;
    const loaded = existing.data;
    if (!loaded.canEdit) {
      toast.error(t("procurement.detail.cannotEditLocked"));
      router.replace(`/procurement/requisitions/${existingId}`);
      return;
    }
    const parsed = splitJustification(loaded.header.justification);
    const goods = loaded.lines.filter((line) => !isFreightLine(line.name));
    const freightAmt = loaded.lines
      .filter((line) => isFreightLine(line.name))
      .reduce((sum, line) => sum + Number(line.line_total ?? 0), 0);
    setTitle(parsed.title || loaded.header.project_name || "");
    setOverview(parsed.overview);
    setDepartmentId(loaded.header.department_id ?? "");
    setVendorId(loaded.vendor?.id ?? goods.find((l) => l.preferred_vendor_id)?.preferred_vendor_id ?? "");
    setPurposeCategory(goods.find((l) => l.category)?.category ?? "");
    setProject(loaded.header.project_name ?? "");
    setLinkedEventId((loaded.header.event_id as string | null) ?? "");
    setPriority((loaded.header.priority as typeof priority) || "normal");
    setSiteId(loaded.header.location_id);
    setCostCenter(loaded.header.cost_center ?? "");
    setRequestType((loaded.header.request_type as typeof requestType) || "goods");
    setSpendType((loaded.header.spend_type as typeof spendType) || "opex");
    setRequiredBy(loaded.header.required_by ?? "");
    setFreight(freightAmt);
    setPayment(inferPaymentStructure(loaded.header.justification));
    setPaymentReason(parsed.rest);
    setLines(
      goods.length
        ? goods.map((l) => ({
            key: newPrLineKey(),
            name: l.name,
            description: l.description ?? "",
            category: l.category ?? "",
            qty: Number(l.qty),
            unit: l.unit ?? "ea",
            unit_price: Number(l.unit_price),
            preferred_vendor_id: l.preferred_vendor_id,
            remarks: l.remarks ?? "",
            item_id: l.item_id,
            previous_supplier_note: null,
            previous_vendor_name: null,
            previous_pr_number: null,
            previous_supplied_on: null,
          }))
        : [emptyPrLine()],
    );
    setHydrated(true);
  }, [existing.data, existing.error, existing.isError, existing.isLoading, existingId, hydrated, router, t]);

  const lineTotal = useMemo(
    () => lines.reduce((s, l) => s + Number(l.qty || 0) * Number(l.unit_price || 0), 0),
    [lines],
  );
  const grandTotal = lineTotal + Number(freight || 0);
  const namedLines = useMemo(() => lines.filter((l) => l.name.trim()), [lines]);
  const staffDeptId = options.data?.staff?.department_id ?? "";
  const departmentTree = useMemo(
    () => sortDepartmentsTree(options.data?.departments ?? []),
    [options.data?.departments],
  );
  const budgetPreview = useMemo(() => {
    const row = (options.data?.budgets ?? []).find((b) => b.department_id === departmentId);
    return computeDepartmentBudgetCheck({
      year: options.data?.budget_year ?? new Date().getFullYear(),
      budgetAmount: row?.amount ?? null,
      spent: row?.spent ?? 0,
      requested: grandTotal,
    });
  }, [options.data?.budgets, options.data?.budget_year, departmentId, grandTotal]);

  const mandatoryRoles = useMemo<ApprovalStepRole[]>(() => {
    const bands = (config.data?.bands ?? []).filter((b) => b.active);
    if (!bands.length) return ["finance"];
    return resolveApprovalRoute({
      amount: grandTotal,
      emergency: priority === "emergency",
      priceVariancePct: null,
      budgetException: budgetPreview.exception,
      bands,
      settings: config.data?.settings ?? {
        price_variance_pct_threshold: 15,
        force_ceo_on_price_variance: true,
        force_ceo_on_budget_exception: true,
      },
    });
  }, [config.data, grandTotal, priority, budgetPreview.exception]);

  const applyDraft = (fields: DraftFields, focus: PrAiFocus, generated: boolean) => {
    const nextSite =
      fields.location_id && (options.data?.locations ?? []).some((l) => l.id === fields.location_id)
        ? fields.location_id
        : siteId;
    const headerVendor = fields.vendor_id ?? (vendorId || null);

    if (focus === "all" || focus === "details") {
      setTitle(fields.title);
      if (fields.department_id) setDepartmentId(fields.department_id);
      if (fields.vendor_id) setVendorId(fields.vendor_id);
      if (fields.purpose_category) setPurposeCategory(fields.purpose_category);
      setProject(fields.project_name ?? project);
      setPriority(fields.priority);
      setRequestType(fields.request_type);
      setSpendType(fields.spend_type);
      setRequiredBy(fields.required_by ?? "");
      setCostCenter(fields.cost_center ?? "");
      setOverview(fields.justification);
      if (nextSite) setSiteId(nextSite);
    }
    if (focus === "all" || focus === "items" || focus === "details") {
      if (fields.lines.some((l) => l.name.trim())) {
        setLines(draftLines(fields, notes, headerVendor));
      }
    }
    if (focus === "all" || focus === "payment") {
      setPayment(fields.payment_structure);
      setPaymentReason(fields.payment_reason);
    }
    if (focus === "all" || focus === "approvers") {
      setExtraApproverIds(fields.extra_approver_department_ids ?? []);
    }
    setAiGenerated(generated);
    if (generated) toast.success(t("procurement.form.aiDrafted"));
    else toast.warning(t("procurement.form.aiDraftedFallback"));
    if (nextSite && nextSite !== siteId && fields.location_name && (focus === "all" || focus === "details")) {
      toast.message(`${t("procurement.form.aiVenueMatched")}: ${fields.location_name}`);
    }
  };

  const aiDraftMut = useMutation({
    mutationFn: (focus: PrAiFocus) => {
      const brief = notes.trim() || [title.trim(), overview.trim()].filter(Boolean).join("\n");
      return aiDraftPurchaseRequisition({
        notes: brief,
        location_id: siteId || null,
        focus,
      });
    },
    onSuccess: (result, focus) => applyDraft(result.fields, focus, result.ai_generated),
    onError: (e: Error) =>
      toast.error(isNetworkFailure(e) ? t("procurement.form.aiUnavailable") : e.message || t("procurement.form.aiUnavailable")),
  });

  const save = useMutation({
    mutationFn: savePurchaseRequisition,
    onSuccess: (res) => {
      if (res.over_budget) {
        toast.warning(t("procurement.form.excessSubmitted", { amount: fmtQar(res.excess_amount ?? 0) }));
      } else {
        toast.success(isRevision ? t("procurement.form.resubmitted") : t("procurement.form.submit"));
      }
      void qc.invalidateQueries({ queryKey: queryKeys.notifications.all });
      void qc.invalidateQueries({ queryKey: queryKeys.procurement.all });
      router.push(`/procurement/requisitions/${res.id}`);
    },
    onError: (e: Error) =>
      toast.error(isNetworkFailure(e) ? t("procurement.form.saveFailedNetwork") : e.message || t("procurement.form.saveFailed")),
  });

  const addVendor = useMutation({
    mutationFn: () => createVendor({ name: vendorName.trim(), branchCoverage: [] }),
    onSuccess: async (row) => {
      setVendorId(row.id);
      setVendorOpen(false);
      setVendorName("");
      await qc.invalidateQueries({ queryKey: queryKeys.procurement.options() });
      toast.success(t("procurement.wizard.vendorCreated"));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const briefForAi = notes.trim() || `${title} ${overview}`.trim();

  const runAi = (focus: PrAiFocus) => {
    if (briefForAi.length < 3) {
      toast.error(t("procurement.form.aiNeedsNotes"));
      return;
    }
    aiDraftMut.mutate(focus);
  };

  const composeJustification = () => {
    const extraNames = extraApproverIds
      .map((id) => options.data?.departments.find((d) => d.id === id)?.name)
      .filter((n): n is string => Boolean(n));
    return [
      title.trim(),
      (overview.trim() || notes.trim()),
      paymentReason.trim() ? `${t(`procurement.wizard.paymentDetail.${payment}`)}: ${paymentReason.trim()}` : t(`procurement.wizard.paymentBody.${payment}`),
      extraNames.length ? `${t("procurement.wizard.additionalApprovals")}: ${extraNames.join(", ")}` : "",
    ]
      .filter(Boolean)
      .join("\n\n")
      .slice(0, 4000);
  };

  const trySave = (submit: boolean) => {
    if (!siteId) {
      toast.error(t("procurement.form.siteRequired"));
      setTab("details");
      return;
    }
    if (submit) {
      if (!title.trim()) {
        toast.error(t("procurement.wizard.missingTitle"));
        setTab("details");
        return;
      }
      if (!(overview.trim() || notes.trim())) {
        toast.error(t("procurement.wizard.missingOverview"));
        setTab("details");
        return;
      }
      if (!namedLines.length) {
        toast.error(t("procurement.wizard.missingItems"));
        setTab("items");
        return;
      }
    }
    if (!namedLines.length) {
      toast.error(t("procurement.wizard.missingItems"));
      setTab("items");
      return;
    }
    const freightLine =
      freight > 0
        ? [
            {
              name: t("procurement.wizard.freight"),
              description: "",
              category: purposeCategory || "general",
              qty: 1,
              unit: "lot",
              unit_price: Number(freight),
              preferred_vendor_id: vendorId || null,
              remarks: "",
              item_id: null,
            },
          ]
        : [];
    save.mutate({
      id: existingId || undefined,
      location_id: siteId,
      department_id: departmentId || null,
      cost_center: costCenter || null,
      project_name: project || null,
      event_id: linkedEventId || null,
      request_type: requestType,
      spend_type: spendType,
      priority,
      required_by: requiredBy || null,
      justification: composeJustification() || notes.trim() || title.trim(),
      attachment_path: fileNames[0] ? `local:${fileNames[0]}` : null,
      attachment_name: fileNames[0] ?? null,
      submit,
      lines: [
        ...namedLines.map((l) => ({
          name: l.name,
          description: l.description,
          category: l.category || purposeCategory || null,
          qty: Number(l.qty),
          unit: l.unit,
          unit_price: Number(l.unit_price),
          preferred_vendor_id: l.preferred_vendor_id || vendorId || null,
          remarks: l.remarks,
          item_id: l.item_id || null,
        })),
        ...freightLine,
      ],
    });
  };

  const loadFailed = Boolean(existingId && existing.isError);
  const busy = save.isPending || aiDraftMut.isPending || Boolean(existingId && !hydrated && !loadFailed);
  const tabIndex = TABS.indexOf(tab);
  const discard = () =>
    router.push(existingId ? `/procurement/requisitions/${existingId}` : "/procurement/requisitions");
  const returnNote = existing.data ? latestPrReturnOrReject(existing.data.history) : null;

  const addFiles = (list: FileList | null) => {
    if (!list?.length) return;
    setFileNames((prev) => [...prev, ...Array.from(list).map((f) => f.name)].slice(0, 12));
  };

  const toggleExtra = (id: string) => {
    setExtraApproverIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const paymentIcon = { full_advance: Zap, milestones: ClipboardList, post_delivery: ShieldCheck } as const;

  if (existingId && !hydrated && existing.isLoading) {
    return <p className="text-muted-foreground">{t("common.loading")}</p>;
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="overflow-hidden rounded-[1.75rem] border border-border/50 bg-card shadow-elevated-sm">
        <div className="flex items-start justify-between gap-3 border-b border-border/40 px-5 py-4 sm:px-6">
          <div className="flex min-w-0 items-start gap-3">
            <span className="icon-well mt-0.5" aria-hidden>
              <Plus className="h-4 w-4" />
            </span>
            <div>
              <h1 className="text-lg font-semibold">
                {isRevision ? t("procurement.wizard.reviseTitle") : t("procurement.wizard.title")}
              </h1>
              <p className="text-xs text-muted-foreground">
                {isRevision ? t("procurement.wizard.reviseSubtitle") : t("procurement.wizard.subtitle")}
              </p>
            </div>
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={discard} aria-label={t("procurement.wizard.discard")}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {returnNote?.comments?.trim() ? (
          <div className="mx-5 mt-4 rounded-2xl border border-amber-300/60 bg-amber-50 px-4 py-3 sm:mx-6 dark:border-amber-500/30 dark:bg-amber-500/10">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-200">
              {t("procurement.wizard.returnBanner")}
            </p>
            <p className="mt-1 text-sm text-amber-950 dark:text-amber-50">{returnNote.comments}</p>
          </div>
        ) : null}

        {linkedEvent.data || linkedEventId ? (
          <div className="mx-5 mt-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3 sm:mx-6">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">{t("procurement.event.linked")}</p>
              <p className="truncate text-sm font-medium">{linkedEvent.data?.label ?? project}</p>
            </div>
            {linkedEventId ? (
              <Button size="sm" variant="outline" asChild>
                <Link href={`/events/${linkedEventId}`}>{t("procurement.event.openWorkspace")}</Link>
              </Button>
            ) : null}
          </div>
        ) : null}

        <Tabs value={tab} onValueChange={(v) => setTab(v as WizardTab)} className="px-5 sm:px-6">
          <TabsList className="mt-4 h-auto w-full justify-start gap-0 rounded-none border-0 border-b border-border/50 bg-transparent p-0">
            {TABS.map((id) => {
              const Icon = id === "details" ? ClipboardList : id === "items" ? Package : id === "payment" ? Link2 : ShieldCheck;
              return (
                <TabsTrigger
                  key={id}
                  value={id}
                  className="rounded-none border-b-2 border-transparent px-4 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
                >
                  <Icon className="h-4 w-4" />
                  {t(`procurement.wizard.tabs.${id}`)}
                </TabsTrigger>
              );
            })}
          </TabsList>

          <TabsContent value="details" className="space-y-4 py-5">
            <PrAiAssist
              brief={notes}
              onBriefChange={(v) => {
                setAiGenerated(false);
                setNotes(v);
              }}
              onGenerate={() => runAi("all")}
              pending={aiDraftMut.isPending}
            />
            <div className="flex justify-end">
              <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => runAi("details")}>
                {aiDraftMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 text-amber-600" />}
                {t("procurement.wizard.suggestTitle")}
              </Button>
            </div>
            <div className="space-y-1.5">
              <Label>{t("procurement.wizard.requestTitle")}</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t("procurement.wizard.requestTitlePlaceholder")}
              />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="flex items-center gap-2">
                  {t("procurement.wizard.department")}
                  {departmentId && departmentId === staffDeptId ? (
                    <Badge variant="secondary" className="text-[10px]">{t("procurement.wizard.primary")}</Badge>
                  ) : null}
                </Label>
                <Select value={departmentId || undefined} onValueChange={setDepartmentId}>
                  <SelectTrigger>
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    {departmentTree.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.depth > 0 ? `${d.path_name ?? d.name}` : d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {departmentId ? (
                  <p className="text-xs text-muted-foreground">
                    {budgetPreview.remaining == null
                      ? t("procurement.detail.noBudget")
                      : t("procurement.form.remainingBudget", { amount: fmtQar(budgetPreview.remaining) })}
                  </p>
                ) : null}
              </div>
              <p className="self-end text-xs text-muted-foreground md:pb-3">{t("procurement.wizard.departmentHint")}</p>
            </div>
            {budgetPreview.overBudget ? (
              <div className="rounded-xl border border-amber-300/70 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-50">
                {t("procurement.form.overBudgetBanner", { amount: fmtQar(budgetPreview.excessAmount) })}
              </div>
            ) : null}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <Label>{t("procurement.wizard.vendor")}</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (!canManageVendors) {
                      toast.error(t("procurement.wizard.vendorCreateDenied"));
                      return;
                    }
                    setVendorOpen(true);
                  }}
                >
                  {t("procurement.wizard.addNew")}
                </Button>
              </div>
              <Select value={vendorId || "none"} onValueChange={(v) => setVendorId(v === "none" ? "" : v)}>
                <SelectTrigger>
                  <SelectValue placeholder={t("procurement.wizard.selectVendor")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("procurement.wizard.selectVendor")}</SelectItem>
                  {(options.data?.vendors ?? []).map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>{t("procurement.wizard.purposeCategory")}</Label>
                <Select value={purposeCategory || undefined} onValueChange={setPurposeCategory}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("procurement.wizard.selectCategory")} />
                  </SelectTrigger>
                  <SelectContent>
                    {PR_LINE_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {t(`procurement.form.categoryOptions.${c}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{t("procurement.wizard.project")}</Label>
                <Input
                  value={project}
                  disabled={!purposeCategory && !linkedEventId && !projectParam}
                  onChange={(e) => setProject(e.target.value)}
                  placeholder={purposeCategory || linkedEventId || projectParam ? t("procurement.wizard.projectPlaceholder") : t("procurement.wizard.selectProjectFirst")}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("procurement.wizard.priority")}</Label>
                <Select value={priority} onValueChange={(v) => setPriority(v as typeof priority)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">{t("procurement.wizard.priorityLow")}</SelectItem>
                    <SelectItem value="normal">{t("procurement.wizard.priorityMedium")}</SelectItem>
                    <SelectItem value="high">{t("procurement.wizard.priorityHigh")}</SelectItem>
                    <SelectItem value="emergency">{t("procurement.wizard.priorityEmergency")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{t("procurement.wizard.currency")}</Label>
                <Select value="QAR" disabled>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="QAR">{t("procurement.wizard.currencyQar")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label>{t("procurement.wizard.site")}</Label>
                <Select value={siteId || undefined} onValueChange={setSiteId}>
                  <SelectTrigger>
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    {(options.data?.locations ?? []).map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.code ? `${l.code} — ${l.name}` : l.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center gap-2">
                {t("procurement.wizard.overview")}
                {aiGenerated ? <Badge variant="secondary" className="text-[10px]">{t("procurement.form.aiBadge")}</Badge> : null}
              </Label>
              <Textarea
                rows={4}
                value={overview}
                onChange={(e) => setOverview(e.target.value)}
                placeholder={t("procurement.wizard.overviewPlaceholder")}
              />
            </div>
          </TabsContent>

          <TabsContent value="items" className="py-5">
            <PrLineItemsEditor
              variant="wizard"
              lines={lines}
              vendors={options.data?.vendors ?? []}
              catalog={options.data?.items ?? []}
              total={lineTotal}
              freight={freight}
              onFreightChange={setFreight}
              aiGenerated={aiGenerated}
              onSuggest={() => runAi("items")}
              suggestPending={aiDraftMut.isPending}
              onChange={(idx, patch) => setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)))}
              onAdd={() => setLines((p) => [...p, emptyPrLine()])}
              onRemove={(idx) => setLines((prev) => prev.filter((_, i) => i !== idx))}
            />
          </TabsContent>

          <TabsContent value="payment" className="space-y-4 py-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">{t("procurement.wizard.paymentTitle")}</h2>
                <p className="text-sm text-muted-foreground">{t("procurement.wizard.paymentQuestion")}</p>
              </div>
              <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => runAi("payment")}>
                {aiDraftMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 text-amber-600" />}
                {t("procurement.wizard.recommendPayment")}
              </Button>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              {PAYMENTS.map((id) => {
                const Icon = paymentIcon[id];
                const selected = payment === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => {
                      setPayment(id);
                      setPaymentReason(t(`procurement.wizard.paymentBody.${id}`));
                    }}
                    className={cn(
                      "rounded-2xl border px-4 py-4 text-left transition-colors",
                      selected ? "border-primary bg-primary/5" : "border-border/50 bg-card hover:bg-muted/30",
                    )}
                  >
                    <Icon className="mb-2 h-5 w-5 text-primary" />
                    <p className="font-semibold">{t(`procurement.wizard.${id === "full_advance" ? "fullAdvance" : id === "milestones" ? "milestones" : "postDelivery"}`)}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t(`procurement.wizard.${id === "full_advance" ? "fullAdvanceHint" : id === "milestones" ? "milestonesHint" : "postDeliveryHint"}`)}
                    </p>
                  </button>
                );
              })}
            </div>
            <div className="rounded-2xl border border-border/50 bg-muted/20 px-4 py-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold">{t(`procurement.wizard.paymentDetail.${payment}`)}</p>
                <Badge variant="secondary">{t("procurement.wizard.financeVerified")}</Badge>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{paymentReason || t(`procurement.wizard.paymentBody.${payment}`)}</p>
            </div>
          </TabsContent>

          <TabsContent value="files" className="space-y-5 py-5">
            <p className="text-xs text-muted-foreground">{t("procurement.wizard.filesHint")}</p>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                addFiles(e.dataTransfer.files);
              }}
              className="flex w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border/70 bg-muted/20 px-4 py-10 text-center"
            >
              <Upload className="h-6 w-6 text-muted-foreground" />
              <p className="text-sm font-medium">{t("procurement.wizard.dropTitle")}</p>
              <p className="text-xs text-muted-foreground">{t("procurement.wizard.dropHint")}</p>
              {fileNames.length ? (
                <p className="text-xs text-foreground">{fileNames.join(" · ")}</p>
              ) : (
                <p className="text-xs text-muted-foreground">{t("procurement.wizard.noFiles")}</p>
              )}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = "";
              }}
            />

            <div className="space-y-2">
              <Label>{t("procurement.wizard.mandatoryApprovers")}</Label>
              <p className="text-xs text-muted-foreground">{t("procurement.wizard.mandatoryHint")}</p>
              <div className="flex flex-wrap gap-2">
                {mandatoryRoles.map((role) => (
                  <Badge key={role} variant="secondary" className="px-3 py-1">
                    {t(`procurement.steps.${role}`)}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label>{t("procurement.wizard.additionalApprovals")}</Label>
                <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => runAi("approvers")}>
                  {aiDraftMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 text-amber-600" />}
                  {t("procurement.wizard.suggestApprovers")}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">{t("procurement.wizard.additionalHint")}</p>
              <div className="flex flex-wrap gap-2">
                {(options.data?.departments ?? [])
                  .filter((d) => d.id !== departmentId)
                  .map((d) => {
                    const on = extraApproverIds.includes(d.id);
                    return (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => toggleExtra(d.id)}
                        className={cn(
                          "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                          on ? "border-primary bg-primary/10 text-foreground" : "border-border/60 bg-card text-muted-foreground hover:bg-muted/40",
                        )}
                      >
                        {d.path_name ?? d.name}
                      </button>
                    );
                  })}
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/40 px-5 py-4 sm:px-6">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{t("procurement.wizard.exposure")}</p>
            <p className="text-xl font-semibold tabular-nums">{fmtQar(grandTotal)}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {tabIndex > 0 ? (
              <Button type="button" variant="outline" disabled={busy} onClick={() => setTab(TABS[tabIndex - 1])}>
                <ChevronLeft className="h-4 w-4" />
                {t("procurement.wizard.back")}
              </Button>
            ) : null}
            <Button type="button" variant="ghost" disabled={busy} onClick={discard}>
              {t("procurement.wizard.discard")}
            </Button>
            {tab !== "files" ? (
              <Button type="button" disabled={busy} onClick={() => setTab(TABS[tabIndex + 1])}>
                {t("procurement.wizard.next")}
                <ChevronRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button type="button" disabled={busy} onClick={() => trySave(true)}>
                {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {isRevision ? t("procurement.wizard.resubmit") : t("procurement.wizard.submit")}
              </Button>
            )}
          </div>
        </div>
      </div>

      <Dialog open={vendorOpen} onOpenChange={setVendorOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("procurement.wizard.vendor")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>{t("procurement.wizard.vendorName")}</Label>
            <Input value={vendorName} onChange={(e) => setVendorName(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setVendorOpen(false)}>
              {t("procurement.wizard.discard")}
            </Button>
            <Button
              type="button"
              disabled={!vendorName.trim() || addVendor.isPending}
              onClick={() => addVendor.mutate()}
            >
              {addVendor.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {t("procurement.wizard.addNew")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
