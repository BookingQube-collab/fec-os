"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ClipboardList, Fingerprint } from "lucide-react";
import { useTranslation } from "react-i18next";

import { PasswordField } from "@/components/auth/password-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { defaultHomeForRoles, type AppRole } from "@/lib/rbac";
import {
  isSecureWebAuthnContext,
  isWebAuthnAvailable,
} from "@/lib/webauthn/detect";
import {
  markPasskeyJustUsed,
  readPasskeyHint,
  rememberPasskeyCredential,
  rememberSignedInEmail,
} from "@/lib/webauthn/hint";

type Mode = "signin" | "forgot";

function AuthPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user, loading, roles } = useAuth();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [webauthnReady, setWebauthnReady] = useState<boolean | null>(null);
  const [secureContext, setSecureContext] = useState(true);

  useEffect(() => {
    const hint = readPasskeyHint();
    if (hint?.email) setEmail(hint.email);
    setWebauthnReady(isWebAuthnAvailable());
    setSecureContext(isSecureWebAuthnContext());
  }, []);

  useEffect(() => {
    if (!loading && user) {
      const roleList = roles.map((r) => r.role as AppRole);
      const hasRoles = roleList.length > 0;
      router.replace(hasRoles ? defaultHomeForRoles(roleList) : "/");
    }
  }, [loading, user, roles, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        rememberSignedInEmail(email);
        toast.success(t("auth.signedIn"));
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        toast.success(t("auth.resetSent"));
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("auth.failed"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogle = async () => {
    setSubmitting(true);
    try {
      if (email) rememberSignedInEmail(email);
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/` },
      });
      if (error) throw error;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("auth.googleFailed"));
      setSubmitting(false);
    }
  };

  const handlePasskey = async () => {
    setSubmitting(true);
    try {
      const { authenticateWithPasskey, isWebAuthnUserCancel } = await import("@/lib/webauthn/browser");
      try {
        const hint = readPasskeyHint();
        const result = await authenticateWithPasskey(hint?.credentialIds);
        const { error } = await supabase.auth.setSession({
          access_token: result.access_token,
          refresh_token: result.refresh_token,
        });
        if (error) throw error;
        markPasskeyJustUsed();
        rememberPasskeyCredential(result.email, result.user_id, result.credential_id);
        toast.success(t("auth.signedIn"));
      } catch (err) {
        if (!isWebAuthnUserCancel(err)) {
          toast.error(err instanceof Error ? err.message : t("auth.passkeyFailed"));
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("auth.passkeyFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-stage flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="relative z-[1] w-full max-w-[26rem]">
        <div className="mb-8 flex items-center gap-3.5">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-elevated-xs">
            <ClipboardList className="h-5 w-5" />
          </div>
          <div>
            <div className="text-xl font-semibold tracking-tight text-foreground">FEC-OS</div>
            <div className="auth-kicker text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {t("auth.kicker")}
            </div>
          </div>
        </div>

        <div className="auth-card rounded-[1.75rem] border border-border bg-card p-7 shadow-elevated-md sm:p-8">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {mode === "signin" ? t("auth.signIn") : t("auth.resetPassword")}
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {mode === "signin" ? t("auth.signInHint") : t("auth.resetHint")}
          </p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="email" className="text-label">
                {t("auth.email")}
              </label>
              <Input
                id="email"
                name="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete={mode === "signin" ? "username webauthn" : "email"}
                autoCapitalize="none"
                spellCheck={false}
                className="bg-background"
              />
            </div>
            {mode === "signin" && (
              <div className="space-y-1.5">
                <label htmlFor="password" className="text-label">
                  {t("auth.password")}
                </label>
                <PasswordField
                  value={password}
                  onChange={setPassword}
                  required
                  minLength={6}
                  disabled={submitting}
                />
              </div>
            )}

            <Button type="submit" disabled={submitting} className="auth-submit h-11 w-full">
              {submitting ? t("common.pleaseWait") : mode === "signin" ? t("auth.submit") : t("auth.sendReset")}
            </Button>
          </form>

          {mode === "signin" && (
            <>
              <div className="my-5 flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                <div className="h-px flex-1 bg-border" />
                {t("common.or")}
                <div className="h-px flex-1 bg-border" />
              </div>

              {webauthnReady ? (
                <div className="mb-2.5 space-y-1.5">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={submitting}
                    onClick={() => void handlePasskey()}
                    className="h-11 w-full bg-background"
                  >
                    <Fingerprint className="h-4 w-4" />
                    {t("auth.passkeySignIn")}
                  </Button>
                  <p className="text-center text-[11px] leading-4 text-muted-foreground">
                    {t("auth.passkeySignInHint")}
                  </p>
                </div>
              ) : webauthnReady === false ? (
                <p className="mb-3 text-center text-xs leading-5 text-muted-foreground">
                  {secureContext ? t("auth.passkeyUnavailable") : t("auth.passkeyNotSecure")}
                </p>
              ) : null}

              <Button
                type="button"
                variant="outline"
                disabled={submitting}
                onClick={() => void handleGoogle()}
                className="h-11 w-full bg-background"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.56c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-2.76c-.99.66-2.26 1.06-3.72 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.11A6.59 6.59 0 0 1 5.5 12c0-.73.13-1.45.34-2.11V7.05H2.18A11 11 0 0 0 1 12c0 1.77.42 3.44 1.18 4.95l3.66-2.84z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.46 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.05l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
                </svg>
                {t("auth.google")}
              </Button>
            </>
          )}

          <div className="mt-6 flex flex-col gap-1 text-center text-xs">
            {mode === "signin" && (
              <button type="button" onClick={() => setMode("forgot")} className="text-muted-foreground transition-colors hover:text-foreground">
                {t("auth.forgot")}
              </button>
            )}
            {mode !== "signin" && (
              <button type="button" onClick={() => setMode("signin")} className="text-muted-foreground transition-colors hover:text-foreground">
                {t("auth.backToSignIn")}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default AuthPage;
