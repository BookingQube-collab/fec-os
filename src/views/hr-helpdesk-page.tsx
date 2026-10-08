"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, Headset, Inbox, Plus, Settings2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { FecLoader } from "@/components/fec";
import { HrShell } from "@/components/hr/hr-shell";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Textarea } from "@/components/ui/textarea";
import {
  createHelpdeskArticle,
  createHelpdeskRequest,
  createHelpdeskRule,
  deleteHelpdeskRule,
  getHelpdeskComposer,
  getHelpdeskSettings,
  listHelpdeskArticles,
  listHelpdeskRules,
  saveHelpdeskSettings,
  type HelpdeskArticle,
  type HelpdeskRule,
  type HelpdeskSettings,
} from "@/lib/hr-helpdesk.functions";
import {
  DEFAULT_HELPDESK_CATEGORIES,
  HELPDESK_ATTACHMENT_MAX_BYTES,
  HELPDESK_STATUSES,
  HELPDESK_STORAGE_MISSING,
  helpdeskFileMime,
  type HelpdeskStatus,
} from "@/lib/hr-helpdesk.shared";
import { listHelpdeskQuestions } from "@/lib/hr-workspace.functions";
import { usePermission } from "@/hooks/use-permission";
import { listStaff } from "@/lib/people.functions";
import { STALE } from "@/lib/query-client";
import { queryKeys } from "@/lib/query-keys";

type TabId = "inbox" | "guides" | "manage";

const PAGE_SIZE = 8;

export function HelpdeskChrome({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const [requestOpen, setRequestOpen] = useState(false);

  return (
    <HrShell>
      <div className="hr-helpdesk">
        <section className="hd-hero">
          <div className="min-w-0">
            <p className="hd-kicker">{t("hrWorkspace.helpdesk.kicker")}</p>
            <h1 className="hd-title">{t("hrWorkspace.helpdesk.title")}</h1>
            <p className="hd-sub">{t("hrWorkspace.helpdesk.subtitle")}</p>
            <Button type="button" className="hd-btn mt-4" onClick={() => setRequestOpen(true)}>
              <Plus />
              {t("hrWorkspace.helpdesk.newRequest")}
            </Button>
          </div>
          <div className="hd-badge" aria-hidden>
            <Headset />
          </div>
        </section>
        {children}
        <RequestDialog open={requestOpen} onOpenChange={setRequestOpen} />
      </div>
    </HrShell>
  );
}

export default function HrHelpdeskPage() {
  const { t } = useTranslation();
  const canManage = usePermission("hr.manage");
  const [tab, setTab] = useState<TabId>("inbox");
  const active = canManage ? tab : "inbox";

  return (
    <HelpdeskChrome>
      {canManage ? (
        <div className="fec-inner-tabs mt-4" role="tablist" aria-label={t("hrWorkspace.helpdesk.tabsLabel")}>
          {(["inbox", "guides", "manage"] as const).map((id) => {
            const Icon = id === "inbox" ? Inbox : id === "guides" ? BookOpen : Settings2;
            return (
            <button
              key={id}
              type="button"
              role="tab"
              id={`helpdesk-tab-${id}`}
              aria-selected={active === id}
              aria-controls={`helpdesk-panel-${id}`}
              className={active === id ? "fec-inner-tab is-active" : "fec-inner-tab"}
              onClick={() => setTab(id)}
            >
              <Icon aria-hidden />
              {t(`hrWorkspace.helpdesk.tabs.${id}`)}
            </button>
            );
          })}
        </div>
      ) : null}

      <div role="tabpanel" id={`helpdesk-panel-${active}`} aria-labelledby={`helpdesk-tab-${active}`}>
        {active === "inbox" ? <InboxPanel /> : null}
        {active === "guides" ? <GuidesPanel /> : null}
        {active === "manage" ? <ManagePanel /> : null}
      </div>
    </HelpdeskChrome>
  );
}

function useStaffOptions(enabled = true) {
  const staff = useQuery({
    queryKey: queryKeys.people.staff(null),
    queryFn: () => listStaff({}),
    staleTime: STALE.people,
    enabled,
  });
  const options = useMemo(
    () =>
      (staff.data ?? []).map((row) => ({
        value: row.id,
        label: row.employee_code ? `${row.full_name} · ${row.employee_code}` : row.full_name,
      })),
    [staff.data],
  );
  const names = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of staff.data ?? []) map.set(row.id, row.full_name);
    return map;
  }, [staff.data]);
  return { staff, options, names };
}

function useCategoryLabel() {
  const { t } = useTranslation();
  return (key: string) => {
    const path = `hrWorkspace.helpdesk.categories.${key}`;
    const label = t(path);
    return label === path ? key : label;
  };
}

