"use client";

import Link from "next/link";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { updateStaffSkills } from "@/lib/people.functions";
import type { ProfileGapKey } from "@/lib/hr-profile-completeness";

export function Employee360Panel({
  staffId,
  canEditSkills,
  gaps,
  educationVisible,
  education,
  skills,
  certifications,
  onSaved,
}: {
  staffId: string;
  canEditSkills: boolean;
  gaps: ProfileGapKey[];
  educationVisible: boolean;
  education: Array<{ id: string; label: string; expiry: string | null }>;
  skills: string | null;
  certifications: Array<{ id: string; label: string; status: string }>;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const links = [
    { href: `/people/staff/${staffId}?tab=attendance`, label: t("people.profile.links.attendance") },
    { href: `/people/staff/${staffId}?tab=documents`, label: t("people.profile.links.documents") },
    { href: `/people/staff/${staffId}?tab=payroll`, label: t("people.profile.links.payroll") },
    { href: `/people/staff/${staffId}?tab=training`, label: t("people.profile.links.training") },
    { href: `/people/staff/${staffId}?tab=performance`, label: t("people.profile.links.performance") },
    { href: `/people/staff/${staffId}?tab=warnings`, label: t("people.profile.links.warnings") },
    { href: `/people/staff/${staffId}?tab=history`, label: t("people.profile.links.history") },
    { href: "/people/leave", label: t("people.profile.links.leave") },
    { href: "/people/hr/ot", label: t("people.profile.links.ot") },
  ];

  async function saveSkills() {
    setPending(true);
    try {
      await updateStaffSkills({ staffId, skills: (draft ?? skills ?? "").trim() || null });
      toast.success(t("people.profile.skillsSaved"));
      setDraft(null);
      onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("people.profile.skillsError"));
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="surface-card min-w-0 space-y-4 p-4 sm:p-5">
      <div>
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
          {t("people.profile.recordCheck")}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("people.profile.recordCheckHint")}</p>
      </div>
      {gaps.length === 0 ? (
        <p className="text-sm">{t("people.profile.recordComplete")}</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {gaps.map((gap) => (
            <li key={gap}>
              <Badge variant="warning">{t(`people.profile.gaps.${gap}`)}</Badge>
            </li>
          ))}
        </ul>
      )}

      <div>
        <h3 className="text-xs font-medium">{t("people.profile.related")}</h3>
        <div className="mt-2 flex flex-wrap gap-2">
          {links.map((link) => (
            <Link key={link.href + link.label} href={link.href} className="rounded-full border px-2.5 py-1 text-xs hover:bg-muted">
              {link.label}
            </Link>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{t("people.profile.unlinked")}</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <h3 className="text-xs font-medium">{t("people.profile.education")}</h3>
          {!educationVisible ? (
            <p className="mt-1 text-sm text-muted-foreground">{t("people.profile.educationRestricted")}</p>
          ) : education.length === 0 ? (
            <p className="mt-1 text-sm text-muted-foreground">{t("people.profile.educationEmpty")}</p>
          ) : (
            <ul className="mt-2 space-y-1 text-sm">
              {education.map((row) => (
                <li key={row.id}>
                  {row.label}
                  {row.expiry ? <span className="text-muted-foreground"> · {row.expiry}</span> : null}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h3 className="text-xs font-medium">{t("people.profile.certifications")}</h3>
          {certifications.length === 0 ? (
            <p className="mt-1 text-sm text-muted-foreground">{t("people.profile.certificationsEmpty")}</p>
          ) : (
            <ul className="mt-2 space-y-1 text-sm">
              {certifications.map((row) => (
                <li key={row.id}>
                  {row.label}
                  <span className="text-muted-foreground"> · {row.status}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="employee-skills">{t("people.profile.skills")}</Label>
        {canEditSkills ? (
          <>
            <Textarea
              id="employee-skills"
              rows={3}
              value={draft ?? skills ?? ""}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={t("people.profile.skillsPlaceholder")}
            />
            <Button type="button" size="sm" disabled={pending} onClick={() => void saveSkills()}>
              {pending ? t("common.saving") : t("common.save")}
            </Button>
          </>
        ) : (
          <p className="text-sm">{skills?.trim() ? skills : t("people.profile.skillsEmpty")}</p>
        )}
      </div>
    </section>
  );
}
