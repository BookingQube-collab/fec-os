"use client";

/* Hallmark · component: chat panel · genre: modern-minimal · theme: existing FEC tokens
 * states: default · hover · focus · active · disabled · loading · error · success
 * contrast: pass
 */

import { ChevronDown, MessageCircle, Send, Smile, Trash2, X } from "lucide-react";
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { askHrAssistant } from "@/lib/hr-assist/assistant.functions";
import { cn } from "@/lib/utils";

type Bubble = {
  id: string;
  role: "user" | "assistant";
  text: string;
  sourceLine?: string;
  pending?: boolean;
  error?: boolean;
};

let bubbleSeq = 0;

function nextId(): string {
  bubbleSeq += 1;
  return `hr-assistant-${bubbleSeq}`;
}

export function HrAssistantWidget({
  locationId,
  dateFrom,
  dateTo,
  notes,
}: {
  locationId: string | null;
  dateFrom: string;
  dateTo: string;
  notes?: ReactNode;
}) {
  const { t, i18n } = useTranslation();
  const dir = i18n.dir();
  const titleId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [messages, setMessages] = useState<Bubble[]>(() => [
    { id: "greeting", role: "assistant", text: "" },
  ]);

  const greeting = t("hrAssistant.greeting");
  const thread = messages.map((message) =>
    message.id === "greeting" ? { ...message, text: greeting } : message,
  );
  const canSend = draft.trim().length > 0 && !pending;

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    endRef.current?.scrollIntoView({ block: "end" });
  }, [open, messages]);

  function clearConversation() {
    if (pending) return;
    setDraft("");
    setMessages([{ id: "greeting", role: "assistant", text: greeting }]);
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    const question = draft.trim();
    if (!question || pending) return;
    const userId = nextId();
    const pendingId = nextId();
    setDraft("");
    setPending(true);
    setMessages((current) => [
      ...current,
      { id: userId, role: "user", text: question },
      { id: pendingId, role: "assistant", text: t("hrAssistant.thinking"), pending: true },
    ]);
    try {
      const answer = await askHrAssistant({
        question,
        locationId,
        dateFrom,
        dateTo,
      });
      const source = t(`hrAssistant.sources.${answer.source}`, { defaultValue: answer.source });
      setMessages((current) =>
        current.map((message) =>
          message.id === pendingId
            ? {
                id: pendingId,
                role: "assistant",
                text: t(answer.messageKey, answer.values),
                sourceLine: t("hrAssistant.sourceLine", {
                  periodFrom: answer.periodFrom,
                  periodTo: answer.periodTo,
                  source,
                }),
              }
            : message,
        ),
      );
    } catch {
      setMessages((current) =>
        current.map((message) =>
          message.id === pendingId
            ? { id: pendingId, role: "assistant", text: t("hrAssist.error"), error: true }
            : message,
        ),
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div dir={dir} className="pointer-events-none fixed bottom-[calc(5.25rem+env(safe-area-inset-bottom))] end-4 z-40 flex flex-col items-end gap-3 md:bottom-6">
      {open ? (
        <section
          role="dialog"
          aria-labelledby={titleId}
          className="pointer-events-auto flex max-h-[min(28rem,calc(100svh-16rem))] w-[min(22.5rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-elevated-md md:max-h-[min(34rem,calc(100svh-8rem))]"
        >
          <header className="flex items-start gap-3 bg-primary px-4 py-3 text-primary-foreground">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-foreground/15">
              <MessageCircle className="h-4 w-4" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <h2 id={titleId} className="text-sm font-semibold" style={{ fontStyle: "normal" }}>
                {t("hrAssistant.title")}
              </h2>
              <p className="text-xs text-primary-foreground/80">{t("hrAssistant.subtitle")}</p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                className="rounded-full p-2 text-primary-foreground/80 hover:bg-primary-foreground/10 hover:text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:translate-y-px disabled:opacity-50"
                aria-label={t("hrAssistant.clear")}
                disabled={pending || thread.length < 2}
                onClick={clearConversation}
              >
                <Trash2 className="h-4 w-4" aria-hidden />
              </button>
              <button
                type="button"
                className="rounded-full p-2 text-primary-foreground/80 hover:bg-primary-foreground/10 hover:text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:translate-y-px"
                aria-label={t("hrAssistant.close")}
                onClick={() => setOpen(false)}
              >
                <ChevronDown className="h-4 w-4" aria-hidden />
              </button>
            </div>
          </header>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {notes ? <div data-hr-assist-notes className="space-y-2 border-b border-border pb-3">{notes}</div> : null}
            <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-electric text-white">
                <Smile className="h-3.5 w-3.5" aria-hidden />
              </span>
              {t("hrAssistant.name")}
            </p>
            {thread.map((message) => (
              <div key={message.id} className={cn("max-w-[90%]", message.role === "user" ? "ms-auto" : "")}>
                <div
                  data-state={message.error ? "error" : message.pending ? "loading" : message.role === "assistant" && message.id !== "greeting" ? "success" : "default"}
                  className={cn(
                    "rounded-2xl px-3 py-2 text-sm leading-5",
                    message.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : message.error
                        ? "border border-destructive/40 bg-destructive/10 text-foreground"
                        : "bg-secondary text-secondary-foreground",
                  )}
                  aria-busy={message.pending || undefined}
                >
                  {message.text}
                </div>
                {message.id === "greeting" ? (
                  <p className="mt-1 text-xs text-muted-foreground">{t("hrAssistant.justNow")}</p>
                ) : null}
                {message.sourceLine ? <p className="mt-1 text-xs text-muted-foreground">{message.sourceLine}</p> : null}
              </div>
            ))}
            <div ref={endRef} />
          </div>

          <form className="border-t border-border p-3" onSubmit={send}>
            <div className="flex items-center gap-2 rounded-full border border-input bg-background py-1 ps-4 pe-1 focus-within:ring-2 focus-within:ring-ring">
              <input
                ref={inputRef}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder={t("hrAssistant.placeholder")}
                aria-label={t("hrAssistant.placeholder")}
                disabled={pending}
                className="min-w-0 flex-1 bg-transparent py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={!canSend}
                aria-label={t("hrAssistant.send")}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:translate-y-px disabled:opacity-50"
              >
                <Send className="h-4 w-4 rtl:-scale-x-100" aria-hidden />
              </button>
            </div>
          </form>
        </section>
      ) : null}

      <button
        type="button"
        className="pointer-events-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-elevated-md hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:translate-y-px"
        aria-expanded={open}
        aria-label={open ? t("hrAssistant.close") : t("hrAssistant.open")}
        onClick={() => setOpen((value) => !value)}
      >
        {open ? <X className="h-5 w-5" aria-hidden /> : <MessageCircle className="h-5 w-5" aria-hidden />}
      </button>
    </div>
  );
}