function notifyError(t: (key: string) => string, error: Error) {
  toast.error(error.message === HELPDESK_STORAGE_MISSING ? t("hrWorkspace.helpdesk.storageMissing") : error.message);
}

function InboxPanel() {
  const { t } = useTranslation();
  const canManage = usePermission("hr.manage");
  const categoryLabel = useCategoryLabel();
  const { names } = useStaffOptions(canManage);
  const settings = useQuery({
    queryKey: queryKeys.people.hrHelpdeskSettings(),
    queryFn: () => getHelpdeskSettings({}),
    staleTime: STALE.people,
    enabled: canManage,
  });
  const questions = useQuery({
    queryKey: queryKeys.people.hrHelpdesk(),
    queryFn: () => listHelpdeskQuestions({}),
    staleTime: STALE.people,
  });
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<HelpdeskStatus | "all">("all");
  const [category, setCategory] = useState("all");
  const [page, setPage] = useState(0);

  const rows = questions.data ?? [];
  const counts = useMemo(() => {
    const tally = { open: 0, waiting: 0, in_progress: 0, resolved: 0 };
    for (const row of rows) tally[row.status] += 1;
    return tally;
  }, [rows]);
  const categories = settings.data?.categories?.length ? settings.data.categories : [...DEFAULT_HELPDESK_CATEGORIES];
  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (status !== "all" && row.status !== status) return false;
      if (category !== "all" && row.category !== category) return false;
      if (!needle) return true;
      const assignee = row.assigneeStaffId ? names.get(row.assigneeStaffId) ?? "" : "";
      const haystack = [row.title, row.question, row.staffName, row.employeeCode, assignee, categoryLabel(row.category)]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [rows, search, status, category, names, categoryLabel]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const visible = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);
  const openRows = rows.filter((row) => row.status !== "resolved");
  const workload = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of openRows) {
      const key = row.assigneeStaffId ?? "";
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [openRows]);
  const rate = rows.length === 0 ? null : Math.round((counts.resolved / rows.length) * 100);

  const statItems: { key: HelpdeskStatus; label: string }[] = [
    { key: "open", label: t("hrWorkspace.helpdesk.stats.open") },
    { key: "waiting", label: t("hrWorkspace.helpdesk.stats.waiting") },
    { key: "in_progress", label: t("hrWorkspace.helpdesk.stats.inProgress") },
    { key: "resolved", label: t("hrWorkspace.helpdesk.stats.resolved") },
  ];

  return (
    <>
      <div className="hd-stats">
        {statItems.map((item) => (
          <button
            key={item.key}
            type="button"
            className="hd-stat"
            aria-pressed={status === item.key}
            onClick={() => {
              setStatus((current) => (current === item.key ? "all" : item.key));
              setPage(0);
            }}
          >
            <span className="hd-stat__value">{questions.isLoading ? "—" : counts[item.key]}</span>
            <span className="hd-stat__label">{item.label}</span>
          </button>
        ))}
      </div>

      <div className="hd-split">
        <section className="hd-card" aria-label={t("hrWorkspace.helpdesk.listTitle")}>
          <div className="hd-card__head">
            <h2 className="hd-card__title">{t("hrWorkspace.helpdesk.listTitle")}</h2>
            <div className="hd-tools">
              <Input
                className="hd-search"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(0);
                }}
                placeholder={t("hrWorkspace.helpdesk.searchPlaceholder")}
                aria-label={t("hrWorkspace.helpdesk.search")}
              />
              <select
                className="hd-select hd-select--compact"
                value={status}
                aria-label={t("hrWorkspace.helpdesk.filterStatus")}
                onChange={(event) => {
                  setStatus(event.target.value as HelpdeskStatus | "all");
                  setPage(0);
                }}
              >
                <option value="all">{t("hrWorkspace.helpdesk.allStatuses")}</option>
                {HELPDESK_STATUSES.map((item) => (
                  <option key={item} value={item}>
                    {t(`hrWorkspace.helpdesk.statuses.${item}`)}
                  </option>
                ))}
              </select>
              <select
                className="hd-select hd-select--compact"
                value={category}
                aria-label={t("hrWorkspace.helpdesk.filterCategory")}
                onChange={(event) => {
                  setCategory(event.target.value);
                  setPage(0);
                }}
              >
                <option value="all">{t("hrWorkspace.helpdesk.allCategories")}</option>
                {categories.map((item) => (
                  <option key={item} value={item}>
                    {categoryLabel(item)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {questions.isLoading ? (
            <FecLoader density="page" label={t("common.loading")} />
          ) : questions.isError ? (
            <p className="hd-empty">{t("hrWorkspace.loadFailed")}</p>
          ) : visible.length === 0 ? (
            <p className="hd-empty">
              {rows.length === 0 ? t("hrWorkspace.helpdesk.empty") : t("hrWorkspace.helpdesk.emptyFiltered")}
            </p>
          ) : (
            <ol>
              {visible.map((row) => (
                <li key={row.id}>
                  <Link href={`/people/hr/helpdesk/${row.id}`} className="hd-row">
                    <div className="min-w-0">
                      <p className="hd-row__title">
                        {row.ticketNo ? `#${row.ticketNo} · ` : null}
                        {row.title || t("hrWorkspace.helpdesk.untitled")}
                      </p>
                      <p className="hd-row__meta">
                        {[
                          categoryLabel(row.category),
                          row.staffName,
                          row.employeeCode,
                          row.effectiveOn,
                          row.assigneeStaffId
                            ? names.get(row.assigneeStaffId) ?? t("hrWorkspace.unknownStaff")
                            : t("hrWorkspace.helpdesk.unassigned"),
                          row.confidential ? t("hrWorkspace.helpdesk.case.confidential") : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    <span className={`hd-status hd-status--${row.status}`}>
                      {t(`hrWorkspace.helpdesk.statuses.${row.status}`)}
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          )}

          {filtered.length > PAGE_SIZE ? (
            <div className="hd-pager">
              <span>{t("hrWorkspace.helpdesk.page", { page: safePage + 1, pages: pageCount })}</span>
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>
                  {t("hrWorkspace.helpdesk.prev")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={safePage >= pageCount - 1}
                  onClick={() => setPage(safePage + 1)}
                >
                  {t("hrWorkspace.helpdesk.next")}
                </Button>
              </div>
            </div>
          ) : null}
        </section>

        <aside className="hd-rail">
          <section className="hd-card hd-rail__pad" aria-label={t("hrWorkspace.helpdesk.workload")}>
            <h2 className="hd-card__title">{t("hrWorkspace.helpdesk.workload")}</h2>
            {workload.length === 0 ? (
              <p className="hd-empty">{t("hrWorkspace.helpdesk.workloadEmpty")}</p>
            ) : (
              <ul>
                {workload.map(([id, count]) => (
                  <li key={id || "none"} className="hd-person">
                    <span>
                      {id ? names.get(id) ?? t("hrWorkspace.unknownStaff") : t("hrWorkspace.helpdesk.unassigned")}
                    </span>
                    <strong>{count}</strong>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="hd-card hd-rail__pad" aria-label={t("hrWorkspace.helpdesk.resolution")}>
            <h2 className="hd-card__title">{t("hrWorkspace.helpdesk.resolution")}</h2>
            <div
              className="hd-donut"
              style={{ ["--rate" as string]: String(rate ?? 0) }}
              role="img"
              aria-label={
                rate == null
                  ? t("hrWorkspace.helpdesk.resolutionEmpty")
                  : t("hrWorkspace.helpdesk.resolutionOf", { resolved: counts.resolved, total: rows.length })
              }
            >
              <div className="hd-donut__hole">{rate == null ? "—" : `${rate}%`}</div>
            </div>
            <p className="hd-empty">
              {rate == null
                ? t("hrWorkspace.helpdesk.resolutionEmpty")
                : t("hrWorkspace.helpdesk.resolutionOf", { resolved: counts.resolved, total: rows.length })}
            </p>
          </section>
        </aside>
      </div>
    </>
  );
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

function keepHelpdeskPickerOpen(event: { preventDefault: () => void; target: EventTarget | null }) {
  if (event.target instanceof Element && event.target.closest("[data-radix-popper-content-wrapper]")) {
    event.preventDefault();
  }
}

function RequestDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation();
  const router = useRouter();
  const qc = useQueryClient();
  const canManage = usePermission("hr.manage");
  const categoryLabel = useCategoryLabel();
  const { options } = useStaffOptions(open && canManage);
  const composer = useQuery({
    queryKey: queryKeys.people.hrHelpdeskComposer(),
    queryFn: () => getHelpdeskComposer({}),
    staleTime: STALE.people,
    enabled: open,
  });
  const categories = composer.data?.categories?.length ? composer.data.categories : [...DEFAULT_HELPDESK_CATEGORIES];
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState("");
  const [staffId, setStaffId] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const create = useMutation({
    mutationFn: async () => {
      let attachment: { fileName: string; mimeType: string; dataBase64: string } | null = null;
      if (file) {
        const mime = helpdeskFileMime(file);
        if (file.size > HELPDESK_ATTACHMENT_MAX_BYTES || !mime) {
          throw new Error("invalid attachment");
        }
        attachment = { fileName: file.name, mimeType: mime, dataBase64: await readAttachment(file) };
      }
      const behalf = canManage && staffId && staffId !== composer.data?.staffId ? staffId : null;
      return createHelpdeskRequest({
        subject: subject.trim(),
        category,
        staffId: behalf,
        attachment,
      });
    },
    onSuccess: (result) => {
      toast.success(t("hrWorkspace.helpdesk.logged"));
      setSubject("");
      setCategory("");
      setStaffId("");
      setFile(null);
      onOpenChange(false);
      void qc.invalidateQueries({ queryKey: queryKeys.people.hrHelpdesk() });
      router.push(`/people/hr/helpdesk/${result.id}`);
    },
    onError: (error: Error) => {
      if (error.message === "NO_EMPLOYEE") {
        toast.error(t("hrWorkspace.helpdesk.case.noEmployee"));
        return;
      }
      if (error.message === "invalid attachment") {
        toast.error(t("hrWorkspace.helpdesk.case.attachmentInvalid"));
        return;
      }
      notifyError(t, error);
    },
  });

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (subject.trim().length < 2 || !category) {
      toast.error(t("hrWorkspace.helpdesk.case.subjectRequired"));
      return;
    }
    if (!canManage && !composer.data?.staffId) {
      toast.error(t("hrWorkspace.helpdesk.case.noEmployee"));
      return;
    }
    if (canManage && !composer.data?.staffId && !staffId) {
      toast.error(t("hrWorkspace.helpdesk.case.noEmployee"));
      return;
    }
    create.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="hd-request" onFocusOutside={keepHelpdeskPickerOpen} onInteractOutside={keepHelpdeskPickerOpen} onPointerDownOutside={keepHelpdeskPickerOpen}>
        <DialogHeader className="hd-request__head text-start">
          <DialogTitle className="hd-request__title">{t("hrWorkspace.helpdesk.case.newTitle")}</DialogTitle>
          <DialogDescription className="hd-request__lede">{t("hrWorkspace.helpdesk.case.newBody")}</DialogDescription>
        </DialogHeader>
        <form className="hd-fields" onSubmit={onSubmit}>
          <div className="hd-field">
            <Label htmlFor="helpdesk-subject">{t("hrWorkspace.helpdesk.subject")}</Label>
            <Input
              id="helpdesk-subject"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              maxLength={160}
              required
            />
          </div>
          <div className="hd-field">
            <Label htmlFor="helpdesk-category">{t("hrWorkspace.helpdesk.filterCategory")}</Label>
            <select
              id="helpdesk-category"
              className="hd-select"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              required
            >
              <option value="">{t("hrWorkspace.helpdesk.case.chooseCategory")}</option>
              {categories.map((item) => (
                <option key={item} value={item}>
                  {categoryLabel(item)}
                </option>
              ))}
            </select>
          </div>
          {canManage ? (
            <div className="hd-field">
              <Label htmlFor="helpdesk-behalf">{t("hrWorkspace.helpdesk.case.onBehalf")}</Label>
              <SearchableSelect
                id="helpdesk-behalf"
                className="w-full"
                triggerClassName="focus-visible:ring-0"
                value={staffId}
                onValueChange={setStaffId}
                aria-label={t("hrWorkspace.helpdesk.case.onBehalf")}
                options={options}
                emptyOption={{
                  value: "",
                  label: composer.data?.staffName
                    ? t("hrWorkspace.helpdesk.case.onBehalfSelf", { name: composer.data.staffName })
                    : t("hrWorkspace.helpdesk.case.onBehalfSelfPlain"),
                }}
              />
            </div>
          ) : null}
          <div className="hd-field">
            <Label htmlFor="helpdesk-file">{t("hrWorkspace.helpdesk.case.attachment")}</Label>
            <input
              id="helpdesk-file"
              className="hd-file"
              type="file"
              accept="application/pdf,image/png,image/jpeg,.pdf,.png,.jpg,.jpeg"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
            <p className="hd-hint">{t("hrWorkspace.helpdesk.case.attachmentHint")}</p>
          </div>
          <div className="hd-request__actions">
            <Button type="button" variant="outline" className="hd-request__close focus-visible:ring-0" onClick={() => onOpenChange(false)} disabled={create.isPending}>
              {t("common.close")}
            </Button>
            <Button type="submit" className="hd-btn focus-visible:ring-0" disabled={create.isPending}>
              {t("hrWorkspace.helpdesk.case.submit")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function GuidesPanel() {
  const { t } = useTranslation();
  const categoryLabel = useCategoryLabel();
  const settings = useQuery({
    queryKey: queryKeys.people.hrHelpdeskSettings(),
    queryFn: () => getHelpdeskSettings({}),
    staleTime: STALE.people,
  });
  const articles = useQuery({
    queryKey: queryKeys.people.hrHelpdeskArticles(),
    queryFn: () => listHelpdeskArticles({}),
    staleTime: STALE.people,
  });
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [creating, setCreating] = useState(false);
  const [reading, setReading] = useState<HelpdeskArticle | null>(null);
  const categories = settings.data?.categories?.length ? settings.data.categories : [...DEFAULT_HELPDESK_CATEGORIES];
  const items = articles.data?.items ?? [];
  const filtered = items.filter((article) => {
    if (category !== "all" && article.category !== category) return false;
    const needle = search.trim().toLowerCase();
    if (!needle) return true;
    return `${article.title} ${article.body}`.toLowerCase().includes(needle);
  });

  return (
    <section className="hd-card hd-stack">
      <div className="hd-section">
        <h2>{t("hrWorkspace.helpdesk.guides.title")}</h2>
        <div className="hd-fields hd-fields--split">
          <div className="space-y-2">
            <Label htmlFor="helpdesk-article-search">{t("hrWorkspace.helpdesk.guides.searchLabel")}</Label>
            <Input
              id="helpdesk-article-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("hrWorkspace.helpdesk.guides.searchPlaceholder")}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="helpdesk-article-category">{t("hrWorkspace.helpdesk.guides.category")}</Label>
            <select
              id="helpdesk-article-category"
              className="hd-select"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            >
              <option value="all">{t("hrWorkspace.helpdesk.allCategories")}</option>
              {categories.map((item) => (
                <option key={item} value={item}>
                  {categoryLabel(item)}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <Button type="button" className="hd-btn" onClick={() => setCreating(true)}>
            <Plus />
            {t("hrWorkspace.helpdesk.guides.create")}
          </Button>
        </div>
      </div>

      {articles.isLoading ? (
        <FecLoader density="page" label={t("common.loading")} />
      ) : articles.isError ? (
        <p className="hd-empty">{t("hrWorkspace.loadFailed")}</p>
      ) : articles.data && !articles.data.available ? (
        <p className="hd-note mx-4 mb-4">{t("hrWorkspace.helpdesk.guides.unavailable")}</p>
      ) : filtered.length === 0 ? (
        <div className="hd-empty">
          <p>{t("hrWorkspace.helpdesk.guides.empty")}</p>
          <p>{t("hrWorkspace.helpdesk.guides.emptyHint")}</p>
        </div>
      ) : (
        <div className="hd-scroll">
          <table className="hd-table">
            <thead>
              <tr>
                <th>{t("hrWorkspace.helpdesk.guides.colArticle")}</th>
                <th>{t("hrWorkspace.helpdesk.guides.colCategory")}</th>
                <th>{t("hrWorkspace.helpdesk.guides.colVisibility")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((article) => (
                <tr key={article.id}>
                  <td>{article.title}</td>
                  <td>{categoryLabel(article.category)}</td>
                  <td>{visibilityLabel(t, article)}</td>
                  <td>
                    <Button type="button" variant="outline" size="sm" onClick={() => setReading(article)}>
                      {t("hrWorkspace.helpdesk.guides.read")}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ArticleDialog open={creating} onOpenChange={setCreating} categories={categories} />
      <Dialog open={reading != null} onOpenChange={(next) => !next && setReading(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{reading?.title}</DialogTitle>
            <DialogDescription>{reading ? categoryLabel(reading.category) : ""}</DialogDescription>
          </DialogHeader>
          <p className="whitespace-pre-wrap text-sm leading-6">{reading?.body}</p>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function visibilityLabel(t: (key: string) => string, article: HelpdeskArticle) {
  if (!article.published) return t("hrWorkspace.helpdesk.guides.visibilityDraft");
  return article.visibility === "hr_only"
    ? t("hrWorkspace.helpdesk.guides.visibilityHr")
    : t("hrWorkspace.helpdesk.guides.visibilityAll");
}

function ArticleDialog({
  open,
  onOpenChange,
  categories,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: string[];
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const categoryLabel = useCategoryLabel();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState(categories[0] ?? "other");
  const [visibility, setVisibility] = useState<"all_employees" | "hr_only">("all_employees");
  const [published, setPublished] = useState(true);

  const create = useMutation({
    mutationFn: createHelpdeskArticle,
    onSuccess: () => {
      toast.success(t("hrWorkspace.helpdesk.guides.created"));
      setTitle("");
      setBody("");
      setPublished(true);
      onOpenChange(false);
      void qc.invalidateQueries({ queryKey: queryKeys.people.hrHelpdeskArticles() });
    },
    onError: (error: Error) => notifyError(t, error),
  });

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (title.trim().length < 2 || body.trim().length < 2) {
      toast.error(t("hrWorkspace.helpdesk.guides.required"));
      return;
    }
    create.mutate({
      title: title.trim(),
      body: body.trim(),
      category: category || categories[0] || "other",
      visibility,
      published,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("hrWorkspace.helpdesk.guides.create")}</DialogTitle>
          <DialogDescription>{t("hrWorkspace.helpdesk.guides.emptyHint")}</DialogDescription>
        </DialogHeader>
        <form className="hd-fields" onSubmit={onSubmit}>
          <div className="space-y-2">
            <Label htmlFor="article-title">{t("hrWorkspace.helpdesk.guides.fieldTitle")}</Label>
            <Input id="article-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={160} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="article-body">{t("hrWorkspace.helpdesk.guides.fieldBody")}</Label>
            <Textarea id="article-body" value={body} onChange={(event) => setBody(event.target.value)} rows={6} maxLength={8000} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="article-category">{t("hrWorkspace.helpdesk.guides.category")}</Label>
            <select id="article-category" className="hd-select" value={category} onChange={(event) => setCategory(event.target.value)}>
              {categories.map((item) => (
                <option key={item} value={item}>
                  {categoryLabel(item)}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="article-visibility">{t("hrWorkspace.helpdesk.guides.fieldVisibility")}</Label>
            <select
              id="article-visibility"
              className="hd-select"
              value={visibility}
              onChange={(event) => setVisibility(event.target.value as "all_employees" | "hr_only")}
            >
              <option value="all_employees">{t("hrWorkspace.helpdesk.guides.visAll")}</option>
              <option value="hr_only">{t("hrWorkspace.helpdesk.guides.visHr")}</option>
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={published} onChange={(event) => setPublished(event.target.checked)} />
            {t("hrWorkspace.helpdesk.guides.publish")}
          </label>
          <DialogFooter>
            <Button type="submit" className="hd-btn" disabled={create.isPending}>
              {t("hrWorkspace.helpdesk.guides.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type SettingsDraft = {
  name: string;
  description: string;
  categories: string[];
  firstResponseHours: number;
  resolutionHours: number;
  defaultAssigneeStaffId: string;
  assignmentNotes: string;
};

function toDraft(settings: HelpdeskSettings | undefined, t: (key: string) => string): SettingsDraft {
  return {
    name: settings?.name ?? t("hrWorkspace.helpdesk.title"),
    description: settings?.description ?? t("hrWorkspace.helpdesk.subtitle"),
    categories: settings?.categories?.length ? settings.categories : [...DEFAULT_HELPDESK_CATEGORIES],
    firstResponseHours: settings?.firstResponseHours ?? 24,
    resolutionHours: settings?.resolutionHours ?? 72,
    defaultAssigneeStaffId: settings?.defaultAssigneeStaffId ?? "",
    assignmentNotes: settings?.assignmentNotes ?? "",
  };
}

function ManagePanel() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const categoryLabel = useCategoryLabel();
  const { options } = useStaffOptions();
  const settings = useQuery({
    queryKey: queryKeys.people.hrHelpdeskSettings(),
    queryFn: () => getHelpdeskSettings({}),
    staleTime: STALE.people,
  });
  const rules = useQuery({
    queryKey: queryKeys.people.hrHelpdeskRules(),
    queryFn: () => listHelpdeskRules({}),
    staleTime: STALE.people,
  });
  const [draft, setDraft] = useState<SettingsDraft | null>(null);
  const [newCategory, setNewCategory] = useState("");
  const form = draft ?? toDraft(settings.data, t);

  const save = useMutation({
    mutationFn: saveHelpdeskSettings,
    onSuccess: () => {
      toast.success(t("hrWorkspace.helpdesk.manage.saved"));
      setDraft(null);
      void qc.invalidateQueries({ queryKey: queryKeys.people.hrHelpdeskSettings() });
    },
    onError: (error: Error) => notifyError(t, error),
  });

  const edit = (patch: Partial<SettingsDraft>) => setDraft({ ...form, ...patch });

  const onSave = (event: FormEvent) => {
    event.preventDefault();
    save.mutate({
      name: form.name.trim(),
      description: form.description.trim(),
      categories: form.categories,
      firstResponseHours: form.firstResponseHours,
      resolutionHours: form.resolutionHours,
      defaultAssigneeStaffId: form.defaultAssigneeStaffId || null,
      assignmentNotes: form.assignmentNotes.trim(),
    });
  };

  return (
    <div className="hd-stack">
      {settings.data && !settings.data.available ? (
        <p className="hd-note">{t("hrWorkspace.helpdesk.storageMissing")}</p>
      ) : null}
      <form className="hd-card hd-section" onSubmit={onSave}>
        <h2>{t("hrWorkspace.helpdesk.manage.nameTitle")}</h2>
        <div className="hd-fields">
          <div className="space-y-2">
            <Label htmlFor="hd-name">{t("hrWorkspace.helpdesk.manage.name")}</Label>
            <Input id="hd-name" value={form.name} onChange={(event) => edit({ name: event.target.value })} maxLength={80} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="hd-description">{t("hrWorkspace.helpdesk.manage.description")}</Label>
            <Textarea
              id="hd-description"
              value={form.description}
              onChange={(event) => edit({ description: event.target.value })}
              rows={3}
              maxLength={280}
            />
          </div>
        </div>

        <h2 className="mt-6">{t("hrWorkspace.helpdesk.manage.categoriesTitle")}</h2>
        <div className="hd-chips">
          {form.categories.map((item) => (
            <span key={item} className="hd-chip">
              {categoryLabel(item)}
              <button
                type="button"
                aria-label={t("hrWorkspace.helpdesk.manage.removeCategory", { name: categoryLabel(item) })}
                disabled={form.categories.length === 1}
                onClick={() => edit({ categories: form.categories.filter((category) => category !== item) })}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
        </div>
        <div className="hd-add">
          <Input
            value={newCategory}
            onChange={(event) => setNewCategory(event.target.value)}
            placeholder={t("hrWorkspace.helpdesk.manage.categoryPlaceholder")}
            aria-label={t("hrWorkspace.helpdesk.manage.categoryPlaceholder")}
            maxLength={80}
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              const value = newCategory.trim();
              if (!value || form.categories.includes(value)) return;
              edit({ categories: [...form.categories, value] });
              setNewCategory("");
            }}
          >
            {t("hrWorkspace.helpdesk.manage.addCategory")}
          </Button>
        </div>

        <h2 className="mt-6">{t("hrWorkspace.helpdesk.manage.slaTitle")}</h2>
        <p className="hd-hint">{t("hrWorkspace.helpdesk.manage.slaHint")}</p>
        <div className="hd-fields hd-fields--split">
          <div className="space-y-2">
            <Label htmlFor="hd-first">{t("hrWorkspace.helpdesk.manage.firstResponse")}</Label>
            <Input
              id="hd-first"
              type="number"
              min={1}
              max={720}
              value={form.firstResponseHours}
              onChange={(event) => edit({ firstResponseHours: Number(event.target.value) })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="hd-resolve">{t("hrWorkspace.helpdesk.manage.resolutionTarget")}</Label>
            <Input
              id="hd-resolve"
              type="number"
              min={1}
              max={720}
              value={form.resolutionHours}
              onChange={(event) => edit({ resolutionHours: Number(event.target.value) })}
            />
          </div>
        </div>

        <h2 className="mt-6">{t("hrWorkspace.helpdesk.manage.routingTitle")}</h2>
        <div className="hd-fields">
          <div className="space-y-2">
            <Label>{t("hrWorkspace.helpdesk.manage.defaultAssignee")}</Label>
            <SearchableSelect
              value={form.defaultAssigneeStaffId}
              onValueChange={(value) => edit({ defaultAssigneeStaffId: value })}
              aria-label={t("hrWorkspace.helpdesk.manage.defaultAssignee")}
              options={options}
              emptyOption={{ value: "", label: t("hrWorkspace.helpdesk.unassigned") }}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="hd-notes">{t("hrWorkspace.helpdesk.manage.assignmentNotes")}</Label>
            <Textarea
              id="hd-notes"
              value={form.assignmentNotes}
              onChange={(event) => edit({ assignmentNotes: event.target.value })}
              rows={3}
              maxLength={500}
            />
          </div>
        </div>
        <Button type="submit" className="hd-btn mt-5" disabled={save.isPending || settings.isLoading}>
          {t("hrWorkspace.helpdesk.manage.saveSettings")}
        </Button>
      </form>

      <RuleBlock
        kind="routing"
        title={t("hrWorkspace.helpdesk.manage.rulesTitle")}
        hint={t("hrWorkspace.helpdesk.manage.rulesHint")}
        empty={t("hrWorkspace.helpdesk.manage.emptyRules")}
        categories={form.categories}
        rules={(rules.data?.items ?? []).filter((rule) => rule.kind === "routing")}
        loading={rules.isLoading}
        unavailable={Boolean(rules.data && !rules.data.available)}
        names={options}
      />
      <RuleBlock
        kind="escalation"
        title={t("hrWorkspace.helpdesk.manage.escalationTitle")}
        hint={t("hrWorkspace.helpdesk.manage.escalationHint")}
        empty={t("hrWorkspace.helpdesk.manage.emptyEscalation")}
        categories={form.categories}
        rules={(rules.data?.items ?? []).filter((rule) => rule.kind === "escalation")}
        loading={rules.isLoading}
        unavailable={Boolean(rules.data && !rules.data.available)}
        names={options}
      />
    </div>
  );
}

function RuleBlock({
  kind,
  title,
  hint,
  empty,
  categories,
  rules,
  loading,
  unavailable,
  names,
}: {
  kind: "routing" | "escalation";
  title: string;
  hint: string;
  empty: string;
  categories: string[];
  rules: HelpdeskRule[];
  loading: boolean;
  unavailable: boolean;
  names: { value: string; label: string }[];
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const categoryLabel = useCategoryLabel();
  const nameById = useMemo(() => new Map(names.map((item) => [item.value, item.label])), [names]);
  const [category, setCategory] = useState(categories[0] ?? "other");
  const [condition, setCondition] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [active, setActive] = useState(true);

  const create = useMutation({
    mutationFn: createHelpdeskRule,
    onSuccess: () => {
      toast.success(t("hrWorkspace.helpdesk.manage.ruleSaved"));
      setCondition("");
      void qc.invalidateQueries({ queryKey: queryKeys.people.hrHelpdeskRules() });
    },
    onError: (error: Error) => notifyError(t, error),
  });
  const remove = useMutation({
    mutationFn: deleteHelpdeskRule,
    onSuccess: () => {
      toast.success(t("hrWorkspace.helpdesk.manage.ruleRemoved"));
      void qc.invalidateQueries({ queryKey: queryKeys.people.hrHelpdeskRules() });
    },
    onError: (error: Error) => notifyError(t, error),
  });

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (condition.trim().length < 2) {
      toast.error(t("hrWorkspace.helpdesk.manage.ruleRequired"));
      return;
    }
    create.mutate({
      kind,
      category: category || categories[0] || "other",
      condition: condition.trim(),
      assigneeStaffId: assigneeId || null,
      active,
    });
  };

  return (
    <section className="hd-card hd-section">
      <h2>{title}</h2>
      <p className="hd-hint">{hint}</p>
      {unavailable ? <p className="hd-note mb-3">{t("hrWorkspace.helpdesk.storageMissing")}</p> : null}
      {loading ? (
        <FecLoader density="page" label={t("common.loading")} />
      ) : rules.length === 0 ? (
        <p className="hd-empty">{empty}</p>
      ) : (
        <div className="hd-scroll">
          <table className="hd-table">
            <thead>
              <tr>
                <th>{t("hrWorkspace.helpdesk.manage.colCategory")}</th>
                <th>{t("hrWorkspace.helpdesk.manage.colCondition")}</th>
                <th>{t("hrWorkspace.helpdesk.manage.colAssignee")}</th>
                <th>{t("hrWorkspace.helpdesk.manage.colStatus")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => (
                <tr key={rule.id}>
                  <td>{categoryLabel(rule.category)}</td>
                  <td>{rule.condition}</td>
                  <td>
                    {rule.assigneeStaffId
                      ? nameById.get(rule.assigneeStaffId) ?? t("hrWorkspace.unknownStaff")
                      : t("hrWorkspace.helpdesk.unassigned")}
                  </td>
                  <td>{rule.active ? t("hrWorkspace.helpdesk.manage.active") : t("hrWorkspace.helpdesk.manage.inactive")}</td>
                  <td>
                    <Button type="button" variant="outline" size="sm" onClick={() => remove.mutate({ id: rule.id })}>
                      {t("hrWorkspace.helpdesk.manage.remove")}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <form className="hd-fields mt-4" onSubmit={onSubmit}>
        <div className="hd-fields hd-fields--split">
          <div className="space-y-2">
            <Label htmlFor={`${kind}-category`}>{t("hrWorkspace.helpdesk.manage.colCategory")}</Label>
            <select id={`${kind}-category`} className="hd-select" value={category} onChange={(event) => setCategory(event.target.value)}>
              {categories.map((item) => (
                <option key={item} value={item}>
                  {categoryLabel(item)}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label>{t("hrWorkspace.helpdesk.manage.colAssignee")}</Label>
            <SearchableSelect
              value={assigneeId}
              onValueChange={setAssigneeId}
              aria-label={t("hrWorkspace.helpdesk.manage.colAssignee")}
              options={names}
              emptyOption={{ value: "", label: t("hrWorkspace.helpdesk.unassigned") }}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${kind}-condition`}>{t("hrWorkspace.helpdesk.manage.condition")}</Label>
          <Input
            id={`${kind}-condition`}
            value={condition}
            onChange={(event) => setCondition(event.target.value)}
            placeholder={t("hrWorkspace.helpdesk.manage.conditionPlaceholder")}
            maxLength={240}
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} />
          {t("hrWorkspace.helpdesk.manage.active")}
        </label>
        <Button type="submit" className="hd-btn" disabled={create.isPending}>
          {t("hrWorkspace.helpdesk.manage.saveRule")}
        </Button>
      </form>
    </section>
  );
}
