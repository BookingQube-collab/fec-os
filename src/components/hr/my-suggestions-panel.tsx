"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Textarea } from "@/components/ui/textarea";
import { listMySuggestions, submitSuggestion } from "@/lib/hr-suggestions.functions";
import { SUGGESTION_CATEGORIES, type SuggestionCategory } from "@/lib/hr-suggestions";
import { formatWorkDateDdMmYyyy } from "@/lib/attendance-display";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";

function EssEmpty({ children }: { children: ReactNode }) {
  return <p className="hd-empty">{children}</p>;
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

  return (
    <div className="hd-stack">
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
            onValueChange={(value) => setCategory(value === "__none__" ? "" : (value as SuggestionCategory))}
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
          className="min-h-11 w-fit"
          disabled={!canSend}
          onClick={() =>
            submit.mutate({
              title: title.trim(),
              body: body.trim(),
              category: category || null,
            })
          }
        >
          {t("hr.me.suggestionSubmit")}
        </Button>
      </div>

      {(list.data ?? []).length === 0 && !list.isLoading && !list.isError ? (
        <EssEmpty>{t("hr.me.suggestionsEmpty")}</EssEmpty>
      ) : null}
      {(list.data ?? []).length > 0 ? (
        <ul>
          {(list.data ?? []).map((row) => (
            <li key={row.id}>
              <div className="hd-row !items-start">
                <div className="min-w-0 flex-1">
                  <p className="hd-row__title">{row.title}</p>
                  <p className="hd-row__meta whitespace-pre-wrap">{row.body}</p>
                  {row.adminNote ? (
                    <p className="mt-1 text-sm text-muted-foreground">
                      {t("hr.me.suggestionNote")}: {row.adminNote}
                    </p>
                  ) : null}
                  <p className="hd-row__meta mt-1">
                    {formatWorkDateDdMmYyyy(row.createdAt.slice(0, 10))}
                    {row.category ? ` · ${t(`hr.suggestions.category.${row.category}`)}` : ""}
                  </p>
                </div>
                <Badge variant={row.status === "closed" ? "muted" : row.status === "seen" ? "secondary" : "success"}>
                  {t(`hr.suggestions.status.${row.status}`)}
                </Badge>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
