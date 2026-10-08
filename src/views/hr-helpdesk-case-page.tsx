"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ChevronRight, Lock, Send } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { FecLoader } from "@/components/fec";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  getHelpdeskCase,
  replyHelpdeskCase,
  setHelpdeskAssignee,
  setHelpdeskConfidential,
  setHelpdeskStatus,
  type HelpdeskCaseHistory,
} from "@/lib/hr-helpdesk.functions";
import {
  HELPDESK_ATTACHMENT_MAX_BYTES,
  HELPDESK_STATUSES,
  HELPDESK_STORAGE_MISSING,
  helpdeskFileMime,
  helpdeskTargets,
  type HelpdeskStatus,
} from "@/lib/hr-helpdesk.shared";
import { listStaff } from "@/lib/people.functions";
import { STALE } from "@/lib/query-client";
import { queryKeys } from "@/lib/query-keys";
import { HelpdeskChrome } from "@/views/hr-helpdesk-page";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function notifyError(t: (key: string) => string, error: Error) {
  if (error.message === "invalid attachment") {
    toast.error(t("hrWorkspace.helpdesk.case.attachmentInvalid"));
    return;
  }
  toast.error(error.message === HELPDESK_STORAGE_MISSING ? t("hrWorkspace.helpdesk.storageMissing") : error.message);
}

function formatWhen(iso: string, language: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(language.startsWith("ar") ? "ar" : "en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function readAttachment(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(new Error("invalid attachment"));
    reader.readAsDataURL(file);
  });
}

export default function HrHelpdeskCasePage() {
  const params = useParams<{ id: string }>();
  const id = typeof params?.id === "string" ? params.id : "";
  return (
    <HelpdeskChrome>
      {UUID.test(id) ? <CaseDetail id={id} /> : <Missing />}
    </HelpdeskChrome>
  );
}

function Missing() {
  const { t } = useTranslation();
  return (
    <>
      <BackLink />
      <p className="hd-empty">{t("hrWorkspace.helpdesk.case.notFound")}</p>
    </>
  );
}

function BackLink() {
  const { t } = useTranslation();
  return (
    <Link href="/people/hr/helpdesk" className="hd-back">
      <ArrowLeft aria-hidden />
      {t("hrWorkspace.helpdesk.case.back")}
    </Link>
  );
}

