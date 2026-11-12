"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState, useTransition } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { FecButton as Button } from "@/components/fec";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { revealCallCenterSettingSecret } from "@/lib/call-center/call-center.functions";
import type { CallCenterSecretField } from "@/lib/call-center/types";

function maskFromLast4(last4: string): string {
  const tip = last4.trim();
  if (!tip) return "••••••••";
  return `••••••••${tip}`;
}

type SecretFieldProps = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  isSet: boolean;
  last4?: string;
  revealField?: CallCenterSecretField;
  disabled?: boolean;
  className?: string;
};

export function CallCenterSecretField({
  id,
  label,
  value,
  onChange,
  isSet,
  last4 = "",
  revealField,
  disabled = false,
  className,
}: SecretFieldProps) {
  const { t } = useTranslation();
  const [show, setShow] = useState(false);
  const [revealing, startReveal] = useTransition();

  function reveal() {
    if (!revealField) return;
    startReveal(async () => {
      const result = await revealCallCenterSettingSecret({ field: revealField });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      if (!result.data.value) {
        toast.error(t("callCenterAdmin.secretEmpty"));
        return;
      }
      onChange(result.data.value);
      setShow(true);
    });
  }

  return (
    <div className={className ?? "space-y-1.5"}>
      <div className="flex flex-wrap items-center gap-2">
        <Label htmlFor={id}>{label}</Label>
        {isSet ? (
          <Badge variant="secondary">{t("callCenterAdmin.secretSaved")}</Badge>
        ) : (
          <Badge variant="outline">{t("callCenterAdmin.secretNotSet")}</Badge>
        )}
      </div>
      {isSet && !value ? (
        <p className="font-mono text-xs text-muted-foreground" aria-live="polite">
          {maskFromLast4(last4)}
        </p>
      ) : null}
      <div className="relative">
        <Input
          id={id}
          type={show ? "text" : "password"}
          autoComplete="new-password"
          spellCheck={false}
          disabled={disabled}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={
            isSet
              ? t("callCenterAdmin.secretKeepPlaceholder")
              : t("callCenterAdmin.secretEmptyPlaceholder")
          }
          className="pe-10"
        />
        {value ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute end-1 top-1/2 h-8 w-8 -translate-y-1/2"
            disabled={disabled}
            onClick={() => setShow((prev) => !prev)}
            aria-label={show ? t("callCenterAdmin.hideSecret") : t("callCenterAdmin.showSecret")}
          >
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </Button>
        ) : null}
      </div>
      {isSet && revealField && !value ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || revealing}
          onClick={() => reveal()}
        >
          {revealing ? t("callCenterAdmin.revealingSecret") : t("callCenterAdmin.revealSecret")}
        </Button>
      ) : null}
    </div>
  );
}
