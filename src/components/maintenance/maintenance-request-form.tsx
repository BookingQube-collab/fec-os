"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Loader2, Plus, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { fileToBase64, PhotoCaptureUpload } from "@/components/maintenance/photo-capture-upload";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { useLocationAreas } from "@/hooks/queries/useLocationAreas";
import { useMaintenanceOptions } from "@/hooks/queries/useMaintenanceOptions";
import { matchLocationAreaName } from "@/lib/location-areas";
import {
  aiDraftMaintenanceRequest,
  createMaintenanceRequest,
  listMaintenanceTechnicians,
  updateMaintenanceRequest,
  uploadMaintenanceAttachment,
} from "@/lib/maintenance-requests.functions";
import {
  isMaintenanceOtherOption,
  MAINTENANCE_OTHER_OPTION,
  MAINTENANCE_REQUEST_CATEGORIES,
  MAINTENANCE_REQUEST_ISSUE_TYPES,
  mergeLookupNames,
} from "@/lib/maintenance/request-options";
import { MAINTENANCE_PRIORITIES } from "@/lib/maintenance/sla";
import { queryKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";

export {
  MAINTENANCE_REQUEST_CATEGORIES,
  MAINTENANCE_REQUEST_ISSUE_TYPES,
} from "@/lib/maintenance/request-options";

export type MaintenanceRequestFormLabels = {
  branch: string;
  area: string;
  category: string;
  issueType: string;
  priority: string;
  description: string;
  reporterName: string;
  dateTime: string;
  assignTechnician: string;
  photos: string;
  submit: string;
  none: string;
  branchRequired: string;
  promptHint: string;
  descriptionPlaceholder: string;
  aiAssist: string;
  aiDrafted: string;
  aiDraftedFallback: string;
  aiBadge: string;
  aiNeedsNotes: string;
  aiAssigneeAmbiguous: string;
  aiAssigneeNotFound?: string;
  aiAssigneeRequested?: string;
  requestedTechnician: string;
  aiVenueMatched?: string;
  reviewDetails: string;
  reviewHint: string;
  selectArea: string;
  noAreasConfigured: string;
  specifyOther: string;
  otherRequired: string;
  customCategoryPlaceholder?: string;
  customIssueTypePlaceholder?: string;
  customAreaPlaceholder?: string;
  customCategoryRequired?: string;
  customIssueTypeRequired?: string;
  customAreaRequired?: string;
  sampleIntro: string;
  checkVenue: string;
  checkIssue: string;
  checkArea: string;
  checkTechnician: string;
  checkWhen: string;
  checkUrgency: string;
  useSample: string;
  sampleParagraph: string;
  /** Edit-mode primary button (defaults to submit label if omitted) */
  save?: string;
  cancel?: string;
};

export type MaintenanceRequestFormInitialValues = {
  location_id: string;
  area?: string | null;
  category: string;
  issue_type?: string | null;
  priority: string;
  description: string;
  assigned_technician_id?: string | null;
  requested_technician_name?: string | null;
  reporter_name?: string | null;
  reported_at?: string | null;
};

function toDatetimeLocalValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function pickOptionValue(
  value: string | null | undefined,
  options: string[],
  fallback = "",
): { selected: string; other: string } {
  const raw = value?.trim() ?? "";
  if (!raw) return { selected: fallback, other: "" };
  if (isMaintenanceOtherOption(raw)) {
    return { selected: MAINTENANCE_OTHER_OPTION, other: "" };
  }
  const exact = options.find((o) => !isMaintenanceOtherOption(o) && o === raw);
  if (exact) return { selected: exact, other: "" };
  const soft = options.find(
    (o) => !isMaintenanceOtherOption(o) && o.toLowerCase() === raw.toLowerCase(),
  );
  if (soft) return { selected: soft, other: "" };
  return { selected: MAINTENANCE_OTHER_OPTION, other: raw };
}

function defaultMaintenanceFormLabels(t: (key: string) => string): MaintenanceRequestFormLabels {
  return {
    branch: t("common.branch"),
    area: t("dailyOps.maintenance.area"),
    category: t("dailyOps.maintenance.category"),
    issueType: t("dailyOps.maintenance.issueType"),
    priority: t("dailyOps.maintenance.priority"),
    description: t("dailyOps.maintenance.description"),
    reporterName: t("dailyOps.maintenance.reporter"),
    dateTime: t("dailyOps.maintenance.dateTime"),
    assignTechnician: t("dailyOps.maintenance.assigned"),
    photos: t("dailyOps.maintenance.photos"),
    submit: t("dailyOps.maintenance.submit"),
    none: t("dailyOps.maintenance.none"),
    branchRequired: t("dailyOps.maintenance.branchRequired"),
    promptHint: t("dailyOps.maintenance.promptHint"),
    descriptionPlaceholder: t("dailyOps.maintenance.descriptionPlaceholder"),
    aiAssist: t("dailyOps.maintenance.aiAssist"),
    aiDrafted: t("dailyOps.maintenance.aiDrafted"),
    aiDraftedFallback: t("dailyOps.maintenance.aiDraftedFallback"),
    aiBadge: t("dailyOps.maintenance.aiBadge"),
    aiNeedsNotes: t("dailyOps.maintenance.aiNeedsNotes"),
    aiAssigneeAmbiguous: t("dailyOps.maintenance.aiAssigneeAmbiguous"),
    aiAssigneeNotFound: t("dailyOps.maintenance.aiAssigneeNotFound"),
    aiAssigneeRequested: t("dailyOps.maintenance.aiAssigneeRequested"),
    requestedTechnician: t("dailyOps.maintenance.requestedTechnician"),
    aiVenueMatched: t("dailyOps.maintenance.aiVenueMatched"),
    reviewDetails: t("dailyOps.maintenance.reviewDetails"),
    reviewHint: t("dailyOps.maintenance.reviewHint"),
    selectArea: t("dailyOps.maintenance.selectArea"),
    noAreasConfigured: t("dailyOps.maintenance.noAreasConfigured"),
    specifyOther: t("dailyOps.maintenance.specifyOther"),
    otherRequired: t("dailyOps.maintenance.otherRequired"),
    customCategoryPlaceholder: t("dailyOps.maintenance.customCategoryPlaceholder"),
    customIssueTypePlaceholder: t("dailyOps.maintenance.customIssueTypePlaceholder"),
    customAreaPlaceholder: t("dailyOps.maintenance.customAreaPlaceholder"),
    customCategoryRequired: t("dailyOps.maintenance.customCategoryRequired"),
    customIssueTypeRequired: t("dailyOps.maintenance.customIssueTypeRequired"),
    customAreaRequired: t("dailyOps.maintenance.customAreaRequired"),
    sampleIntro: t("dailyOps.maintenance.sampleIntro"),
    checkVenue: t("dailyOps.maintenance.checkVenue"),
    checkIssue: t("dailyOps.maintenance.checkIssue"),
    checkArea: t("dailyOps.maintenance.checkArea"),
    checkTechnician: t("dailyOps.maintenance.checkTechnician"),
    checkWhen: t("dailyOps.maintenance.checkWhen"),
    checkUrgency: t("dailyOps.maintenance.checkUrgency"),
    useSample: t("dailyOps.maintenance.useSample"),
    sampleParagraph: t("dailyOps.maintenance.sampleParagraph"),
    save: t("common.save"),
    cancel: t("common.cancel"),
  };
}

type SiteOption = { id: string; code: string; name: string };

const EMPTY_AREA_OPTIONS: Array<{ id: string; name: string }> = [];

function resolveOtherValue(selected: string, custom: string): string {
  if (!isMaintenanceOtherOption(selected)) return selected.trim();
  return custom.trim();
}

function titleCaseWords(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(" ");
}

/** Match AI area to configured options, or fall back to Other + custom name. */
function resolveAiAreaSelection(
  hint: string | null | undefined,
  areaOptions: Array<{ name: string }>,
): { area: string; area_other: string } {
  const raw = hint?.trim() ?? "";
  if (!raw) return { area: "", area_other: "" };
  if (isMaintenanceOtherOption(raw)) {
    return { area: MAINTENANCE_OTHER_OPTION, area_other: "" };
  }
  const matched = matchLocationAreaName(raw, areaOptions);
  if (matched) return { area: matched, area_other: "" };
  const needle = raw.toLowerCase();
  const soft = areaOptions.find((a) => {
    const n = a.name.trim().toLowerCase();
    return n.includes(needle) || needle.includes(n);
  });
  if (soft) return { area: soft.name, area_other: "" };
  return { area: MAINTENANCE_OTHER_OPTION, area_other: titleCaseWords(raw) };
}

function levenshteinClient(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = i - 1;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cur = row[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + cost);
      prev = cur;
    }
  }
  return row[b.length];
}