function CaseDetail({ id }: { id: string }) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const categoryLabel = (key: string) => {
    const path = `hrWorkspace.helpdesk.categories.${key}`;
    const label = t(path);
    return label === path ? key : label;
  };
  const ticket = useQuery({
    queryKey: queryKeys.people.hrHelpdeskCase(id),
    queryFn: () => getHelpdeskCase({ id }),
    staleTime: STALE.people,
  });
  const staff = useQuery({
    queryKey: queryKeys.people.staff(null),
    queryFn: () => listStaff({}),
    staleTime: STALE.people,
    enabled: ticket.data?.canManage === true,
  });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: queryKeys.people.hrHelpdeskCase(id) });
    void qc.invalidateQueries({ queryKey: queryKeys.people.hrHelpdesk() });
  };

  if (ticket.isLoading) return <FecLoader density="page" label={t("common.loading")} />;
  if (ticket.isError) {
    const message = ticket.error instanceof Error ? ticket.error.message : "";
    return (
      <>
        <BackLink />
        <p className="hd-empty">
          {message === HELPDESK_STORAGE_MISSING ? t("hrWorkspace.helpdesk.storageMissing") : t("hrWorkspace.loadFailed")}
        </p>
      </>
    );
  }
  if (!ticket.data) {
    return (
      <>
        <BackLink />
        <p className="hd-empty">{t("hrWorkspace.helpdesk.case.notFound")}</p>
      </>
    );
  }

  const row = ticket.data;
  const number = row.ticketNo != null ? String(row.ticketNo) : row.id;
  const targets = helpdeskTargets({
    createdAt: row.createdAt,
    resolutionAnchor: row.resolutionAnchor,
    status: row.status,
    firstResponseHours: row.firstResponseHours,
    resolutionHours: row.resolutionHours,
    firstPublicReplyAt: row.firstPublicReplyAt,
  });

  return (
    <>
      <BackLink />
      <section className="hd-card hd-case__head">
        <div className="hd-case__top">
          <div className="min-w-0">
            <p className="hd-case__kicker">
              {t("hrWorkspace.helpdesk.case.requestLine", { number, category: categoryLabel(row.category) })}
            </p>
            <h2 className="hd-case__title">{row.title || t("hrWorkspace.helpdesk.untitled")}</h2>
            <p className="hd-case__meta">
              {t("hrWorkspace.helpdesk.case.requestedBy", {
                name: row.staffName || t("hrWorkspace.unknownStaff"),
                handler: row.handlerName || t("hrWorkspace.helpdesk.case.awaiting"),
              })}
            </p>
          </div>
          <div className="hd-case__pills">
            {row.confidential ? <span className="hd-status hd-status--waiting">{t("hrWorkspace.helpdesk.case.confidential")}</span> : null}
            <span className={`hd-status hd-status--${row.status}`}>{t(`hrWorkspace.helpdesk.statuses.${row.status}`)}</span>
          </div>
        </div>
      </section>

      <div className="hd-split">
        <div className="hd-case__main">
          <section className="hd-card" aria-label={t("hrWorkspace.helpdesk.case.conversation")}>
            <div className="hd-card__head">
              <h2 className="hd-card__title">{t("hrWorkspace.helpdesk.case.conversation")}</h2>
            </div>
            {row.messages.length === 0 ? (
              <p className="hd-empty">{t("hrWorkspace.helpdesk.empty")}</p>
            ) : (
              <ol>
                {row.messages.map((message) => (
                  <li key={message.id} className="hd-message">
                    <div className="hd-message__top">
                      <p className="hd-message__name">
                        {message.authorName}
                        {message.visibility === "internal" ? ` · ${t("hrWorkspace.helpdesk.case.internal")}` : ""}
                      </p>
                      <p className="hd-message__time">{formatWhen(message.createdAt, i18n.language)}</p>
                    </div>
                    <p className="hd-message__body">{message.body}</p>
                    {message.attachment?.url ? (
                      <p className="hd-message__body">
                        <a href={message.attachment.url} target="_blank" rel="noreferrer">
                          {t("hrWorkspace.helpdesk.case.openFile", { name: message.attachment.fileName })}
                        </a>
                      </p>
                    ) : null}
                  </li>
                ))}
              </ol>
            )}
          </section>
          <ReplyCard id={id} canManage={row.canManage} onDone={refresh} />
        </div>

        <aside className="hd-rail">
          <section className="hd-card hd-rail__pad" aria-label={t("hrWorkspace.helpdesk.case.targets")}>
            <h2 className="hd-card__title">{t("hrWorkspace.helpdesk.case.targets")}</h2>
            <Target
              label={t("hrWorkspace.helpdesk.case.firstDue")}
              value={targets.firstResponseDue ? formatWhen(targets.firstResponseDue, i18n.language) : t("hrWorkspace.helpdesk.case.notSet")}
              overdue={targets.firstResponseOverdue}
              overdueLabel={t("hrWorkspace.helpdesk.case.overdue")}
            />
            <Target
              label={t("hrWorkspace.helpdesk.case.firstReply")}
              value={row.firstPublicReplyAt ? formatWhen(row.firstPublicReplyAt, i18n.language) : t("hrWorkspace.helpdesk.case.awaitingReply")}
              overdue={false}
              overdueLabel=""
            />
            <Target
              label={t("hrWorkspace.helpdesk.case.resolutionDue")}
              value={targets.resolutionDue ? formatWhen(targets.resolutionDue, i18n.language) : t("hrWorkspace.helpdesk.case.notSet")}
              overdue={targets.resolutionOverdue}
              overdueLabel={t("hrWorkspace.helpdesk.case.overdue")}
            />
            <p className="hd-hint">{t("hrWorkspace.helpdesk.case.targetsNote")}</p>
          </section>

          {row.canManage ? (
            <AssignCard
              id={id}
              assigned={Boolean(row.assigneeStaffId)}
              people={(staff.data ?? []).map((person) => ({
                id: person.id,
                label: person.employee_code ? `${person.full_name} · ${person.employee_code}` : person.full_name,
              }))}
              onDone={refresh}
            />
          ) : null}

          {row.canManage ? <StatusCard id={id} onDone={refresh} /> : null}
          {row.canManage ? <PrivacyCard id={id} confidential={row.confidential} onDone={refresh} /> : null}

          <HistoryList items={row.history} language={i18n.language} />
        </aside>
      </div>
    </>
  );
}

