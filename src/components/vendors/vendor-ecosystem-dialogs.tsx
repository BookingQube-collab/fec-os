"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  Mail,
  Phone,
  Send,
  Settings2,
  Shield,
  Sparkles,
  UserRound,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Textarea } from "@/components/ui/textarea";
import { PR_ENGAGEMENT_TYPES } from "@/lib/procurement/constants";
import { queryKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";
import { createVendor } from "@/lib/vendors.functions";

const COMPANY_DOCS = ["commercial_registration", "tax_certificate", "establishment_card"] as const;
const FREELANCER_DOCS = ["qid_passport", "freelance_permit", "bank_confirmation"] as const;

const RULE_ROWS = [
  { id: "cr", name: "Commercial Registration (CR)", section: "Legal", locked: true, company: true, freelancer: false },
  { id: "qid", name: "Qatar ID (QID) / Passport", section: "Legal", locked: true, company: false, freelancer: true },
  { id: "tax", name: "Tax Card / TIN Certificate", section: "Finance", locked: false, company: true, freelancer: true },
  { id: "bank", name: "Bank Account & Official Confirmation Letter", section: "Finance", locked: false, company: true, freelancer: true },
  { id: "est", name: "Establishment Card (Computer Card)", section: "Legal", locked: false, company: true, freelancer: false },
] as const;

export function VendorQuickCreateDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (id: string) => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [entity, setEntity] = useState<"company" | "freelancer">("company");
  const [engagement, setEngagement] = useState<(typeof PR_ENGAGEMENT_TYPES)[number]>("permanent");
  const [contact, setContact] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [deadlineDays, setDeadlineDays] = useState<"7" | "14" | "30" | "custom">("30");
  const [deadlineCustom, setDeadlineCustom] = useState("");

  const add = useMutation({
    mutationFn: () => {
      const deadline =
        deadlineDays === "custom"
          ? deadlineCustom || null
          : new Date(Date.now() + Number(deadlineDays) * 86_400_000).toISOString().slice(0, 10);
      return createVendor({
        name: name.trim(),
        branchCoverage: [],
        entityType: entity,
        engagementType: engagement,
        contactPerson: contact.trim(),
        email: email.trim(),
        phone: phone.trim(),
        complianceDeadline: deadline,
        notes: [entity === "freelancer" ? "Requires QID" : "", address.trim() ? `Address: ${address.trim()}` : ""]
          .filter(Boolean)
          .join("\n") || undefined,
      });
    },
    onSuccess: async (row) => {
      await qc.invalidateQueries({ queryKey: queryKeys.vendors.all });
      toast.success(t("procurement.wizard.linkCopied"));
      onCreated?.(row.id);
      onOpenChange(false);
      setName("");
      setContact("");
      setPhone("");
      setEmail("");
      setAddress("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            {t("procurement.wizard.quickCreateTitle")}
          </DialogTitle>
          <p className="text-sm text-muted-foreground">{t("procurement.wizard.quickCreateHint")}</p>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>{t("vendors.create.name")} *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("vendors.create.namePlaceholder")} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("procurement.wizard.entityType")} *</Label>
            <Select value={entity} onValueChange={(v) => setEntity(v as typeof entity)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="company">{t("procurement.wizard.entityCompany")}</SelectItem>
                <SelectItem value="freelancer">{t("procurement.wizard.entityFreelancerQid")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t("procurement.wizard.engagement")}</Label>
            <Select value={engagement} onValueChange={(v) => setEngagement(v as typeof engagement)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PR_ENGAGEMENT_TYPES.map((id) => (
                  <SelectItem key={id} value={id}>
                    {t(`procurement.wizard.engagementType.${id}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>{t("procurement.wizard.vendorContact")} *</Label>
            <Input value={contact} onChange={(e) => setContact(e.target.value)} placeholder={t("procurement.wizard.vendorContactPlaceholder")} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("procurement.wizard.vendorPhone")} *</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+974 5500 1234" />
          </div>
          <div className="space-y-1.5">
            <Label>{t("procurement.wizard.vendorEmail")} *</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="billing@vendor.com" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>{t("procurement.wizard.vendorAddress")} *</Label>
            <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder={t("procurement.wizard.vendorAddressPlaceholder")} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>{t("procurement.wizard.complianceDeadline")} *</Label>
            <div className="pr-deadline-seg">
              {(["7", "14", "30", "custom"] as const).map((id) => (
                <button key={id} type="button" data-active={deadlineDays === id} onClick={() => setDeadlineDays(id)}>
                  {id === "custom" ? t("procurement.wizard.deadlineCustom") : t("procurement.wizard.deadlineDaysShort", { n: id })}
                </button>
              ))}
            </div>
            {deadlineDays === "custom" ? (
              <Input type="date" className="mt-2" value={deadlineCustom} onChange={(e) => setDeadlineCustom(e.target.value)} />
            ) : null}
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            type="button"
            disabled={add.isPending}
            onClick={() => {
              if (!name.trim() || !contact.trim() || !phone.trim() || !email.trim() || !address.trim()) {
                toast.error(t("procurement.wizard.quickCreateNeedContact"));
                return;
              }
              add.mutate();
            }}
          >
            {t("procurement.wizard.createAndGetLink")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function VendorInviteDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation();
  const [entity, setEntity] = useState<"company" | "freelancer">("company");
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const docs = entity === "company" ? COMPANY_DOCS : FREELANCER_DOCS;
  const [mandatory, setMandatory] = useState<Record<string, boolean>>({
    commercial_registration: true,
    qid_passport: true,
  });

  const qc = useQueryClient();
  const invite = useMutation({
    mutationFn: () =>
      createVendor({
        name: name.trim(),
        branchCoverage: [],
        entityType: entity,
        engagementType: "permanent",
        contactPerson: contact.trim(),
        email: email.trim(),
        phone: phone.trim(),
        complianceDeadline: new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10),
        complianceStatus: "grace",
        notes: [notes.trim(), "Onboarding invitation (7-day link)"].filter(Boolean).join("\n"),
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: queryKeys.vendors.all });
      toast.success(t("vendors.ecosystem.inviteSent"));
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-4 w-4" />
            {t("vendors.ecosystem.inviteTitle")}
          </DialogTitle>
          <p className="text-sm text-muted-foreground">{t("vendors.ecosystem.inviteSubtitle")}</p>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>{t("vendors.ecosystem.vendorClassification")} *</Label>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  ["company", Building2, t("vendors.ecosystem.companyEntity")],
                  ["freelancer", UserRound, t("vendors.ecosystem.freelancerEntity")],
                ] as const
              ).map(([id, Icon, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setEntity(id)}
                  className={cn(
                    "rounded-xl border px-3 py-3 text-start text-sm font-medium",
                    entity === id ? "border-primary bg-primary/5" : "border-border/60",
                  )}
                >
                  <Icon className="mb-1.5 h-4 w-4" />
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{entity === "company" ? t("vendors.ecosystem.companyName") : t("vendors.ecosystem.freelancerName")} *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t("vendors.ecosystem.contactPerson")} *</Label>
              <Input value={contact} onChange={(e) => setContact(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("vendors.ecosystem.contactEmail")} *</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("vendors.ecosystem.contactPhone")} *</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("procurement.wizard.currency")} *</Label>
              <Select value="QAR" disabled>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="QAR">{t("procurement.wizard.currencyQar")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="rounded-xl border border-border/40 p-3">
            <p className="text-sm font-semibold">{t("vendors.ecosystem.complianceChecklist")}</p>
            <p className="text-xs text-muted-foreground">{t("vendors.ecosystem.complianceChecklistHint")}</p>
            <ul className="mt-3 space-y-2">
              {docs.map((doc) => (
                <li key={doc} className="flex items-center justify-between gap-2 text-sm">
                  <label className="flex items-center gap-2">
                    <Checkbox
                      checked={Boolean(mandatory[doc])}
                      onCheckedChange={(v) => setMandatory((prev) => ({ ...prev, [doc]: Boolean(v) }))}
                    />
                    {t(`vendors.ecosystem.doc.${doc}`)}
                  </label>
                  <span className="text-xs text-muted-foreground">
                    {mandatory[doc] ? t("vendors.ecosystem.mandatory") : t("vendors.ecosystem.optional")}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div className="space-y-1.5">
            <Label>{t("vendors.ecosystem.internalNotes")}</Label>
            <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            type="button"
            disabled={invite.isPending}
            onClick={() => {
              if (!name.trim() || !contact.trim() || !email.trim() || !phone.trim()) {
                toast.error(t("procurement.wizard.quickCreateNeedContact"));
                return;
              }
              invite.mutate();
            }}
          >
            {t("vendors.ecosystem.generateLink")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function VendorRuleMatrixDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation();
  type RuleRow = {
    id: string;
    name: string;
    section: string;
    locked: boolean;
    company: boolean;
    freelancer: boolean;
    active: boolean;
    coMandatory: boolean;
    coScore: boolean;
    freeMandatory: boolean;
    freeScore: boolean;
    expiry: boolean;
    weight: number;
  };
  const [rules, setRules] = useState<RuleRow[]>(
    RULE_ROWS.map((row) => ({
      ...row,
      active: true,
      coMandatory: row.id === "cr",
      coScore: true,
      freeMandatory: row.id === "qid",
      freeScore: row.id === "qid" || row.id === "tax",
      expiry: row.id !== "tax",
      weight: row.id === "cr" || row.id === "qid" ? 40 : row.id === "bank" ? 30 : 20,
    })),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="h-4 w-4" />
            {t("vendors.ecosystem.ruleMatrixTitle")}
          </DialogTitle>
          <p className="text-sm text-muted-foreground">{t("vendors.ecosystem.ruleMatrixHint")}</p>
        </DialogHeader>
        <div className="overflow-x-auto rounded-xl border border-border/40">
          <table className="w-full min-w-[880px] text-xs">
            <thead>
              <tr className="border-b border-border/40 bg-muted/30 text-[10px] uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2 text-start">{t("vendors.ecosystem.rule.requirement")}</th>
                <th className="px-3 py-2">{t("vendors.ecosystem.rule.active")}</th>
                <th className="px-3 py-2">{t("vendors.ecosystem.rule.coApp")}</th>
                <th className="px-3 py-2">{t("vendors.ecosystem.rule.coMandatory")}</th>
                <th className="px-3 py-2">{t("vendors.ecosystem.rule.freeMandatory")}</th>
                <th className="px-3 py-2">{t("vendors.ecosystem.rule.expiry")}</th>
                <th className="px-3 py-2">{t("vendors.ecosystem.rule.weight")}</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((row, idx) => (
                <tr key={row.id} className="border-b border-border/30">
                  <td className="px-3 py-2">
                    <p className="font-semibold">{row.name}</p>
                    <p className="text-muted-foreground">{row.section}</p>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <Checkbox checked={row.active} disabled={row.locked} />
                  </td>
                  <td className="px-3 py-2 text-center">
                    <Checkbox
                      checked={row.company}
                      onCheckedChange={(v) =>
                        setRules((prev) => prev.map((r, i) => (i === idx ? { ...r, company: Boolean(v) } : r)))
                      }
                    />
                  </td>
                  <td className="px-3 py-2 text-center">
                    <Checkbox
                      checked={row.coMandatory}
                      onCheckedChange={(v) =>
                        setRules((prev) => prev.map((r, i) => (i === idx ? { ...r, coMandatory: Boolean(v) } : r)))
                      }
                    />
                  </td>
                  <td className="px-3 py-2 text-center">
                    <Checkbox
                      checked={row.freeMandatory}
                      onCheckedChange={(v) =>
                        setRules((prev) => prev.map((r, i) => (i === idx ? { ...r, freeMandatory: Boolean(v) } : r)))
                      }
                    />
                  </td>
                  <td className="px-3 py-2 text-center">
                    <Checkbox checked={row.expiry} />
                  </td>
                  <td className="px-3 py-2 text-center tabular-nums">{row.weight}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => toast.message(t("vendors.ecosystem.simulateImpact"))}>
            {t("vendors.ecosystem.simulateImpact")}
          </Button>
          <Button type="button" onClick={() => toast.success(t("vendors.ecosystem.rulesPublished"))}>
            {t("vendors.ecosystem.publishRuleset")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function VendorGraceExtensionDialog({
  open,
  onOpenChange,
  vendorName,
  currentDeadline,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vendorName: string;
  currentDeadline: string | null;
  onConfirm: (days: number, reason: string) => void;
}) {
  const { t } = useTranslation();
  const [days, setDays] = useState("7");
  const [reason, setReason] = useState("");
  const projected = useMemo(() => {
    const base = currentDeadline ? new Date(currentDeadline) : new Date();
    base.setDate(base.getDate() + Number(days || 0));
    return base.toLocaleDateString();
  }, [currentDeadline, days]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-4 w-4" />
            {t("vendors.ecosystem.graceTitle")}
          </DialogTitle>
          <p className="text-sm text-muted-foreground">{vendorName}</p>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {t("vendors.ecosystem.currentDeadline")}: {currentDeadline ? new Date(currentDeadline).toLocaleDateString() : "—"}
          </p>
          <div className="space-y-1.5">
            <Label>{t("vendors.ecosystem.extensionDays")}</Label>
            <Select value={days} onValueChange={setDays}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["7", "14", "15", "30"].map((n) => (
                  <SelectItem key={n} value={n}>
                    {t("procurement.wizard.deadlineDaysShort", { n })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="text-sm">
            {t("vendors.ecosystem.projectedDeadline")}: <strong>{projected}</strong>
          </p>
          <div className="space-y-1.5">
            <Label>{t("vendors.ecosystem.justification")} *</Label>
            <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            type="button"
            disabled={reason.trim().length < 10}
            onClick={() => {
              onConfirm(Number(days), reason.trim());
              onOpenChange(false);
              setReason("");
            }}
          >
            {t("vendors.ecosystem.authoriseGrace")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
