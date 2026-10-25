"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Lightbulb, MessageSquareText, Send } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Textarea } from "@/components/ui/textarea";
import { formatWorkDateDdMmYyyy } from "@/lib/attendance-display";
import { listMySuggestions, submitSuggestion } from "@/lib/hr-suggestions.functions";
import { SUGGESTION_CATEGORIES, type SuggestionCategory, type SuggestionStatus } from "@/lib/hr-suggestions";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";
import { cn } from "@/lib/utils";

function EssEmpty({ children }: { children: ReactNode }) {
  return <p className="hd-empty">{children}</p>;
}

function statusBadgeVariant(status: SuggestionStatus): "success" | "secondary" | "muted" {
  if (status === "new") return "success";
  if (status === "seen") return "secondary";
  return "muted";
}

export function MySuggestionsPanel() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState<SuggestionCategory | "">("");

  const list = useQuery({
    queryKey: queryKeys.people.hrSuggestions({ mine: true }),
    queryFn: () => listMySuggestions({}),
    staleTime: STALE.people,
    refetchOnWindowFocus: true,
  });

  const submit = useMutation({
    mutationFn: submitSuggestion,
    onSuccess: () => {
      toast.success(t("hr.me.suggestionSubmitted"));
      setTitle("");
      setBody("");
      setCategory("");
      void qc.invalidateQueries({ queryKey: queryKeys.people.hrSuggestions() });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const canSend = title.trim().length > 0 && body.trim().length > 0 && !submit.isPending;
  const rows = list.data ?? [];

  return (
    <div className="hd-stack">
      <div className="rounded-2xl border border-border/80 bg-secondary/20 p-3 sm:p-4">
        <div className="mb-3 flex items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-background text-foreground shadow-sm">
            <Lightbulb className="h-4 w-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold tracking-tight">{t("hr.me.suggestionComposeTitle")}</p>
            <p className="text-xs text-muted-foreground">{t("hr.me.suggestionComposeHint")}</p>
          </div>
        </div>

        <div className="hd-fields">
          <div>
            <Label htmlFor="me-suggestion-title">{t("hr.me.suggestionTitle")}</Label>
            <Input
              id="me-suggestion-title"
              value={title}
              maxLength={120}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("hr.me.suggestionTitlePlaceholder")}
            />
          </div>
          <div>
            <Label htmlFor="me-suggestion-body">{t("hr.me.suggestionBody")}</Label>
            <Textarea
              id="me-suggestion-body"
              rows={4}
              value={body}
              maxLength={4000}
              onChange={(e) => setBody(e.target.value)}
              placeholder={t("hr.me.suggestionBodyPlaceholder")}
            />
          </div>
          <div className="max-w-xs">
            <Label>{t("hr.me.suggestionCategory")}</Label>
            <SearchableSelect
              value={category || "__none__"}
              onValueChange={(value) =>
                setCategory(value === "__none__" ? "" : (value as SuggestionCategory))
              }
              aria-label={t("hr.me.suggestionCategory")}
              options={[
                { value: "__none__", label: t("hr.me.suggestionCategoryNone") },
                ...SUGGESTION_CATEGORIES.map((value) => ({
                  value,
                  label: t(`hr.suggestions.category.${value}`),
                })),
              ]}
            />
          </div>
          <Button
            className="min-h-11 w-fit gap-2"
            disabled={!canSend}
            onClick={() =>
              submit.mutate({
                title: title.trim(),
                body: body.trim(),
                category: category || null,
              })
            }
          >
            <Send className="h-4 w-4" aria-hidden />
            {t("hr.me.suggestionSubmit")}
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-sm font-semibold tracking-tight">{t("hr.me.mySuggestionsTitle")}</p>
          {rows.length > 0 ? (
            <p className="text-xs text-muted-foreground">
              {t("hr.me.mySuggestionsCount", { count: rows.length })}
            </p>
          ) : null}
        </div>

        {list.isError ? <EssEmpty>{t("hr.me.suggestionsUnavailable")}</EssEmpty> : null}
        {!list.isLoading && !list.isError && rows.length === 0 ? (
          <EssEmpty>{t("hr.me.suggestionsEmpty")}</EssEmpty>
        ) : null}

        <ul className="space-y-2">
          {rows.map((row) => (
            <li key={row.id}>
              <article
                className={cn(
                  "rounded-2xl border border-border/80 bg-background p-3 sm:p-4",
                  row.status === "new" && "border-emerald-500/25",
                  row.status === "seen" && "border-sky-500/25",
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="hd-row__title">{row.title}</p>
                    <p className="hd-row__meta mt-1">
                      {formatWorkDateDdMmYyyy(row.createdAt.slice(0, 10))}
                      {row.category ? ` · ${t(`hr.suggestions.category.${row.category}`)}` : ""}
                    </p>
                  </div>
                  <Badge variant={statusBadgeVariant(row.status)}>
                    {t(`hr.suggestions.status.${row.status}`)}
                  </Badge>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm text-foreground/90">{row.body}</p>
                {row.adminNote ? (
                  <div className="mt-3 rounded-xl border border-border/70 bg-secondary/30 px-3 py-2">
                    <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                      <MessageSquareText className="h-3.5 w-3.5" aria-hidden />
                      {t("hr.me.suggestionNote")}
                    </p>
                    <p className="whitespace-pre-wrap text-sm">{row.adminNote}</p>
                  </div>
                ) : row.status === "new" ? (
                  <p className="mt-2 text-xs text-muted-foreground">{t("hr.me.suggestionAwaiting")}</p>
                ) : null}
              </article>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