function Target({
  label,
  value,
  overdue,
  overdueLabel,
}: {
  label: string;
  value: string;
  overdue: boolean;
  overdueLabel: string;
}) {
  return (
    <div className="hd-target">
      <span>{label}</span>
      <strong>
        {value}
        {overdue ? <span className="hd-overdue"> · {overdueLabel}</span> : null}
      </strong>
    </div>
  );
}

function ReplyCard({ id, canManage, onDone }: { id: string; canManage: boolean; onDone: () => void }) {
  const { t } = useTranslation();
  const [body, setBody] = useState("");
  const [visibility, setVisibility] = useState<"public" | "internal">("public");
  const [file, setFile] = useState<File | null>(null);
  const send = useMutation({
    mutationFn: async () => {
      let attachment: { fileName: string; mimeType: string; dataBase64: string } | null = null;
      if (file) {
        const mime = helpdeskFileMime(file);
        if (file.size > HELPDESK_ATTACHMENT_MAX_BYTES || !mime) {
          throw new Error("invalid attachment");
        }
        attachment = {
          fileName: file.name,
          mimeType: mime,
          dataBase64: await readAttachment(file),
        };
      }
      return replyHelpdeskCase({ id, body: body.trim(), visibility, attachment });
    },
    onSuccess: () => {
      toast.success(t("hrWorkspace.helpdesk.case.replySent"));
      setBody("");
      setVisibility("public");
      setFile(null);
      onDone();
    },
    onError: (error: Error) => notifyError(t, error),
  });

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (body.trim().length < 1) {
      toast.error(t("hrWorkspace.helpdesk.case.replyRequired"));
      return;
    }
    send.mutate();
  };

  return (
    <section className="hd-card hd-reply" aria-label={t("hrWorkspace.helpdesk.case.reply")}>
      <h2 className="hd-card__title">{t("hrWorkspace.helpdesk.case.reply")}</h2>
      <form className="hd-fields mt-3" onSubmit={onSubmit}>
        {canManage ? (
          <div className="space-y-2">
            <Label htmlFor="helpdesk-visibility">{t("hrWorkspace.helpdesk.case.visibility")}</Label>
            <select
              id="helpdesk-visibility"
              className="hd-select"
              value={visibility}
              onChange={(event) => setVisibility(event.target.value as "public" | "internal")}
            >
              <option value="public">{t("hrWorkspace.helpdesk.case.visibilityPublic")}</option>
              <option value="internal">{t("hrWorkspace.helpdesk.case.visibilityInternal")}</option>
            </select>
          </div>
        ) : null}
        <p className="hd-help">
          {visibility === "internal"
            ? t("hrWorkspace.helpdesk.case.visibilityInternalHint")
            : t("hrWorkspace.helpdesk.case.visibilityPublicHint")}
        </p>
        <div className="space-y-2">
          <Label htmlFor="helpdesk-reply">{t("hrWorkspace.helpdesk.case.yourReply")}</Label>
          <Textarea id="helpdesk-reply" value={body} onChange={(event) => setBody(event.target.value)} rows={4} maxLength={4000} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="helpdesk-reply-file">{t("hrWorkspace.helpdesk.case.attachment")}</Label>
          <input
            id="helpdesk-reply-file"
            className="hd-file"
            type="file"
            accept="application/pdf,image/png,image/jpeg,.pdf,.png,.jpg,.jpeg"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
          <p className="hd-hint">{t("hrWorkspace.helpdesk.case.attachmentHint")}</p>
        </div>
        <Button type="submit" className="hd-btn w-fit" disabled={send.isPending}>
          <Send />
          {t("hrWorkspace.helpdesk.case.sendReply")}
        </Button>
      </form>
    </section>
  );
}

