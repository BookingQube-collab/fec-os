"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ClipboardList, Fingerprint } from "lucide-react";
import { useTranslation } from "react-i18next";

import { PasswordField } from "@/components/auth/password-field";
import { FecButton as Button } from "@/components/fec";
import BlurText from "@/components/react-bits/blur-text";
import BorderGlow from "@/components/react-bits/border-glow";
import FadeContent from "@/components/react-bits/fade-content";
import GlareHover from "@/components/react-bits/glare-hover";
import GradientText from "@/components/react-bits/gradient-text";
import StarBorder from "@/components/react-bits/star-border-button";
import { Input } from "@/components/ui/input";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useAppStore } from "@/stores/app-store";
import { clearAuthSessionCache } from "@/lib/auth-session";
import { defaultHomeForRoles, type AppRole } from "@/lib/rbac";
import { isSecureWebAuthnContext, isWebAuthnAvailable } from "@/lib/webauthn/detect";
import {
  markPasskeyJustUsed,
  readPasskeyHint,
  rememberPasskeyCredential,
  rememberSignedInEmail,
} from "@/lib/webauthn/hint";

type Mode = "signin" | "forgot";

function AuthPage() {
  const { t } = useTranslation();
  const language = useAppStore((s) => s.language);
  const setLanguage = useAppStore((s) => s.setLanguage);
  const reducedMotion = usePrefersReducedMotion();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, loading, roles, rolesSettled } = useAuth();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [webauthnReady, setWebauthnReady] = useState<boolean | null>(null);
  const [secureContext, setSecureContext] = useState(true);
  const [hintReady, setHintReady] = useState(false);

  useEffect(() => {
    const hint = readPasskeyHint();
    if (hint?.email) setEmail(hint.email);
    setWebauthnReady(isWebAuthnAvailable());
    setSecureContext(isSecureWebAuthnContext());
    setHintReady(true);
  }, []);

  // Only bounce home when the live session matches the form email (or form empty).
  // Typing a different email (e.g. admin while HR cookies still exist) must not redirect as HR.
  useEffect(() => {
    if (!hintReady || loading || submitting || !user || !rolesSettled) return;
    const formEmail = email.trim().toLowerCase();
    const sessionEmail = (user.email ?? "").toLowerCase();
    if (formEmail && formEmail !== sessionEmail) return;
    const roleList = roles.map((r) => r.role as AppRole);
    const hasRoles = roleList.length > 0;
    router.replace(hasRoles ? defaultHomeForRoles(roleList) : "/");
  }, [hintReady, loading, submitting, user, roles, rolesSettled, router, email]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (mode === "signin") {
        const cleanEmail = email.trim();
        // Replace any prior session completely before the new login.
        await supabase.auth.signOut({ scope: "local" });
        clearAuthSessionCache(queryClient);
        const { data, error } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });
        if (error) throw error;
        const signedEmail = (data.user?.email ?? "").toLowerCase();
        if (signedEmail && signedEmail !== cleanEmail.toLowerCase()) {
          await supabase.auth.signOut({ scope: "local" });
          clearAuthSessionCache(queryClient);
          throw new Error(t("auth.failed"));
        }
        rememberSignedInEmail(cleanEmail, data.user?.id);
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
      const { authenticateWithPasskey, isWebAuthnUserCancel } =
        await import("@/lib/webauthn/browser");
      try {
        const hint = readPasskeyHint();
        const result = await authenticateWithPasskey(hint?.credentialIds);
        await supabase.auth.signOut({ scope: "local" });
        clearAuthSessionCache(queryClient);
        const { error } = await supabase.auth.setSession({
          access_token: result.access_token,
          refresh_token: result.refresh_token,
        });
        if (error) throw error;
        markPasskeyJustUsed();
        rememberPasskeyCredential(result.email, result.user_id, result.credential_id);
        setEmail(result.email);
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

  const heading = mode === "signin" ? t("auth.signIn") : t("auth.resetPassword");
  const hint = mode === "signin" ? t("auth.signInHint") : t("auth.resetHint");

  return (
    <div className="relative min-h-dvh bg-background">
      <button
        type="button"
        className="absolute end-4 top-4 z-[3] rounded-full border border-border bg-background/90 px-3 py-1.5 text-xs font-semibold shadow-sm"
        aria-label={t("common.language")}
        onClick={() => setLanguage(language === "en" ? "ar" : "en")}
      >
        {language === "en" ? "العربية" : "English"}
      </button>
      <div
        className="pointer-events-none fixed inset-0 z-[1] bg-[radial-gradient(ellipse_at_center,transparent_0%,rgba(253,248,236,0.28)_48%,rgba(253,248,236,0.78)_100%)]"
        aria-hidden
      />

      <div className="relative z-[2] mx-auto flex min-h-dvh w-full max-w-6xl items-center overflow-x-clip px-4 py-8 sm:px-6 lg:px-10">
        <div className="grid w-full items-center gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,26.5rem)] lg:gap-16">
          <FadeContent
            blur
            duration={0.9}
            className="flex flex-col items-center text-center lg:items-start lg:text-start"
          >
            <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-elevated-xs ring-4 ring-[#f5c518]/35">
              <ClipboardList className="h-6 w-6" />
            </div>
            {reducedMotion ? (
              <div className="text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
                {t("app.name")}
              </div>
            ) : (
              <GradientText
                colors={["#1a1a1a", "#c47a0a", "#f5c518", "#1a1a1a"]}
                animationSpeed={10}
                className="!mx-0 text-4xl font-semibold tracking-tight sm:text-5xl"
              >
                {t("app.name")}
              </GradientText>
            )}
            <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              {t("auth.kicker")}
            </p>
            <p className="mt-4 hidden max-w-md text-sm leading-6 text-muted-foreground lg:block">
              {hint}
            </p>
          </FadeContent>

          <FadeContent
            blur
            delay={0.14}
            duration={1}
            className="w-full motion-safe:transition-transform motion-safe:duration-300 motion-safe:hover:-translate-y-0.5"
          >
            <BorderGlow
              backgroundColor="#ffffff"
              borderRadius={28}
              glowColor="42 92 48"
              colors={["#f5c518", "#c47a0a", "#fff1c2"]}
              animated={!reducedMotion}
              glowIntensity={0.55}
              fillOpacity={0.34}
              className="w-full"
            >
              <div className="rounded-[28px]">
                <div className="p-6 sm:p-8">
                  {reducedMotion ? (
                    <h1 className="text-center text-2xl font-semibold tracking-tight text-foreground">
                      {heading}
                    </h1>
                  ) : (
                    <BlurText
                      as="h1"
                      text={heading}
                      animateBy="words"
                      delay={70}
                      stepDuration={0.42}
                      className="w-full justify-center text-center text-2xl font-semibold tracking-tight text-foreground"
                    />
                  )}
                  <p className="mt-2 text-center text-sm leading-6 text-muted-foreground lg:hidden">
                    {hint}
                  </p>

                  <form onSubmit={handleSubmit} className="mt-6 space-y-4" aria-busy={submitting}>
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
                        className="bg-background transition-shadow"
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

                      <StarBorder
                        as="button"
                        type="submit"
                        disabled={submitting}
                        color="#f5c518"
                        speed="7s"
                        thickness={2}
                        backgroundColor="#1a1a1a"
                        textColor="#ffffff"
                        borderColor="#1a1a1a"
                        className="w-full transition-transform focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9a6208] active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transform-none"
                        style={{ display: "block", width: "100%" }}
                      >
                        {submitting
                          ? t("common.pleaseWait")
                          : mode === "signin"
                            ? t("auth.submit")
                            : t("auth.sendReset")}
                      </StarBorder>
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
                          <GlareHover
                            width="100%"
                            height="auto"
                            background="transparent"
                            borderRadius="999px"
                            borderColor="transparent"
                            glareColor="#f5c518"
                            glareOpacity={0.55}
                            glareSize={170}
                            className="w-full place-items-stretch"
                          >
                            <Button
                              type="button"
                              variant="outline"
                              disabled={submitting}
                              onClick={() => void handlePasskey()}
                              className="relative z-[1] h-11 w-full bg-background transition-transform active:scale-[0.985] motion-reduce:transform-none"
                            >
                              <Fingerprint className="h-4 w-4" />
                              {t("auth.passkeySignIn")}
                            </Button>
                          </GlareHover>
                          <p className="text-center text-[11px] leading-4 text-muted-foreground">
                            {t("auth.passkeySignInHint")}
                          </p>
                        </div>
                      ) : webauthnReady === false ? (
                        <p className="mb-3 text-center text-xs leading-5 text-muted-foreground">
                          {secureContext ? t("auth.passkeyUnavailable") : t("auth.passkeyNotSecure")}
                        </p>
                      ) : null}

                      <GlareHover
                        width="100%"
                        height="auto"
                        background="transparent"
                        borderRadius="999px"
                        borderColor="transparent"
                        glareColor="#ffffff"
                        glareOpacity={0.7}
                        glareSize={170}
                        className="w-full place-items-stretch"
                      >
                        <Button
                          type="button"
                          variant="outline"
                          disabled={submitting}
                          onClick={() => void handleGoogle()}
                          className="relative z-[1] h-11 w-full bg-background transition-transform active:scale-[0.985] motion-reduce:transform-none"
                        >
                          <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
                            <path
                              fill="#4285F4"
                              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.56c2.08-1.92 3.28-4.74 3.28-8.09z"
                            />
                            <path
                              fill="#34A853"
                              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-2.76c-.99.66-2.26 1.06-3.72 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"
                            />
                            <path
                              fill="#FBBC05"
                              d="M5.84 14.11A6.59 6.59 0 0 1 5.5 12c0-.73.13-1.45.34-2.11V7.05H2.18A11 11 0 0 0 1 12c0 1.77.42 3.44 1.18 4.95l3.66-2.84z"
                            />
                            <path
                              fill="#EA4335"
                              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.46 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.05l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"
                            />
                          </svg>
                          {t("auth.google")}
                        </Button>
                      </GlareHover>
                    </>
                  )}

                  <div className="mt-6 flex flex-col gap-1 text-center text-xs">
                    {mode === "signin" && (
                      <button
                        type="button"
                        onClick={() => setMode("forgot")}
                        className="rounded-full px-3 py-2 text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                      >
                        {t("auth.forgot")}
                      </button>
                    )}
                    {mode !== "signin" && (
                      <button
                        type="button"
                        onClick={() => setMode("signin")}
                        className="rounded-full px-3 py-2 text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                      >
                        {t("auth.backToSignIn")}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </BorderGlow>
          </FadeContent>
        </div>
      </div>
    </div>
  );
}

export default AuthPage;
