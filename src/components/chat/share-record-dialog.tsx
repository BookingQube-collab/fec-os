"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useChatEntitySearch } from "@/hooks/queries/useChat";
import { CHAT_ENTITY_FALLBACK_BODY, CHAT_SHAREABLE_ENTITY_TYPES, chatEntityNoteIssue } from "@/lib/chat/entity-rules";
import type { ChatEntitySearchHit } from "@/lib/chat.functions";
import { cn } from "@/lib/utils";

export function ShareRecordDialog({
  open,
  onOpenChange,
  onShare,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onShare: (input: { entityType: string; entityId: string; note?: string; clientMessageId: string }) => Promise<void>;
}) {
  const { t } = useTranslation();
  const queryId = useId();
  const typeId = useId();
  const noteId = useId();
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [entityType, setEntityType] = useState("");
  const [selected, setSelected] = useState<ChatEntitySearchHit | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const clientId = useRef<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (open) return;
    setQuery("");
    setDebounced("");
    setEntityType("");
    setSelected(null);
    setNote("");
    setError(null);
    setPending(false);
    clientId.current = null;
  }, [open]);

  const search = useChatEntitySearch(debounced, entityType || null, open);
  const hits = debounced.length >= 2 ? (search.data ?? []) : [];
  const noteIssue = chatEntityNoteIssue(note);
  const canShare = Boolean(selected) && noteIssue == null && !pending;

  async function share() {
    if (!selected || noteIssue) return;
    const clientMessageId = clientId.current ?? crypto.randomUUID();
    clientId.current = clientMessageId;
    setPending(true);
    setError(null);
    try {
      await onShare({
        entityType: selected.entityType,
        entityId: selected.entityId,
        note: note.trim() && note.trim() !== CHAT_ENTITY_FALLBACK_BODY ? note.trim() : undefined,
        clientMessageId,
      });
      onOpenChange(false);
    } catch (shareError) {
      setError(shareError instanceof Error ? shareError.message : t("chat.loadFailed"));
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("chat.shareRecordTitle")}</DialogTitle>
          <DialogDescription>{t("chat.shareRecordHint")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor={typeId}>{t("chat.shareRecordType")}</Label>
          <select
            id={typeId}
            value={entityType}
            onChange={(event) => {
              setEntityType(event.target.value);
              setSelected(null);
            }}
            className="flex h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">{t("chat.shareRecordAny")}</option>
            {CHAT_SHAREABLE_ENTITY_TYPES.map((type) => (
              <option key={type} value={type}>
                {t(`chat.entityTypes.${type}`)}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor={queryId}>{t("chat.shareRecord")}</Label>
          <Input
            id={queryId}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setSelected(null);
            }}
            placeholder={t("chat.shareRecordPlaceholder")}
            autoComplete="off"
            maxLength={80}
            autoFocus
          />
        </div>
        {debounced.length >= 2 && search.isFetching ? <p className="text-sm text-muted-foreground">{t("chat.searching")}</p> : null}
        {debounced.length >= 2 && search.isError ? (
          <p role="alert" className="text-sm text-destructive">
            {search.error instanceof Error ? search.error.message : t("chat.loadFailed")}
          </p>
        ) : null}
        {debounced.length >= 2 && !search.isFetching && !search.isError && hits.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("chat.shareRecordEmpty")}</p>
        ) : null}
        <ul className="max-h-56 space-y-1 overflow-y-auto" aria-label={t("chat.shareRecordResults")}>
          {hits.map((hit) => {
            const pressed = selected?.entityType === hit.entityType && selected.entityId === hit.entityId;
            return (
              <li key={`${hit.entityType}:${hit.entityId}`}>
                <button
                  type="button"
                  aria-pressed={pressed}
                  onClick={() => setSelected(hit)}
                  className={cn(
                    "flex w-full flex-col rounded-lg px-3 py-2 text-start text-sm",
                    pressed ? "bg-primary/10" : "hover:bg-muted/70",
                  )}
                >
                  <span className="text-xs text-muted-foreground">{t(`chat.entityTypes.${hit.entityType}`)}</span>
                  <span className="font-medium">{hit.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {[hit.code, hit.jobTitle, hit.locationName, hit.status, hit.priority].filter(Boolean).join(" · ")}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        <div className="space-y-2">
          <Label htmlFor={noteId}>{t("chat.shareRecordNote")}</Label>
          <Textarea id={noteId} value={note} onChange={(event) => setNote(event.target.value)} rows={2} maxLength={8000} />
          {noteIssue ? (
            <p role="alert" className="text-sm text-destructive">
              {noteIssue === "html" ? t("chat.shareRecordHtml") : t("chat.shareRecordLong")}
            </p>
          ) : null}
        </div>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button type="button" disabled={!canShare} onClick={() => void share()}>
            {pending ? t("chat.sending") : t("chat.shareRecordSubmit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
