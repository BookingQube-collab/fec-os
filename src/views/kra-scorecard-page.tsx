"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslation } from "react-i18next";
import { Building2, ClipboardCheck, ClipboardList, Layers } from "lucide-react";
import { toast } from "sonner";

import { KraSiteSopList, KraSopCodeLinks } from "@/components/people/kra-site-sops";
import { CapabilityGate } from "@/components/auth/capability-gate";
import { FecLoader, FecPageHeader } from "@/components/fec";
import { HrPanel } from "@/components/hr/hr-panel";
import { HrShell } from "@/components/hr/hr-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { usePermission } from "@/hooks/use-permission";
import {
  assignKraScorecard,
  listKraScorecards,
  listKraStaffOptions,
  updateKraStandard,
} from "@/lib/kra-scorecard.functions";
import type { KraTemplate, KraTemplateItem } from "@/lib/kra-scorecard/model";
import { KRA_ROLES } from "@/lib/kra-scorecard/score";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";

export default function KraScorecardPage() {
  const { t } = useTranslation();
  const params = useSearchParams();
  const presetStaff = params.get("staff") ?? "";
  const qc = useQueryClient();
  const canAssign = usePermission("performance.assign");
  const canEditStandards = usePermission("performance.manage_templates");
  const [tab, setTab] = useState<"sites" | "framework" | "reviews">("sites");
  const [siteId, setSiteId] = useState("");
  const [staffId, setStaffId] = useState(presetStaff);
  const [period, setPeriod] = useState("");
  const [role, setRole] = useState<(typeof KRA_ROLES)[number]>("Attendant");
  const [share, setShare] = useState("0.5");
  const [post, setPost] = useState("");
  const [reviewer, setReviewer] = useState("");
  const [editing, setEditing] = useState<KraTemplateItem | null>(null);

  const master = useQuery({
    queryKey: queryKeys.people.kraScorecards(),
    queryFn: () => listKraScorecards(),
    staleTime: STALE.people,
  });
  const staff = useQuery({
    queryKey: queryKeys.people.kraStaff(),
    queryFn: () => listKraStaffOptions(),
    enabled: canAssign,
    staleTime: STALE.people,
  });

  const templates = master.data?.templates ?? [];
  const selected = templates.find((row) => row.id === siteId) ?? templates[0] ?? null;

  const assign = useMutation({
    mutationFn: () => {
      if (!selected || !staffId) throw new Error(t("kraScorecard.employee"));
      const cashierShare = Number(share);
      return assignKraScorecard({
        staffId,
        templateId: selected.id,
        reviewPeriod: period,
        reviewerName: reviewer,
        assignedPost: post,
        role,
        cashierShare: Number.isFinite(cashierShare) ? cashierShare : 0.5,
      });
    },
    onSuccess: (row) => {
      toast.success(t("kraScorecard.assign"));
      void qc.invalidateQueries({ queryKey: queryKeys.people.kraScorecards() });
      window.location.assign(`/people/kra/reviews/${row.id}`);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const saveStandard = useMutation({
    mutationFn: () => {
      if (!editing) throw new Error(t("kraScorecard.standards"));
      return updateKraStandard({
        itemId: editing.id,
        title: editing.title,
        sopReference: editing.sopReference,
        targetStandard: editing.targetStandard,
        weightCashier: editing.weightCashier,
        weightAttendant: editing.weightAttendant,
        weightSupervisor: editing.weightSupervisor,
      });
    },
    onSuccess: () => {
      toast.success(t("kraScorecard.saveStandard"));
      setEditing(null);
      void qc.invalidateQueries({ queryKey: queryKeys.people.kraScorecards() });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const staffOptions = useMemo(
    () =>
      (staff.data ?? []).map((row) => ({
        value: row.id,
        label: row.employeeCode ? `${row.name} · ${row.employeeCode}` : row.name,
        keywords: [row.jobTitle, row.locationCode].filter(Boolean).join(" "),
      })),
    [staff.data],
  );

  function pickStaff(id: string) {
    setStaffId(id);
    const person = staff.data?.find((row) => row.id === id);
    const match = templates.find((row) => row.code === person?.locationCode);
    if (match) setSiteId(match.id);
  }

  return (
    <HrShell>
      <FecPageHeader
        icon={ClipboardList}
        kicker="HR"
        title={t("kraScorecard.title")}
        subtitle={t("kraScorecard.subtitle")}
      />
      <p className="text-sm text-muted-foreground">{t("kraScorecard.sopLater")}</p>
      <div className="fec-inner-tabs">
        {(["sites", "framework", "reviews"] as const).map((key) => {
          const Icon = key === "sites" ? Building2 : key === "framework" ? Layers : ClipboardCheck;
          return (
          <button
            key={key}
            type="button"
            className={tab === key ? "fec-inner-tab is-active" : "fec-inner-tab"}
            onClick={() => setTab(key)}
          >
            <Icon aria-hidden />
            {t(`kraScorecard.${key}`)}
          </button>
          );
        })}
      </div>

      {master.isLoading ? <FecLoader density="chip" label={t("common.loading")} /> : null}
      {master.isError ? <p className="text-sm text-destructive">{(master.error as Error).message}</p> : null}

      {tab === "sites" ? (
        <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
          <HrPanel>
            <div className="flex flex-col gap-1">
              {templates.length === 0 ? <p className="text-sm text-muted-foreground">{t("kraScorecard.emptySites")}</p> : null}
              {templates.map((site) => (
                <Button
                  key={site.id}
                  variant={(selected?.id === site.id ? "secondary" : "ghost") as "secondary" | "ghost"}
                  className="justify-start"
                  onClick={() => setSiteId(site.id)}
                >
                  <span className="truncate text-left">
                    {site.code}
                    <span className="block text-xs text-muted-foreground">{site.brand}</span>
                  </span>
                </Button>
              ))}
            </div>
          </HrPanel>
          {selected ? <SiteSheet site={selected} onEdit={canEditStandards ? setEditing : undefined} /> : null}
        </div>
      ) : null}

      {tab === "framework" ? (
        <HrPanel>
          <p className="mb-3 text-sm text-muted-foreground">{t("kraScorecard.historical")}</p>
          {(["cashier", "attendant", "dual_role"] as const).map((roleKey) => {
            const rows = (master.data?.framework ?? []).filter((row) => row.roleCategory === roleKey);
            if (!rows.length) return null;
            return (
              <section key={roleKey} className="mb-6">
                <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide">{roleKey.replace("_", " ")}</h2>
                <div className="space-y-3">
                  {rows.map((row) => (
                    <div key={row.id} className="rounded-lg border border-border/70 p-3">
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="font-medium">{row.title}</p>
                        {row.points ? <Badge variant="muted">{row.points} pts</Badge> : null}
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{row.expectedStandard}</p>
                      {row.masterSheetMapping ? (
                        <p className="mt-2 text-xs text-muted-foreground">{row.masterSheetMapping}</p>
                      ) : null}
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </HrPanel>
      ) : null}

      {tab === "reviews" ? (
        <HrPanel>
          {(master.data?.reviews ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("kraScorecard.empty")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("kraScorecard.employee")}</TableHead>
                  <TableHead>{t("kraScorecard.site")}</TableHead>
                  <TableHead>{t("kraScorecard.period")}</TableHead>
                  <TableHead>{t("kraScorecard.role")}</TableHead>
                  <TableHead>{t("kraScorecard.score")}</TableHead>
                  <TableHead>{t("kraScorecard.classification")}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(master.data?.reviews ?? []).map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      {row.staffName}
                      {row.employeeCode ? <span className="block text-xs text-muted-foreground">{row.employeeCode}</span> : null}
                    </TableCell>
                    <TableCell>{row.templateCode}</TableCell>
                    <TableCell>{row.reviewPeriod}</TableCell>
                    <TableCell>{row.role}</TableCell>
                    <TableCell>{row.score ?? "—"}</TableCell>
                    <TableCell>{row.classification}</TableCell>
                    <TableCell>
                      <Button size="sm" variant="outline" asChild>
                        <Link href={`/people/kra/reviews/${row.id}`}>{t("kraScorecard.open")}</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </HrPanel>
      ) : null}

      <CapabilityGate capability="performance.assign">
        <HrPanel>
          <h2 className="mb-3 text-sm font-semibold">{t("kraScorecard.assign")}</h2>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label>{t("kraScorecard.employee")}</Label>
              <SearchableSelect
                value={staffId}
                onValueChange={pickStaff}
                options={staffOptions}
                placeholder={t("kraScorecard.employee")}
              />
            </div>
            <div>
              <Label>{t("kraScorecard.site")}</Label>
              <SearchableSelect
                value={selected?.id ?? ""}
                onValueChange={setSiteId}
                options={templates.map((site) => ({
                  value: site.id,
                  label: `${site.code} · ${site.brand}`,
                  description: site.placeName,
                }))}
              />
            </div>
            <div>
              <Label>{t("kraScorecard.period")}</Label>
              <Input value={period} onChange={(event) => setPeriod(event.target.value)} placeholder="September 2026" />
            </div>
            <div>
              <Label>{t("kraScorecard.role")}</Label>
              <SearchableSelect
                value={role}
                onValueChange={(value) => setRole(value as (typeof KRA_ROLES)[number])}
                options={KRA_ROLES.map((value) => ({ value, label: value }))}
              />
            </div>
            {role === "Dual Role" ? (
              <div>
                <Label>{t("kraScorecard.cashierShare")}</Label>
                <Input value={share} onChange={(event) => setShare(event.target.value)} inputMode="decimal" />
              </div>
            ) : null}
            <div>
              <Label>{t("kraScorecard.post")}</Label>
              <Input value={post} onChange={(event) => setPost(event.target.value)} />
            </div>
            <div>
              <Label>{t("kraScorecard.reviewer")}</Label>
              <Input value={reviewer} onChange={(event) => setReviewer(event.target.value)} />
            </div>
          </div>
          <Button className="mt-3" disabled={assign.isPending || !staffId || !period || !post || !reviewer} onClick={() => assign.mutate()}>
            {t("kraScorecard.assign")}
          </Button>
        </HrPanel>
      </CapabilityGate>

      {editing ? (
        <HrPanel>
          <h2 className="mb-3 text-sm font-semibold">{t("kraScorecard.standards")}</h2>
          <div className="grid gap-3">
            <div>
              <Label>{t("kraScorecard.kra")}</Label>
              <Input value={editing.title} onChange={(event) => setEditing({ ...editing, title: event.target.value })} />
            </div>
            <div>
              <Label>{t("kraScorecard.sopRef")}</Label>
              <Input
                value={editing.sopReference}
                onChange={(event) => setEditing({ ...editing, sopReference: event.target.value })}
              />
            </div>
            <div>
              <Label>{t("kraScorecard.target")}</Label>
              <Textarea
                value={editing.targetStandard}
                onChange={(event) => setEditing({ ...editing, targetStandard: event.target.value })}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <Label>{t("kraScorecard.cashierWt")}</Label>
                <Input
                  type="number"
                  value={editing.weightCashier}
                  onChange={(event) => setEditing({ ...editing, weightCashier: Number(event.target.value) })}
                />
              </div>
              <div>
                <Label>{t("kraScorecard.attendantWt")}</Label>
                <Input
                  type="number"
                  value={editing.weightAttendant}
                  onChange={(event) => setEditing({ ...editing, weightAttendant: Number(event.target.value) })}
                />
              </div>
              <div>
                <Label>{t("kraScorecard.supervisorWt")}</Label>
                <Input
                  type="number"
                  value={editing.weightSupervisor}
                  onChange={(event) => setEditing({ ...editing, weightSupervisor: Number(event.target.value) })}
                />
              </div>
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <Button disabled={saveStandard.isPending} onClick={() => saveStandard.mutate()}>
              {t("kraScorecard.saveStandard")}
            </Button>
            <Button variant="outline" onClick={() => setEditing(null)}>
              {t("common.cancel")}
            </Button>
          </div>
        </HrPanel>
      ) : null}
    </HrShell>
  );
}

function SiteSheet({
  site,
  onEdit,
}: {
  site: KraTemplate;
  onEdit?: (item: KraTemplateItem) => void;
}) {
  const { t } = useTranslation();
  return (
    <HrPanel>
      <div className="mb-3">
        <h2 className="text-base font-semibold">{site.sheetTitle}</h2>
        <p className="text-sm text-muted-foreground">
          {site.code} · {site.sopLabel} · {site.placeName}
        </p>
        <p className="mt-2 text-sm">{site.baselineNote}</p>
        {site.usageNote ? <p className="mt-2 text-xs text-muted-foreground">{site.usageNote}</p> : null}
        <div className="mt-3">
          <KraSiteSopList sops={site.sops} />
        </div>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>#</TableHead>
            <TableHead>{t("kraScorecard.kra")}</TableHead>
            <TableHead>{t("kraScorecard.sopRef")}</TableHead>
            <TableHead>{t("kraScorecard.target")}</TableHead>
            <TableHead>{t("kraScorecard.cashierWt")}</TableHead>
            <TableHead>{t("kraScorecard.attendantWt")}</TableHead>
            <TableHead>{t("kraScorecard.supervisorWt")}</TableHead>
            {onEdit ? <TableHead /> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {site.items.map((item) => (
            <TableRow key={item.id}>
              <TableCell>{item.itemNo}</TableCell>
              <TableCell className="font-medium">{item.title}</TableCell>
              <TableCell className="text-xs">
                <KraSopCodeLinks reference={item.sopReference} sops={site.sops} />
              </TableCell>
              <TableCell className="max-w-md text-sm text-muted-foreground">{item.targetStandard}</TableCell>
              <TableCell>{item.weightCashier}</TableCell>
              <TableCell>{item.weightAttendant}</TableCell>
              <TableCell>{item.weightSupervisor}</TableCell>
              {onEdit ? (
                <TableCell>
                  <Button size="sm" variant="ghost" onClick={() => onEdit(item)}>
                    {t("kraScorecard.standards")}
                  </Button>
                </TableCell>
              ) : null}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </HrPanel>
  );
}
