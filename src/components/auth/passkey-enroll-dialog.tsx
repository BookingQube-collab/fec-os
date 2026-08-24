"use client";

import { useEffect, useState } from "react";
import { Fingerprint } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import {
  isWebAuthnAvailable,
  isWebAuthnUserCancel,
  registerDevicePasskey,
} from "@/lib/webauthn/browser";
import {
  consumePasskeyJustUsed,
  dismissPasskeyPrompt,
  readPasskeyHint,
  wasPasskeyPromptDismissed,
} from "@/lib/webauthn/hint";

export function PasskeyEnrollDialog() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isWebAuthnAvailable()) return;

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event !== "SIGNED_IN" || !session?.user) return;
      if (consumePasskeyJustUsed()) return;

      const uid = session.user.id;
      const hint = readPasskeyHint();
      if (hint?.userId === uid && (hint.credentialIds?.length ?? 0) > 0) return;
      if (wasPasskeyPromptDismissed(uid)) return;

      setUserId(uid);
      setOpen(true);
    });

    return () => data.subscription.unsubscribe();
  }, []);

  const close = (dismiss = false) => {
    if (dismiss && userId) dismissPasskeyPrompt(userId);
    setOpen(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await registerDevicePasskey();
      toast.success(t("auth.passkeySaved"));
      setOpen(false);
    } catch (error) {
      if (isWebAuthnUserCancel(error)) {
        setSaving(false);
        return;
      }
      toast.error(error instanceof Error ? error.message : t("auth.passkeySaveFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? close() : setOpen(next))}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="mb-2 grid h-11 w-11 place-items-center rounded-2xl bg-primary text-primary-foreground">
            <Fingerprint className="h-5 w-5" />
          </div>
          <DialogTitle>{t("auth.passkeySaveTitle")}</DialogTitle>
          <DialogDescription>{t("auth.passkeySaveBody")}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button type="button" variant="ghost" disabled={saving} onClick={() => close(true)}>
            {t("auth.passkeySaveSkip")}
          </Button>
          <Button type="button" disabled={saving} onClick={() => void handleSave()}>
            {saving ? t("common.pleaseWait") : t("auth.passkeySaveCta")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