const ASSIGNEE_STOP = new Set([
  "to", "for", "please", "fix", "repair", "come", "today", "tomorrow", "tonight",
  "urgent", "the", "a", "an", "and", "or", "if", "him", "her", "them", "those", "very",
]);

function cleanAssigneeHintClient(hint: string | null | undefined): string {
  if (!hint?.trim()) return "";
  return hint
    .trim()
    .split(/\s+/)
    .filter((p) => p && !ASSIGNEE_STOP.has(p.toLowerCase()))
    .slice(0, 2)
    .join(" ");
}

function matchTechnicianInList(
  hint: string | null | undefined,
  techs: Array<{ id: string; display_name: string | null }>,
): { id: string | null; ambiguous: boolean } {
  const cleaned = cleanAssigneeHintClient(hint);
  const needle = cleaned.toLowerCase();
  if (!needle || !techs.length) return { id: null, ambiguous: false };

  const techNames = techs.map((t) => ({
    id: t.id,
    display_name: (t.display_name ?? "").replace(/\s*\(staff\)\s*$/i, "").trim(),
  }));

  const exact = techNames.filter((t) => t.display_name.toLowerCase() === needle);
  if (exact.length === 1) return { id: exact[0].id, ambiguous: false };
  if (exact.length > 1) return { id: null, ambiguous: true };

  const partial = techNames.filter((t) => {
    const name = t.display_name.toLowerCase();
    return name.includes(needle) || needle.includes(name);
  });
  if (partial.length === 1) return { id: partial[0].id, ambiguous: false };
  if (partial.length > 1) return { id: null, ambiguous: true };

  const needleFirst = needle.split(/\s+/)[0] ?? needle;
  if (needleFirst.length >= 3) {
    const firstHits = techNames.filter((t) => {
      const tokens = t.display_name.toLowerCase().split(/\s+/).filter(Boolean);
      return tokens.some((tok) => tok === needleFirst || (needleFirst.length >= 4 && tok.startsWith(needleFirst)));
    });
    if (firstHits.length === 1) return { id: firstHits[0].id, ambiguous: false };
    if (firstHits.length > 1) return { id: null, ambiguous: true };
  }

  if (needleFirst.length >= 4) {
    const maxDist = needleFirst.length >= 6 ? 2 : 1;
    const fuzzy = techNames.filter((t) => {
      const first = t.display_name.toLowerCase().split(/\s+/)[0] ?? "";
      if (first.length < 4 || Math.abs(first.length - needleFirst.length) > 2) return false;
      return levenshteinClient(first, needleFirst) <= maxDist;
    });
    if (fuzzy.length === 1) return { id: fuzzy[0].id, ambiguous: false };
    if (fuzzy.length > 1) return { id: null, ambiguous: true };
  }
  return { id: null, ambiguous: false };
}