function AssignCard({
  id,
  assigned,
  people,
  onDone,
}: {
  id: string;
  assigned: boolean;
  people: { id: string; label: string }[];
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState("");
  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (needle.length < 2) return [];
    return people.filter((person) => person.label.toLowerCase().includes(needle)).slice(0, 8);
  }, [people, query]);
  const assign = useMutation({
    mutationFn: (assigneeStaffId: string | null) => setHelpdeskAssignee({ id, assigneeStaffId }),
    onSuccess: (_data, assigneeStaffId) => {
      toast.success(assigneeStaffId ? t("hrWorkspace.helpdesk.case.assigned") : t("hrWorkspace.helpdesk.case.unassignedDone"));
      setQuery("");
      setPicked("");
      onDone();
    },
    onError: (error: Error) => notifyError(t, error),
  });

  return (
    <section className="hd-card hd-rail__pad" aria-label={t("hrWorkspace.helpdesk.case.assign")}>
      <h2 className="hd-card__title">{t("hrWorkspace.helpdesk.case.assign")}</h2>
      <Label htmlFor="helpdesk-handler" className="sr-only">
        {t("hrWorkspace.helpdesk.case.assignSearch")}
      </Label>
      <input
        id="helpdesk-handler"
        className="hd-select mt-3 w-full"
        value={query}
        placeholder={t("hrWorkspace.helpdesk.case.assignSearch")}
        onChange={(event) => {
          setQuery(event.target.value);
          setPicked("");
        }}
      />
      {query.trim().length < 2 ? (
        <p className="hd-hint">{t("hrWorkspace.helpdesk.case.assignMin")}</p>
      ) : matches.length === 0 ? (
        <p className="hd-hint">{t("hrWorkspace.helpdesk.case.assignNone")}</p>
      ) : (
        <div className="hd-matches">
          {matches.map((person) => (
            <button
              key={person.id}
              type="button"
              className="hd-match"
              aria-pressed={picked === person.id}
              onClick={() => setPicked(person.id)}
            >
              {person.label}
            </button>
          ))}
        </div>
      )}
      <div className="hd-actions">
        <Button
          type="button"
          className="hd-btn"
          disabled={!picked || assign.isPending}
          onClick={() => {
            if (!picked) {
              toast.error(t("hrWorkspace.helpdesk.case.pickHandler"));
              return;
            }
            assign.mutate(picked);
          }}
        >
          {t("hrWorkspace.helpdesk.case.assignBtn")}
        </Button>
        <Button type="button" variant="outline" disabled={!assigned || assign.isPending} onClick={() => assign.mutate(null)}>
          {t("hrWorkspace.helpdesk.case.unassign")}
        </Button>
      </div>
      <p className="hd-hint">{t("hrWorkspace.helpdesk.case.assignNote")}</p>
    </section>
  );
}

