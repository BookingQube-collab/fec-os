"use client";

import { UserRound } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { PageHeader } from "@/components/layout/page-header";
import { NeumorphicCard } from "@/components/dashboard/neumorphic-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { translateRole } from "@/i18n";
import { updateMyProfile } from "@/lib/profile.functions";

export default function ProfilePage() {
  const { t } = useTranslation();
  const { user, profile, roles, loading, refreshProfile } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDisplayName(profile?.display_name ?? "");
  }, [profile?.display_name]);

  const primaryRole = translateRole(t, roles[0]?.role);
  const email = user?.email ?? "";

  const onSave = async (e: FormEvent) => {
    e.preventDefault();
    const next = displayName.trim();
    if (!next) {
      toast.error(t("profile.nameRequired"));
      return;
    }
    setSaving(true);
    try {
      await updateMyProfile({ display_name: next });
      await refreshProfile();
      toast.success(t("profile.saved"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("profile.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  if (loading && !user) {
    return <p className="text-sm text-muted-foreground">{t("common.loading")}</p>;
  }

  return (
    <div className="mx-auto w-full max-w-lg space-y-6">
      <PageHeader
        icon={UserRound}
        kicker={t("profile.kicker")}
        title={t("profile.title")}
        subtitle={t("profile.subtitle")}
      />

      <NeumorphicCard className="space-y-5 p-5">
        <form className="space-y-4" onSubmit={onSave}>
          <div className="space-y-2">
            <Label htmlFor="display-name">{t("profile.displayName")}</Label>
            <Input
              id="display-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              autoComplete="name"
              maxLength={120}
              required
            />
            <p className="text-xs text-muted-foreground">{t("profile.displayNameHint")}</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="profile-email">{t("common.email")}</Label>
            <Input id="profile-email" value={email} readOnly disabled />
          </div>

          <div className="space-y-2">
            <Label htmlFor="profile-role">{t("profile.role")}</Label>
            <Input id="profile-role" value={primaryRole} readOnly disabled />
          </div>

          <div className="flex justify-end pt-1">
            <Button type="submit" disabled={saving || !displayName.trim()}>
              {saving ? t("common.saving") : t("common.save")}
            </Button>
          </div>
        </form>
      </NeumorphicCard>
    </div>
  );
}
