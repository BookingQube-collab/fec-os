"use client";

import { useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CHAT_POLL_OPTIONS_MAX, CHAT_POLL_OPTIONS_MIN, createPollSchema } from "@/lib/chat/poll-rules";

export type PollDraft = {
  question: string;
  options: string[];
  allowMultiple: boolean;
  anonymous: boolean;
  expiresAt?: string;
  clientMessageId: string;
};

export function PollDialog({
  open,
  onOpenChange,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (input: PollDraft) => Promise<void>;
}) {
  const { t } = useTranslation();
  const questionId = useId();
  const expiresId = useId();
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [allowMultiple, setAllowMultiple] = useState(false);
  const [anonymous, setAnonymous] = useState(false);
  const [expiresAt, setExpiresAt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const clientId = useRef<string | null>(null);

  function close(next: boolean) {
    if (!next) {
      setQuestion("");
      setOptions(["", ""]);
      setAllowMultiple(false);
      setAnonymous(false);
      setExpiresAt("");
      setError(null);
      setPending(false);
      clientId.current = null;
    }
    onOpenChange(next);
  }

  async function submit() {
    const labels = options.map((label) => label.trim()).filter((label) => label.length > 0);
    const expiresTime = expiresAt ? new Date(expiresAt).getTime() : Number.NaN;
    if (expiresAt && !Number.isFinite(expiresTime)) {
      setError(t("chat.pollExpires"));
      return;
    }
    const iso = expiresAt ? new Date(expiresTime).toISOString() : undefined;
    const clientMessageId = clientId.current ?? crypto.randomUUID();
    clientId.current = clientMessageId;
    const parsed = createPollSchema.safeParse({
      conversationId: "00000000-0000-4000-8000-000000000001",
      clientMessageId,
      question,
      options: labels,
      allowMultiple,
      anonymous,
      ...(iso ? { expiresAt: iso } : {}),
    });
    if (!parsed.success) {
      setError(parsed.error.errors[0]?.message ?? t("chat.poll"));
      return;
    }
    setPending(true);
    setError(null);
    try {
      await onCreate({
        question: parsed.data.question,
        options: parsed.data.options,
        allowMultiple: parsed.data.allowMultiple,
        anonymous: parsed.data.anonymous,
        clientMessageId,
        ...(parsed.data.expiresAt ? { expiresAt: parsed.data.expiresAt } : {}),
      });
      close(false);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : t("chat.loadFailed"));
      setPending(false);
    }
  }

  const maxLocal = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16);

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("chat.pollCreate")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor={questionId}>{t("chat.pollQuestion")}</Label>
            <Textarea id={questionId} rows={2} value={question} onChange={(event) => setQuestion(event.target.value)} />
          </div>
          <div className="space-y-2">
            {options.map((value, index) => (
              <div key={index} className="flex items-center gap-2">
                <Label className="sr-only" htmlFor={`${questionId}-option-${index}`}>
                  {t("chat.pollOption", { n: index + 1 })}
                </Label>
                <Input
                  id={`${questionId}-option-${index}`}
                  value={value}
                  placeholder={t("chat.pollOption", { n: index + 1 })}
                  onChange={(event) =>
                    setOptions((current) => current.map((item, itemIndex) => (itemIndex === index ? event.target.value : item)))
                  }
                />
                {options.length > CHAT_POLL_OPTIONS_MIN ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={t("chat.pollRemoveOption")}
                    onClick={() => setOptions((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                  >
                    {t("chat.removeFile")}
                  </Button>
                ) : null}
              </div>
            ))}
            {options.length < CHAT_POLL_OPTIONS_MAX ? (
              <Button type="button" variant="outline" size="sm" onClick={() => setOptions((current) => [...current, ""])}>
                {t("chat.pollAddOption")}
              </Button>
            ) : null}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={allowMultiple} onCheckedChange={(value) => setAllowMultiple(value === true)} />
            {t("chat.pollAllowMultiple")}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={anonymous} onCheckedChange={(value) => setAnonymous(value === true)} />
            {t("chat.pollAnonymous")}
          </label>
          <div className="space-y-1.5">
            <Label htmlFor={expiresId}>{t("chat.pollExpires")}</Label>
            <Input id={expiresId} type="datetime-local" value={expiresAt} max={maxLocal} onChange={(event) => setExpiresAt(event.target.value)} />
          </div>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => close(false)}>
            {t("common.cancel")}
          </Button>
          <Button type="button" disabled={pending} onClick={() => void submit()}>
            {t("chat.pollCreate")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