function StatusCard({ id, onDone }: { id: string; onDone: () => void }) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<HelpdeskStatus | "">("");
  const [reason, setReason] = useState("");
  const update = useMutation({
    mutationFn: () => setHelpdeskStatus({ id, status: status as HelpdeskStatus, reason: reason.trim() }),
    onSuccess: () => {
      toast.success(t("hrWorkspace.helpdesk.case.statusSaved"));
      setStatus("");
      setReason("");
      onDone();
    },
    onError: (error: Error) => notifyError(t, error),
  });

  return (
    <section className="hd-card hd-rail__pad" aria-label={t("hrWorkspace.helpdesk.case.statusTitle")}>
      <h2 className="hd-card__title">{t("hrWorkspace.helpdesk.case.statusTitle")}</h2>
      <form
        className="hd-fields mt-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (!status) return;
          update.mutate();
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="helpdesk-new-status">{t("hrWorkspace.helpdesk.case.newStatus")}</Label>
          <select
            id="helpdesk-new-status"
            className="hd-select"
            value={status}
            onChange={(event) => setStatus(event.target.value as HelpdeskStatus | "")}
          >
            <option value="">{t("hrWorkspace.helpdesk.case.chooseStatus")}</option>
            {HELPDESK_STATUSES.map((item) => (
              <option key={item} value={item}>
                {t(`hrWorkspace.helpdesk.statuses.${item}`)}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="helpdesk-reason">{t("hrWorkspace.helpdesk.case.reason")}</Label>
          <Textarea id="helpdesk-reason" value={reason} onChange={(event) => setReason(event.target.value)} rows={3} maxLength={1000} />
        </div>
        <Button type="submit" className="hd-btn w-fit" disabled={!status || update.isPending}>
          {t("hrWorkspace.helpdesk.case.updateStatus")}
        </Button>
      </form>
    </section>
  );
}

function PrivacyCard({ id, confidential, onDone }: { id: string; confidential: boolean; onDone: () => void }) {
  const { t } = useTranslation();
  const update = useMutation({
    mutationFn: () => setHelpdeskConfidential({ id, confidential: !confidential }),
    onSuccess: () => {
      toast.success(t("hrWorkspace.helpdesk.case.confidentialSaved"));
      onDone();
    },
    onError: (error: Error) => notifyError(t, error),
  });

  return (
    <section className="hd-card hd-rail__pad" aria-label={t("hrWorkspace.helpdesk.case.privacy")}>
      <h2 className="hd-card__title">{t("hrWorkspace.helpdesk.case.privacy")}</h2>
      <p className="hd-hint">{t("hrWorkspace.helpdesk.case.privacyBody")}</p>
      <Button type="button" variant="outline" disabled={update.isPending} onClick={() => update.mutate()}>
        <Lock />
        {confidential ? t("hrWorkspace.helpdesk.case.clearConfidential") : t("hrWorkspace.helpdesk.case.makeConfidential")}
      </Button>
    </section>
  );
}

function HistoryList({ items, language }: { items: HelpdeskCaseHistory[]; language: string }) {
  const { t } = useTranslation();
  return (
    <details className="hd-history">
      <summary>
        <ChevronRight className="hd-history__chev" aria-hidden />
        {t("hrWorkspace.helpdesk.case.history", { count: items.length })}
      </summary>
      <ol>
        {items.map((item) => (
          <li key={item.id}>
            <p>{historyLabel(t, item)}</p>
            <p className="hd-row__meta">
              {item.actorName} · {formatWhen(item.createdAt, language)}
            </p>
          </li>
        ))}
      </ol>
    </details>
  );
}

function historyLabel(t: (key: string, options?: Record<string, unknown>) => string, item: HelpdeskCaseHistory) {
  const reason = typeof item.detail.reason === "string" ? item.detail.reason : "";
  const status = typeof item.detail.status === "string" ? item.detail.status : "";
  const name = typeof item.detail.assigneeName === "string" ? item.detail.assigneeName : "";
  if (item.kind === "created") return t("hrWorkspace.helpdesk.case.historyCreated");
  if (item.kind === "reply") return t("hrWorkspace.helpdesk.case.historyReply");
  if (item.kind === "internal_note") return t("hrWorkspace.helpdesk.case.historyInternal");
  if (item.kind === "assigned") return t("hrWorkspace.helpdesk.case.historyAssigned", { name: name || t("hrWorkspace.unknownStaff") });
  if (item.kind === "unassigned") return t("hrWorkspace.helpdesk.case.historyUnassigned");
  if (item.kind === "confidential") return t("hrWorkspace.helpdesk.case.historyConfidential");
  if (item.kind === "public") return t("hrWorkspace.helpdesk.case.historyPublic");
  const statusLabel = status ? t(`hrWorkspace.helpdesk.statuses.${status}`) : item.kind;
  const base = t("hrWorkspace.helpdesk.case.historyStatus", { status: statusLabel });
  return reason ? `${base}. ${t("hrWorkspace.helpdesk.case.historyReason", { reason })}` : base;
}
