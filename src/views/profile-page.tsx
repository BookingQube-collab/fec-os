"use client";

import {
  Bell,
  Check,
  ChevronRight,
  Download,
  ImagePlus,
  KeyRound,
  LogOut,
  MapPin,
  Monitor,
  RefreshCw,
  Smartphone,
  Trash2,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { FecLoader } from "@/components/fec";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { usePwaInstall } from "@/hooks/use-pwa-install";
import { translateRole } from "@/i18n";
import { supabase } from "@/integrations/supabase/client";
import {
  deleteOwnPushSubscription,
  loadChatPushClientConfig,
  saveOwnPushSubscription,
} from "@/lib/chat/push-settings.functions";
import { getMyAccountSnapshot, updateMyProfile } from "@/lib/profile.functions";
import { queryKeys } from "@/lib/query-keys";
import { compressStaffPhotoFile } from "@/lib/staff-photo-client";
import { cn } from "@/lib/utils";

const PHOTO_MAX_BYTES = 10 * 1024 * 1024;
const PASSWORD_MIN = 12;
const PASSWORD_MAX_BYTES = 72;

type AccountTab = "profile" | "password" | "sessions" | "app";

const TABS: { id: AccountTab; icon: LucideIcon; labelKey: string }[] = [
  { id: "profile", icon: UserRound, labelKey: "account.tabs.profile" },
  { id: "password", icon: KeyRound, labelKey: "account.tabs.password" },
  { id: "sessions", icon: Monitor, labelKey: "account.tabs.sessions" },
  { id: "app", icon: Smartphone, labelKey: "account.tabs.app" },
];

function splitDisplayName(value: string | null | undefined) {
  const parts = (value ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: "", last: "" };
  if (parts.length === 1) return { first: parts[0], last: "" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

function joinDisplayName(first: string, last: string) {
  return [first.trim(), last.trim()].filter(Boolean).join(" ");
}

function usernameFromEmail(email: string) {
  const local = email.split("@")[0]?.trim();
  return local || "";
}

function passwordByteLength(value: string) {
  return new TextEncoder().encode(value).length;
}

function formatWhen(value: string | number | null | undefined, locale: string) {
  if (value == null || value === "") return "—";
  const date = typeof value === "number" ? new Date(value * 1000) : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function browserLabel() {
  if (typeof navigator === "undefined") return "Browser";
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /Chrome\//.test(ua)
      ? "Chrome"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Safari\//.test(ua)
          ? "Safari"
          : "Browser";
  const os = /Windows/.test(ua)
    ? "Windows"
    : /Mac OS/.test(ua)
      ? "macOS"
      : /Android/.test(ua)
        ? "Android"
        : /iPhone|iPad/.test(ua)
          ? "iOS"
          : "Device";
  return `${browser} · ${os}`;
}

function urlBase64ToBytes(value: string): Uint8Array {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);
  return bytes;
}

function AccountMark({ src, label }: { src?: string | null; label: string }) {
  if (src) {
    return <img src={src} alt={label} className="account-avatar" />;
  }
  return (
    <span className="account-avatar account-avatar--mark" aria-hidden>
      E3
    </span>
  );
}

function AccountCard({
  title,
  body,
  action,
  children,
  className,
}: {
  title: string;
  body?: string;
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("account-card", className)}>
      <div className={action ? "flex items-start justify-between gap-3" : undefined}>
        <div className="min-w-0">
          <h2 className="account-card__title">{title}</h2>
          {body ? <p className="account-card__body">{body}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export default function ProfilePage() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { user, profile, roles, loading, refreshProfile, signOut, session } = useAuth();
  const pwa = usePwaInstall();
  const photoRef = useRef<HTMLInputElement>(null);
  const tabListId = useId();
  const [tab, setTab] = useState<AccountTab>("profile");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [saving, setSaving] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [signingOut, setSigningOut] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushOn, setPushOn] = useState(false);
  const [notifyPermission, setNotifyPermission] = useState<NotificationPermission | "unsupported">("default");
  const [geoState, setGeoState] = useState<"prompt" | "granted" | "denied" | "unsupported">("prompt");

  const snapshot = useQuery({
    queryKey: queryKeys.account.snapshot(),
    queryFn: () => getMyAccountSnapshot(),
    enabled: Boolean(user),
  });

  const pushConfig = useQuery({
    queryKey: ["account", "push-client"] as const,
    queryFn: async () => {
      const result = await loadChatPushClientConfig({});
      if (!result.ok) return { enabled: false, publicKey: null as string | null };
      return result.data;
    },
    enabled: Boolean(user),
  });

  useEffect(() => {
    const next = splitDisplayName(profile?.display_name);
    setFirstName(next.first);
    setLastName(next.last);
  }, [profile?.display_name]);

  useEffect(() => {
    if (typeof Notification === "undefined") {
      setNotifyPermission("unsupported");
      return;
    }
    setNotifyPermission(Notification.permission);
  }, [tab]);

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.permissions?.query) return;
    let cancelled = false;
    void navigator.permissions
      .query({ name: "geolocation" })
      .then((status) => {
        if (!cancelled) setGeoState(status.state);
      })
      .catch(() => {
        if (!cancelled) setGeoState("prompt");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const email = user?.email ?? "";
  const username = usernameFromEmail(email);
  const primaryRole = roles[0]?.role ? translateRole(t, roles[0].role) : t("account.access.notAssigned");
  const department = snapshot.data?.department?.trim() || t("account.access.notAssigned");
  const displayName = profile?.display_name?.trim() || joinDisplayName(firstName, lastName) || username || email;
  const locale = i18n.language === "ar" ? "ar" : "en";
  const lengthOk = newPassword.length >= PASSWORD_MIN;
  const bytesOk = newPassword.length > 0 && passwordByteLength(newPassword) <= PASSWORD_MAX_BYTES;
  const savedName = profile?.display_name?.trim() || username || t("common.user");

  const sessionRow = useMemo(() => {
    const expiresAt = session?.expires_at ?? null;
    const lastActive = user?.last_sign_in_at ?? null;
    return {
      label: browserLabel(),
      lastActive: formatWhen(lastActive, locale),
      expires: formatWhen(expiresAt, locale),
      ip: snapshot.data?.ip ?? null,
    };
  }, [locale, session?.expires_at, snapshot.data?.ip, user?.last_sign_in_at]);

  const onSaveProfile = async (event: FormEvent) => {
    event.preventDefault();
    const next = joinDisplayName(firstName, lastName);
    if (!next) {
      toast.error(t("account.profile.nameRequired"));
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

  const resetProfile = () => {
    const next = splitDisplayName(profile?.display_name);
    setFirstName(next.first);
    setLastName(next.last);
  };

  const persistPhoto = async (avatarUrl: string | null) => {
    setPhotoBusy(true);
    try {
      await updateMyProfile({ display_name: savedName, avatar_url: avatarUrl });
      await refreshProfile();
      toast.success(avatarUrl ? t("account.profile.photoSaved") : t("account.profile.photoRemoved"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("account.profile.photoFailed"));
    } finally {
      setPhotoBusy(false);
      if (photoRef.current) photoRef.current.value = "";
    }
  };

  const onPhoto = async (file: File | undefined) => {
    if (!file || photoBusy) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > PHOTO_MAX_BYTES) {
      toast.error(t("account.profile.photoInvalid"));
      if (photoRef.current) photoRef.current.value = "";
      return;
    }
    setPhotoBusy(true);
    try {
      const dataUrl = await compressStaffPhotoFile(file);
      await updateMyProfile({ display_name: savedName, avatar_url: dataUrl });
      await refreshProfile();
      toast.success(t("account.profile.photoSaved"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("account.profile.photoFailed"));
    } finally {
      setPhotoBusy(false);
      if (photoRef.current) photoRef.current.value = "";
    }
  };

  const onPassword = async (event: FormEvent) => {
    event.preventDefault();
    setPasswordError("");
    if (!currentPassword) {
      setPasswordError(t("account.password.currentRequired"));
      return;
    }
    if (!lengthOk) {
      setPasswordError(t("account.password.tooShort"));
      return;
    }
    if (passwordByteLength(newPassword) > PASSWORD_MAX_BYTES) {
      setPasswordError(t("account.password.tooLong"));
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError(t("account.password.mismatch"));
      return;
    }
    if (!email) {
      setPasswordError(t("account.password.failed"));
      return;
    }
    setPasswordBusy(true);
    try {
      const signed = await supabase.auth.signInWithPassword({ email, password: currentPassword });
      if (signed.error) throw signed.error;
      const updated = await supabase.auth.updateUser({ password: newPassword });
      if (updated.error) throw updated.error;
      toast.success(t("account.password.updated"));
      const globalOut = await supabase.auth.signOut({ scope: "global" });
      if (globalOut.error) await signOut();
      router.replace("/auth");
    } catch (err) {
      const message = err instanceof Error ? err.message : t("account.password.failed");
      setPasswordError(message);
      toast.error(message);
    } finally {
      setPasswordBusy(false);
    }
  };

  const requestReset = async () => {
    if (!email) {
      toast.error(t("account.password.resetFailed"));
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) {
      toast.error(error.message || t("account.password.resetFailed"));
      return;
    }
    toast.success(t("account.password.resetSent"));
  };

  const signOutBrowser = async () => {
    setSigningOut(true);
    try {
      await signOut();
      router.replace("/auth");
    } finally {
      setSigningOut(false);
    }
  };

  const enablePush = async () => {
    const publicKey = pushConfig.data?.publicKey;
    if (!pushConfig.data?.enabled || !publicKey) {
      toast.error(t("account.app.pushSetup"));
      return;
    }
    if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      toast.error(t("chat.push.unsupported"));
      return;
    }
    setPushBusy(true);
    try {
      const permission = await Notification.requestPermission();
      setNotifyPermission(permission);
      if (permission !== "granted") {
        toast.error(t("chat.push.denied"));
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      const subscription =
        existing ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToBytes(publicKey) as BufferSource,
        }));
      const json = subscription.toJSON();
      if (!subscription.endpoint || !json.keys?.p256dh || !json.keys.auth) {
        toast.error(t("chat.push.failed"));
        return;
      }
      const saved = await saveOwnPushSubscription({
        endpoint: subscription.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
      });
      if (!saved.ok) {
        toast.error(saved.error);
        return;
      }
      setPushOn(true);
      toast.success(t("chat.push.enabled"));
    } catch {
      toast.error(t("chat.push.failed"));
    } finally {
      setPushBusy(false);
    }
  };

  const disablePush = async () => {
    if (!("serviceWorker" in navigator)) return;
    setPushBusy(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      if (existing) {
        const endpoint = existing.endpoint;
        await existing.unsubscribe();
        const removed = await deleteOwnPushSubscription({ endpoint });
        if (!removed.ok) {
          toast.error(removed.error);
          return;
        }
      }
      setPushOn(false);
    } catch {
      toast.error(t("chat.push.failed"));
    } finally {
      setPushBusy(false);
    }
  };

  const checkLocation = () => {
    if (!navigator.geolocation) {
      setGeoState("unsupported");
      toast.error(t("account.app.locationUnsupported"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      () => setGeoState("granted"),
      () => setGeoState("denied"),
      { enableHighAccuracy: false, maximumAge: 60_000, timeout: 10_000 },
    );
  };

  const installApp = () => {
    if (pwa.isStandalone) return;
    if (pwa.canPrompt) {
      void pwa.promptInstall();
      return;
    }
    if (pwa.isIos) {
      pwa.setIosHelpOpen(true);
      return;
    }
    toast(t("account.app.installUnavailable"));
  };

  if (loading && !user) {
    return (
      <div className="flex justify-center py-16">
        <FecLoader density="page" label={t("common.loading")} />
      </div>
    );
  }

  const pushAdminRequired = !pushConfig.isLoading && (!pushConfig.data?.enabled || !pushConfig.data.publicKey);
  const locationBadge =
    geoState === "granted"
      ? t("account.app.locationGranted")
      : geoState === "denied"
        ? t("account.app.locationDenied")
        : geoState === "unsupported"
          ? t("account.app.locationUnsupported")
          : t("account.app.locationPending");

  return (
    <div className="account-hub">
      <header className="account-identity">
        <AccountMark src={profile?.avatar_url} label={displayName} />
        <div className="min-w-0 flex-1">
          <p className="account-kicker">{t("account.kicker")}</p>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="account-identity__name">{displayName}</h1>
          </div>
          <p className="account-identity__email">{email}</p>
          <p className="account-identity__subtitle">{t("account.subtitle")}</p>
        </div>
        <span className="account-signed-in">
          <span className="account-signed-in__dot" aria-hidden />
          {t("account.signedIn")}
        </span>
      </header>

      <div className="account-hub__grid">
        <div className="min-w-0">
          <div role="tablist" aria-label={t("account.tabsAria")} id={tabListId} className="fec-inner-tabs account-tabs">
            {TABS.map((item) => {
              const Icon = item.icon;
              const selected = tab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  id={`${tabListId}-${item.id}`}
                  aria-selected={selected}
                  aria-controls={`${tabListId}-panel-${item.id}`}
                  className={cn("fec-inner-tab", selected && "is-active")}
                  onClick={() => setTab(item.id)}
                >
                  <Icon aria-hidden />
                  {t(item.labelKey)}
                </button>
              );
            })}
          </div>

          {tab === "profile" ? (
            <div role="tabpanel" id={`${tabListId}-panel-profile`} aria-labelledby={`${tabListId}-profile`} className="account-stack">
              <AccountCard title={t("account.profile.title")} body={t("account.profile.subtitle")}>
                <form className="account-stack" onSubmit={onSaveProfile}>
                  <div className="account-nested">
                    <h3 className="account-nested__title">{t("account.profile.photoTitle")}</h3>
                    <p className="account-card__body">{t("account.profile.photoBody")}</p>
                    <div className="mt-4 flex flex-wrap items-center gap-4">
                      <AccountMark src={profile?.avatar_url} label={t("account.profile.photoTitle")} />
                      <div className="flex flex-wrap gap-2">
                        <input
                          ref={photoRef}
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          className="sr-only"
                          onChange={(event) => void onPhoto(event.target.files?.[0])}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={photoBusy}
                          onClick={() => photoRef.current?.click()}
                        >
                          <ImagePlus />
                          {photoBusy ? t("common.saving") : t("account.profile.changePhoto")}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={photoBusy || !profile?.avatar_url}
                          onClick={() => void persistPhoto(null)}
                        >
                          <Trash2 />
                          {t("account.profile.removePhoto")}
                        </Button>
                      </div>
                    </div>
                    <p className="account-hint">{t("account.profile.photoHint")}</p>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="account-first-name">{t("account.profile.firstName")}</Label>
                      <Input
                        id="account-first-name"
                        value={firstName}
                        onChange={(event) => setFirstName(event.target.value)}
                        autoComplete="given-name"
                        maxLength={60}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="account-last-name">{t("account.profile.lastName")}</Label>
                      <Input
                        id="account-last-name"
                        value={lastName}
                        onChange={(event) => setLastName(event.target.value)}
                        autoComplete="family-name"
                        maxLength={60}
                      />
                    </div>
                  </div>

                  <div className="account-nested">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="account-username">{t("account.profile.username")}</Label>
                        <Input id="account-username" value={username} readOnly disabled />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="account-email">{t("account.profile.signInEmail")}</Label>
                        <Input id="account-email" value={email} readOnly disabled />
                      </div>
                    </div>
                    <p className="account-hint">{t("account.profile.managedNote")}</p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button type="submit" className="account-btn" disabled={saving}>
                      {saving ? t("common.saving") : t("account.profile.save")}
                    </Button>
                    <Button type="button" variant="outline" onClick={resetProfile} disabled={saving}>
                      {t("account.profile.reset")}
                    </Button>
                  </div>
                </form>
              </AccountCard>
            </div>
          ) : null}

          {tab === "password" ? (
            <div role="tabpanel" id={`${tabListId}-panel-password`} aria-labelledby={`${tabListId}-password`} className="account-stack">
              <AccountCard title={t("account.password.mfaTitle")} body={t("account.password.mfaBody")} />
              <AccountCard title={t("account.password.changeTitle")} body={t("account.password.changeBody")}>
                <form className="account-stack" onSubmit={onPassword}>
                  <div className="space-y-2">
                    <Label htmlFor="account-current-password">{t("account.password.current")}</Label>
                    <Input
                      id="account-current-password"
                      type={showPasswords ? "text" : "password"}
                      value={currentPassword}
                      onChange={(event) => setCurrentPassword(event.target.value)}
                      autoComplete="current-password"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="account-new-password">{t("account.password.new")}</Label>
                    <Input
                      id="account-new-password"
                      type={showPasswords ? "text" : "password"}
                      value={newPassword}
                      onChange={(event) => setNewPassword(event.target.value)}
                      autoComplete="new-password"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="account-confirm-password">{t("account.password.confirm")}</Label>
                    <Input
                      id="account-confirm-password"
                      type={showPasswords ? "text" : "password"}
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      autoComplete="new-password"
                    />
                  </div>
                  <label className="flex items-center gap-2 text-sm text-foreground">
                    <Checkbox
                      checked={showPasswords}
                      onCheckedChange={(value) => setShowPasswords(value === true)}
                    />
                    {t("account.password.show")}
                  </label>
                  <ul className="account-rules">
                    <li className={lengthOk ? "is-met" : undefined}>
                      <Check aria-hidden />
                      {t("account.password.ruleLength")}
                    </li>
                    <li className={bytesOk ? "is-met" : undefined}>
                      <Check aria-hidden />
                      {t("account.password.ruleBytes")}
                    </li>
                  </ul>
                  <p className="text-sm text-muted-foreground">
                    {t("account.password.forgot")}{" "}
                    <button type="button" className="account-link" onClick={() => void requestReset()}>
                      {t("account.password.resetLink")}
                    </button>
                  </p>
                  {passwordError ? (
                    <p role="alert" className="text-sm text-destructive">
                      {passwordError}
                    </p>
                  ) : null}
                  <div>
                    <Button type="submit" className="account-btn" disabled={passwordBusy}>
                      {passwordBusy ? t("common.saving") : t("account.password.submit")}
                    </Button>
                  </div>
                </form>
              </AccountCard>
            </div>
          ) : null}

          {tab === "sessions" ? (
            <div role="tabpanel" id={`${tabListId}-panel-sessions`} aria-labelledby={`${tabListId}-sessions`}>
              <AccountCard
                title={t("account.sessions.title")}
                body={t("account.sessions.body")}
                action={
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={snapshot.isFetching}
                    onClick={() => {
                      void snapshot.refetch();
                      void supabase.auth.getSession();
                      toast.success(t("account.sessions.refreshed"));
                    }}
                  >
                    <RefreshCw className={snapshot.isFetching ? "animate-spin" : undefined} />
                    {t("account.sessions.refresh")}
                  </Button>
                }
              >
                <div className="account-session">
                  <span className="account-session__icon" aria-hidden>
                    <Monitor />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-foreground">{sessionRow.label}</p>
                      <span className="account-badge">{t("account.sessions.thisBrowser")}</span>
                    </div>
                    <p className="account-session__meta">
                      {t("account.sessions.lastActive")}: {sessionRow.lastActive}
                    </p>
                    <p className="account-session__meta">
                      {t("account.sessions.expires")}: {sessionRow.expires}
                    </p>
                    {sessionRow.ip ? (
                      <p className="account-session__meta">
                        {t("account.sessions.ip")}: {sessionRow.ip}
                      </p>
                    ) : null}
                  </div>
                </div>
              </AccountCard>
            </div>
          ) : null}

          {tab === "app" ? (
            <div role="tabpanel" id={`${tabListId}-panel-app`} aria-labelledby={`${tabListId}-app`}>
              <AccountCard title={t("account.app.title")}>
                <div className="account-app-grid">
                  <article className="account-nested">
                    <Download className="account-app-icon" aria-hidden />
                    <h3 className="account-nested__title">{t("account.app.installTitle")}</h3>
                    <p className="account-card__body">{t("account.app.installBody")}</p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-4"
                      disabled={pwa.isStandalone}
                      onClick={installApp}
                    >
                      <Download />
                      {pwa.isStandalone ? t("account.app.installed") : t("account.app.install")}
                    </Button>
                    <p className="account-hint">{t("account.app.installHint")}</p>
                  </article>
                  <article className="account-nested">
                    <Bell className="account-app-icon" aria-hidden />
                    <h3 className="account-nested__title">{t("account.app.pushTitle")}</h3>
                    <p className="account-card__body">{t("account.app.pushBody")}</p>
                    {pushAdminRequired ? <p className="account-badge mt-3">{t("account.app.pushSetup")}</p> : null}
                    {notifyPermission === "denied" ? <p className="account-badge mt-3">{t("account.app.pushBlocked")}</p> : null}
                    {pushOn ? (
                      <Button type="button" variant="outline" size="sm" className="mt-4" disabled={pushBusy} onClick={() => void disablePush()}>
                        {t("chat.push.disable")}
                      </Button>
                    ) : (
                      <Button type="button" variant="outline" size="sm" className="mt-4" disabled={pushBusy} onClick={() => void enablePush()}>
                        <Bell />
                        {t("account.app.pushEnable")}
                      </Button>
                    )}
                  </article>
                  <article className="account-nested">
                    <MapPin className="account-app-icon" aria-hidden />
                    <h3 className="account-nested__title">{t("account.app.locationTitle")}</h3>
                    <p className="account-card__body">{t("account.app.locationBody")}</p>
                    <p className="account-badge mt-3">{locationBadge}</p>
                    <Button type="button" variant="outline" size="sm" className="mt-4" onClick={checkLocation}>
                      {t("account.app.locationCheck")}
                    </Button>
                  </article>
                </div>
                <p className="account-hint">{t("account.app.footer")}</p>
              </AccountCard>
            </div>
          ) : null}
        </div>

        <aside className="account-rail">
          <AccountCard title={t("account.access.title")}>
            <dl className="account-access">
              <div>
                <dt>{t("account.access.role")}</dt>
                <dd>{primaryRole}</dd>
              </div>
              <div>
                <dt>{t("account.access.department")}</dt>
                <dd>{department}</dd>
              </div>
              <div>
                <dt>{t("account.access.email")}</dt>
                <dd>{email || "—"}</dd>
              </div>
            </dl>
            <p className="account-hint">{t("account.access.help")}</p>
          </AccountCard>

          <AccountCard title={t("account.help.title")} body={t("account.help.body")}>
            <div className="account-links">
              <Link href="/people/hr/helpdesk" className="account-link-row">
                <span>{t("account.help.helpdesk")}</span>
                <ChevronRight aria-hidden />
              </Link>
              <Link href="/people" className="account-link-row">
                <span>{t("account.help.database")}</span>
                <ChevronRight aria-hidden />
              </Link>
            </div>
          </AccountCard>

          <Button type="button" variant="outline" className="w-full" disabled={signingOut} onClick={() => void signOutBrowser()}>
            <LogOut />
            {t("account.signOutBrowser")}
          </Button>
        </aside>
      </div>
    </div>
  );
}