export function MaintenanceRequestForm({
  sites,
  defaultLocationId,
  defaultReporterName = "",
  labels: labelOverrides,
  className,
  onSuccess,
  onCancel,
  invalidateDailyOps,
  mode = "create",
  requestId,
  initialValues,
}: {
  sites: SiteOption[];
  defaultLocationId: string;
  defaultReporterName?: string;
  labels?: Partial<MaintenanceRequestFormLabels>;
  className?: string;
  onSuccess?: (result: { id: string; request_number: string }) => void;
  onCancel?: () => void;
  /** Also invalidate daily ops maintenance list after submit */
  invalidateDailyOps?: boolean;
  mode?: "create" | "edit";
  /** Required when mode is edit */
  requestId?: string;
  initialValues?: MaintenanceRequestFormInitialValues;
}) {
  const isEdit = mode === "edit";
  const { t } = useTranslation();
  const labels = { ...defaultMaintenanceFormLabels(t), ...labelOverrides };
  const qc = useQueryClient();
  const { profile } = useAuth();
  const reporterFromProfile = defaultReporterName || profile?.display_name || "";
  const [form, setForm] = useState({
    location_id: initialValues?.location_id || defaultLocationId,
    area: "",
    area_other: "",
    category: initialValues?.category || "General",
    category_other: "",
    issue_type: initialValues?.issue_type || "Breakdown",
    issue_type_other: "",
    priority: initialValues?.priority || "normal",
    description: initialValues?.description || "",
    assigned_technician_id: initialValues?.assigned_technician_id || "",
    requested_technician_name: initialValues?.requested_technician_name || "",
    reporter_name: initialValues?.reporter_name || reporterFromProfile,
    reported_at: toDatetimeLocalValue(initialValues?.reported_at),
  });
  const [files, setFiles] = useState<File[]>([]);
  const [aiGenerated, setAiGenerated] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(isEdit);
  const [editHydrated, setEditHydrated] = useState(false);
  const [pendingAiArea, setPendingAiArea] = useState<string | null>(null);
  const [pendingAiAssignee, setPendingAiAssignee] = useState<{
    id: string | null;
    name: string | null;
    ambiguous: boolean;
    requestedName: string | null;
  } | null>(null);

  useEffect(() => {
    if (isEdit) return;
    if (defaultLocationId) {
      setForm((f) => ({ ...f, location_id: defaultLocationId }));
    }
  }, [defaultLocationId, isEdit]);

  useEffect(() => {
    if (isEdit) return;
    if (reporterFromProfile) {
      setForm((f) => ({ ...f, reporter_name: f.reporter_name || reporterFromProfile }));
    }
  }, [reporterFromProfile, isEdit]);

  // Reset hydrate flag when switching to a different request
  useEffect(() => {
    if (!isEdit) return;
    setEditHydrated(false);
  }, [isEdit, requestId]);

  const techQ = useQuery({
    queryKey: ["maint-techs", form.location_id],
    queryFn: () => listMaintenanceTechnicians({ locationId: form.location_id }),
    enabled: !!form.location_id,
  });

  const areasQ = useLocationAreas(form.location_id || null, {
    activeOnly: true,
    enabled: !!form.location_id,
  });
  const areaOptions = areasQ.data ?? EMPTY_AREA_OPTIONS;

  // Apply AI area once areas for the (possibly new) venue have loaded
  useEffect(() => {
    if (!pendingAiArea || areasQ.isLoading || !form.location_id) return;
    const resolved = resolveAiAreaSelection(pendingAiArea, areaOptions);
    if (resolved.area) {
      setForm((f) => ({ ...f, area: resolved.area, area_other: resolved.area_other }));
    }
    setPendingAiArea(null);
  }, [pendingAiArea, areaOptions, areasQ.isLoading, form.location_id]);

  // Apply AI assignee once technicians for the venue have loaded
  useEffect(() => {
    if (!pendingAiAssignee || techQ.isLoading || !form.location_id) return;
    const techs = techQ.data ?? [];
    let assignedTechnicianId = "";
    let requestedName = "";

    if (pendingAiAssignee.id) {
      const stillExists = techs.some((t) => t.id === pendingAiAssignee.id);
      if (stillExists) assignedTechnicianId = pendingAiAssignee.id;
    }
    if (!assignedTechnicianId && pendingAiAssignee.name) {
      const matched = matchTechnicianInList(pendingAiAssignee.name, techs);
      if (matched.id) assignedTechnicianId = matched.id;
      else if (matched.ambiguous || pendingAiAssignee.ambiguous) {
        toast.message(labels.aiAssigneeAmbiguous);
      } else {
        requestedName =
          pendingAiAssignee.requestedName ||
          titleCaseWords(pendingAiAssignee.name);
        toast.message(
          labels.aiAssigneeRequested ||
            `Requested technician "${requestedName}" — assign from the list when available.`,
        );
      }
    } else if (!assignedTechnicianId && pendingAiAssignee.ambiguous) {
      toast.message(labels.aiAssigneeAmbiguous);
    } else if (!assignedTechnicianId && pendingAiAssignee.requestedName) {
      requestedName = pendingAiAssignee.requestedName;
    }

    const isRequestedSelection = assignedTechnicianId.startsWith("requested:");
    if (isRequestedSelection) {
      requestedName =
        assignedTechnicianId.slice("requested:".length).trim() || requestedName;
    }

    setForm((f) => ({
      ...f,
      assigned_technician_id: assignedTechnicianId || f.assigned_technician_id,
      requested_technician_name: assignedTechnicianId && !isRequestedSelection
        ? ""
        : requestedName || f.requested_technician_name,
    }));
    setPendingAiAssignee(null);
  }, [
    pendingAiAssignee,
    techQ.data,
    techQ.isLoading,
    form.location_id,
    labels.aiAssigneeAmbiguous,
    labels.aiAssigneeRequested,
  ]);

  const categoriesQ = useMaintenanceOptions("category", { activeOnly: true });
  const issueTypesQ = useMaintenanceOptions("issue_type", { activeOnly: true });
  const categoryOptions = mergeLookupNames(
    (categoriesQ.data ?? []).map((r) => r.name),
    MAINTENANCE_REQUEST_CATEGORIES,
  );
  const issueTypeOptions = mergeLookupNames(
    (issueTypesQ.data ?? []).map((r) => r.name),
    MAINTENANCE_REQUEST_ISSUE_TYPES,
  );

  // Hydrate edit form once lookup options for the venue are ready
  useEffect(() => {
    if (!isEdit || !initialValues || editHydrated) return;
    if (categoriesQ.isLoading || issueTypesQ.isLoading) return;
    if (initialValues.location_id && areasQ.isLoading) return;

    const cat = pickOptionValue(initialValues.category, categoryOptions, "General");
    const issue = pickOptionValue(initialValues.issue_type, issueTypeOptions, "Breakdown");
    const areaPick = pickOptionValue(initialValues.area, areaOptions.map((a) => a.name), "");
    const assignedId = initialValues.assigned_technician_id?.trim() || "";
    const requestedName = initialValues.requested_technician_name?.trim() || "";

    setForm({
      location_id: initialValues.location_id,
      area: areaPick.selected,
      area_other: areaPick.other,
      category: cat.selected,
      category_other: cat.other,
      issue_type: issue.selected,
      issue_type_other: issue.other,
      priority: initialValues.priority || "normal",
      description: initialValues.description || "",
      assigned_technician_id: assignedId,
      requested_technician_name: assignedId ? "" : requestedName,
      reporter_name: initialValues.reporter_name || "",
      reported_at: toDatetimeLocalValue(initialValues.reported_at),
    });
    setDetailsOpen(true);
    setEditHydrated(true);
  }, [
    isEdit,
    initialValues,
    editHydrated,
    categoriesQ.isLoading,
    issueTypesQ.isLoading,
    areasQ.isLoading,
    categoryOptions,
    issueTypeOptions,
    areaOptions,
  ]);

  const displayCategory = isMaintenanceOtherOption(form.category)
    ? form.category_other.trim() || MAINTENANCE_OTHER_OPTION
    : form.category;
  const displayIssueType = isMaintenanceOtherOption(form.issue_type)
    ? form.issue_type_other.trim() || MAINTENANCE_OTHER_OPTION
    : form.issue_type;
  const displayArea = isMaintenanceOtherOption(form.area)
    ? form.area_other.trim() || MAINTENANCE_OTHER_OPTION
    : form.area;

  const aiDraftMut = useMutation({
    mutationFn: () =>
      aiDraftMaintenanceRequest({
        location_id: form.location_id || null,
        notes: form.description.trim(),
      }),
    onSuccess: (result) => {
      const nextCategory = result.fields.category;
      const nextIssue = result.fields.issue_type;
      const nextLocationId =
        result.fields.location_id && sites.some((s) => s.id === result.fields.location_id)
          ? result.fields.location_id
          : null;
      const locationChanged = !!nextLocationId && nextLocationId !== form.location_id;
      const polished =
        result.fields.polished_description?.trim() ||
        result.fields.description?.trim() ||
        form.description;
      const reportedAt = result.fields.reported_at?.trim() || "";
      const areaHint = result.fields.area?.trim() || "";
      const requestedFromAi =
        result.fields.requested_technician_name?.trim() ||
        (!result.fields.assigned_technician_id
          ? result.fields.assignee_name?.trim() || ""
          : "") ||
        "";

      // Always queue assignee application until tech options for the (possibly new) venue are ready
      setPendingAiAssignee({
        id: result.fields.assigned_technician_id,
        name: result.fields.assignee_name,
        ambiguous: result.fields.assignee_ambiguous,
        requestedName: requestedFromAi || null,
      });

      if (locationChanged) {
        setPendingAiArea(areaHint || null);
      }

      const areaSelection = locationChanged
        ? { area: "", area_other: "" }
        : resolveAiAreaSelection(areaHint, areaOptions);

      setForm((f) => ({
        ...f,
        location_id: nextLocationId || f.location_id,
        category: isMaintenanceOtherOption(nextCategory) ? MAINTENANCE_OTHER_OPTION : nextCategory,
        category_other: isMaintenanceOtherOption(nextCategory) ? "" : f.category_other,
        issue_type: isMaintenanceOtherOption(nextIssue) ? MAINTENANCE_OTHER_OPTION : nextIssue,
        issue_type_other: isMaintenanceOtherOption(nextIssue) ? "" : f.issue_type_other,
        priority: result.fields.priority,
        area: locationChanged ? "" : areaSelection.area || f.area,
        area_other: locationChanged ? "" : areaSelection.area ? areaSelection.area_other : f.area_other,
        description: polished,
        reported_at: reportedAt || f.reported_at,
        // Clear until pending effect applies — avoids stale id against new venue's tech list
        assigned_technician_id: "",
        requested_technician_name: requestedFromAi || f.requested_technician_name,
      }));
      setAiGenerated(result.ai_generated);
      setDetailsOpen(true);
      toast.success(result.ai_generated ? labels.aiDrafted : labels.aiDraftedFallback);
      if (locationChanged && labels.aiVenueMatched) {
        const site = sites.find((s) => s.id === nextLocationId);
        toast.message(
          site
            ? `${labels.aiVenueMatched}: ${site.code} — ${site.name}`
            : labels.aiVenueMatched,
        );
      }
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const saveMut = useMutation({
    mutationFn: async () => {
      const category = resolveOtherValue(form.category, form.category_other);
      const issue_type = resolveOtherValue(form.issue_type, form.issue_type_other);
      const areaRaw = form.area ? resolveOtherValue(form.area, form.area_other) : "";

      if (isMaintenanceOtherOption(form.category) && !category) {
        throw new Error(labels.customCategoryRequired || labels.otherRequired);
      }
      if (isMaintenanceOtherOption(form.issue_type) && !issue_type) {
        throw new Error(labels.customIssueTypeRequired || labels.otherRequired);
      }
      if (isMaintenanceOtherOption(form.area) && !areaRaw) {
        throw new Error(labels.customAreaRequired || labels.otherRequired);
      }

      const payload = {
        location_id: form.location_id,
        area: areaRaw || null,
        category,
        issue_type: issue_type || null,
        priority: form.priority as "normal" | "medium" | "urgent",
        description: form.description,
        assigned_technician_id: form.assigned_technician_id || null,
        requested_technician_name: form.assigned_technician_id.startsWith("requested:")
          ? form.assigned_technician_id.slice("requested:".length).trim() || null
          : form.assigned_technician_id
            ? null
            : form.requested_technician_name.trim() || null,
        reporter_name: form.reporter_name || null,
        reported_at: form.reported_at ? new Date(form.reported_at).toISOString() : undefined,
      };

      const result =
        isEdit && requestId
          ? await updateMaintenanceRequest({ id: requestId, ...payload })
          : await createMaintenanceRequest(payload);

      for (const file of files) {
        const base64 = await fileToBase64(file);
        await uploadMaintenanceAttachment({
          request_id: result.id,
          file_name: file.name,
          file_base64: base64,
          mime_type: file.type,
          kind: "submission",
        });
      }
      return result;
    },
    onSuccess: (r) => {
      toast.success(
        isEdit
          ? `Request ${r.request_number} updated`
          : `Request ${r.request_number} submitted`,
      );
      if (!isEdit) {
        setForm((f) => ({
          ...f,
          description: "",
          area: "",
          area_other: "",
          category: "General",
          category_other: "",
          issue_type: "Breakdown",
          issue_type_other: "",
          priority: "normal",
          assigned_technician_id: "",
          requested_technician_name: "",
          reported_at: "",
        }));
        setDetailsOpen(false);
      }
      setFiles([]);
      setAiGenerated(false);
      void qc.invalidateQueries({ queryKey: queryKeys.maintenance.requests() });
      void qc.invalidateQueries({ queryKey: queryKeys.maintenanceOptions.all });
      void qc.invalidateQueries({ queryKey: queryKeys.locationAreas.all });
      if (isEdit && requestId) {
        void qc.invalidateQueries({ queryKey: ["maintenance-request-detail", requestId] });
      }
      if (invalidateDailyOps) {
        void qc.invalidateQueries({ queryKey: ["dailyOps", "maintenance"] });
        void qc.invalidateQueries({ queryKey: ["dailyOps", "kpis"] });
      }
      onSuccess?.(r);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const runAiAssist = () => {
    if (form.description.trim().length < 3) {
      toast.error(labels.aiNeedsNotes);
      return;
    }
    if (!form.location_id && sites.length === 0) {
      toast.error(labels.branchRequired);
      return;
    }
    aiDraftMut.mutate();
  };

  const useSample = () => {
    setAiGenerated(false);
    setForm((f) => ({
      ...f,
      description: labels.sampleParagraph,
    }));
  };

  const checklistItems = [
    labels.checkVenue,
    labels.checkIssue,
    labels.checkArea,
    labels.checkTechnician,
    labels.checkWhen,
    labels.checkUrgency,
  ];

  const primaryLabel = isEdit ? labels.save || labels.submit : labels.submit;
  const busy = saveMut.isPending || aiDraftMut.isPending;

  return (
    <form
      className={className ?? "max-w-2xl space-y-4 rounded-lg border border-border bg-surface/30 p-5"}
      onSubmit={(e) => {
        e.preventDefault();
        if (!form.location_id || form.description.length < 3) {
          toast.error(labels.branchRequired);
          return;
        }
        if (
          (isMaintenanceOtherOption(form.category) && !form.category_other.trim()) ||
          (isMaintenanceOtherOption(form.issue_type) && !form.issue_type_other.trim()) ||
          (isMaintenanceOtherOption(form.area) && !form.area_other.trim())
        ) {
          toast.error(labels.otherRequired);
          setDetailsOpen(true);
          return;
        }
        if (isEdit && !requestId) {
          toast.error(t("maintenanceMedia.missingId"));
          return;
        }
        saveMut.mutate();
      }}
    >
      <div className="rounded-lg border border-dashed border-border bg-background/60 p-4 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 flex-1 space-y-1">
            <Label className="flex items-center gap-2 text-sm font-medium normal-case tracking-normal text-foreground">
              {labels.description}
              {aiGenerated && form.description ? (
                <Badge variant="secondary" className="text-[10px] font-normal">
                  {labels.aiBadge}
                </Badge>
              ) : null}
              <span className="text-rose-400">*</span>
            </Label>
            <p className="text-xs text-muted-foreground">{labels.promptHint}</p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={runAiAssist}
            disabled={busy}
          >
            {aiDraftMut.isPending ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="mr-1.5 h-3.5 w-3.5 text-amber-600" />
            )}
            {labels.aiAssist}
          </Button>
        </div>

        {!isEdit && (
          <div className="rounded-md border border-border/70 bg-surface/40 px-3 py-2.5 space-y-2">
            <p className="text-xs font-medium text-foreground">{labels.sampleIntro}</p>
            <ul className="space-y-1 text-xs text-muted-foreground">
              {checklistItems.map((item) => (
                <li key={item} className="flex items-start gap-1.5">
                  <span className="font-bold text-emerald-600 dark:text-emerald-400" aria-hidden>
                    ✓
                  </span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <Button type="button" variant="ghost" size="sm" onClick={useSample}>
              {labels.useSample}
            </Button>
          </div>
        )}

        <Textarea
          rows={5}
          placeholder={labels.descriptionPlaceholder}
          value={form.description}
          onChange={(e) => {
            setAiGenerated(false);
            setForm((f) => ({ ...f, description: e.target.value }));
          }}
        />

        {(form.category !== "General" || form.priority !== "normal" || form.area || aiGenerated) && (
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="outline" className="text-[10px] font-normal uppercase tracking-wide">
              {displayCategory}
            </Badge>
            <Badge variant="outline" className="text-[10px] font-normal uppercase tracking-wide">
              {displayIssueType}
            </Badge>
            <Badge
              variant={form.priority === "urgent" ? "destructive" : "outline"}
              className="text-[10px] font-normal uppercase tracking-wide"
            >
              {form.priority}
            </Badge>
            {displayArea ? (
              <Badge variant="secondary" className="text-[10px] font-normal">
                {displayArea}
              </Badge>
            ) : null}
          </div>
        )}
      </div>

      <Field label={labels.branch} required>
        <Select
          value={form.location_id}
          onValueChange={(v) => setForm((f) => ({ ...f, location_id: v, area: "", area_other: "" }))}
        >
          <SelectTrigger><SelectValue placeholder={t("maintenanceMedia.selectBranch")} /></SelectTrigger>
          <SelectContent>
            {sites.map((l) => (
              <SelectItem key={l.id} value={l.id}>{l.code} — {l.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <PhotoCaptureUpload
        label={labels.photos}
        files={files}
        onChange={setFiles}
        acceptVideos
        disabled={saveMut.isPending}
        uploading={saveMut.isPending}
      />

      <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center justify-between rounded-md border border-border bg-surface/40 px-3 py-2.5 text-left text-sm hover:bg-surface/60"
          >
            <span>
              <span className="font-medium">{labels.reviewDetails}</span>
              <span className="mt-0.5 block text-xs font-normal text-muted-foreground">{labels.reviewHint}</span>
            </span>
            <ChevronDown
              className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", detailsOpen && "rotate-180")}
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-4 pt-4">
          <Field label={labels.area}>
            <Select
              value={form.area || undefined}
              onValueChange={(v) =>
                setForm((f) => ({
                  ...f,
                  area: v,
                  area_other: isMaintenanceOtherOption(v) ? f.area_other : "",
                }))
              }
              disabled={!form.location_id || areasQ.isLoading}
            >
              <SelectTrigger>
                <SelectValue placeholder={labels.selectArea} />
              </SelectTrigger>
              <SelectContent>
                {areaOptions.map((a) => (
                  <SelectItem key={a.id} value={a.name}>
                    {a.name}
                  </SelectItem>
                ))}
                <SelectItem value={MAINTENANCE_OTHER_OPTION}>{MAINTENANCE_OTHER_OPTION}</SelectItem>
              </SelectContent>
            </Select>
            {areaOptions.length === 0 && !isMaintenanceOtherOption(form.area) ? (
              <p className="mt-1 text-xs text-muted-foreground">{labels.noAreasConfigured}</p>
            ) : null}
            {isMaintenanceOtherOption(form.area) ? (
              <Input
                className="mt-2"
                placeholder={labels.customAreaPlaceholder || labels.specifyOther}
                value={form.area_other}
                onChange={(e) => setForm((f) => ({ ...f, area_other: e.target.value }))}
              />
            ) : null}
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label={labels.category} required>
              <Select
                value={form.category}
                onValueChange={(v) =>
                  setForm((f) => ({
                    ...f,
                    category: v,
                    category_other: isMaintenanceOtherOption(v) ? f.category_other : "",
                  }))
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {categoryOptions.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {isMaintenanceOtherOption(form.category) ? (
                <Input
                  className="mt-2"
                  placeholder={labels.customCategoryPlaceholder || labels.specifyOther}
                  value={form.category_other}
                  onChange={(e) => setForm((f) => ({ ...f, category_other: e.target.value }))}
                />
              ) : null}
            </Field>
            <Field label={labels.issueType}>
              <Select
                value={form.issue_type}
                onValueChange={(v) =>
                  setForm((f) => ({
                    ...f,
                    issue_type: v,
                    issue_type_other: isMaintenanceOtherOption(v) ? f.issue_type_other : "",
                  }))
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {issueTypeOptions.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {isMaintenanceOtherOption(form.issue_type) ? (
                <Input
                  className="mt-2"
                  placeholder={labels.customIssueTypePlaceholder || labels.specifyOther}
                  value={form.issue_type_other}
                  onChange={(e) => setForm((f) => ({ ...f, issue_type_other: e.target.value }))}
                />
              ) : null}
            </Field>
            <Field label={labels.priority} required>
              <Select value={form.priority} onValueChange={(v) => setForm((f) => ({ ...f, priority: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MAINTENANCE_PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label={labels.reporterName}>
              <Input
                value={form.reporter_name}
                onChange={(e) => setForm((f) => ({ ...f, reporter_name: e.target.value }))}
              />
            </Field>
            <Field label={labels.dateTime}>
              <Input
                type="datetime-local"
                value={form.reported_at}
                onChange={(e) => setForm((f) => ({ ...f, reported_at: e.target.value }))}
              />
            </Field>
          </div>
          <Field label={labels.assignTechnician}>
            <Select
              value={form.assigned_technician_id || "none"}
              onValueChange={(v) => {
                if (v === "none") {
                  setForm((f) => ({ ...f, assigned_technician_id: "" }));
                  return;
                }
                if (v.startsWith("requested:")) {
                  setForm((f) => ({
                    ...f,
                    assigned_technician_id: v,
                    requested_technician_name: v.slice("requested:".length).trim(),
                  }));
                  return;
                }
                setForm((f) => ({
                  ...f,
                  assigned_technician_id: v,
                  requested_technician_name: "",
                }));
              }}
              disabled={!form.location_id}
            >
              <SelectTrigger><SelectValue placeholder={t("common.optional")} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{labels.none}</SelectItem>
                {(techQ.data ?? []).map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.display_name ?? t.id.slice(0, 8)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {!form.assigned_technician_id || form.assigned_technician_id.startsWith("requested:") ? (
            <Field label={labels.requestedTechnician}>
              <Input
                placeholder={t("maintenanceMedia.requestedNamePlaceholder")}
                value={form.requested_technician_name}
                onChange={(e) => setForm((f) => ({ ...f, requested_technician_name: e.target.value }))}
              />
            </Field>
          ) : null}
        </CollapsibleContent>
      </Collapsible>

      <div className="flex flex-wrap items-center justify-end gap-3 pt-4">
        {isEdit && onCancel ? (
          <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>
            {labels.cancel || "Cancel"}
          </Button>
        ) : null}
        <Button type="submit" disabled={busy || (isEdit && !editHydrated)}>
          {saveMut.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : isEdit ? null : (
            <Plus className="mr-2 h-4 w-4" />
          )}
          {primaryLabel}
        </Button>
      </div>
    </form>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs uppercase tracking-wider text-muted-foreground">
        {label} {required ? <span className="text-rose-400">*</span> : null}
      </Label>
      {children}
    </div>
  );
}
