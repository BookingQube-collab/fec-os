"use client";

import type { ReactNode } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { CellInput, CellSelect, siteLabel, venueOptions, type SiteOption } from "@/components/weekly-review/fields";
import {
  ACTION_STATUSES,
  AGGREGATOR_LOCATION_CODES,
  AGGREGATOR_PLATFORMS,
  CAMPAIGN_LOCATION_CODES,
  CORPORATE_PARTNERS,
  DECISION_OUTCOMES,
  DECISION_PRIORITIES,
  INCIDENT_LOCATION_CODES,
} from "@/lib/weekly-review/constants";
import type { ReviewPack } from "@/lib/weekly-review/model";

function newId() {
  return crypto.randomUUID();
}

export function EnterDataPanel({
  pack,
  sites,
  canEdit,
  onChange,
}: {
  pack: ReviewPack;
  sites: SiteOption[];
  canEdit: boolean;
  onChange: (next: ReviewPack) => void;
}) {
  const { t } = useTranslation();
  const r = pack.review;
  const campaignSites = sites.filter((s) => (CAMPAIGN_LOCATION_CODES as readonly string[]).includes(s.code));
  const allVenue = venueOptions(sites, INCIDENT_LOCATION_CODES);
  const aggVenue = venueOptions(sites, AGGREGATOR_LOCATION_CODES).filter((o) => o.value !== "_none");
  const locName = (id: string | null) => {
    const s = sites.find((x) => x.id === id);
    return s ? siteLabel(s) : "";
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-4">
        <label className="text-sm">
          <span className="mb-1 block text-muted-foreground">{t("weeklyReview.week")}</span>
          <Input
            value={r.week_label}
            disabled={!canEdit}
            onChange={(e) => onChange({ ...pack, review: { ...r, week_label: e.target.value } })}
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-muted-foreground">{t("weeklyReview.weekStart")}</span>
          <Input
            type="date"
            value={r.week_start}
            disabled={!canEdit}
            onChange={(e) => onChange({ ...pack, review: { ...r, week_start: e.target.value } })}
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-muted-foreground">{t("weeklyReview.weekEnd")}</span>
          <Input
            type="date"
            value={r.week_end}
            disabled={!canEdit}
            onChange={(e) => onChange({ ...pack, review: { ...r, week_end: e.target.value } })}
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-muted-foreground">{t("weeklyReview.meetingDate")}</span>
          <Input
            type="date"
            value={r.meeting_date}
            disabled={!canEdit}
            onChange={(e) => onChange({ ...pack, review: { ...r, meeting_date: e.target.value } })}
          />
        </label>
      </div>
      <label className="block text-sm">
        <span className="mb-1 block text-muted-foreground">{t("weeklyReview.notes")}</span>
        <Textarea
          value={r.notes ?? ""}
          disabled={!canEdit}
          placeholder={t("weeklyReview.notesPlaceholder")}
          onChange={(e) => onChange({ ...pack, review: { ...r, notes: e.target.value } })}
        />
      </label>

      <Tabs defaultValue="decisions">
        <TabsList className="print:hidden">
          <TabsTrigger value="decisions">{t("weeklyReview.tabs.decisions")}</TabsTrigger>
          <TabsTrigger value="aggregators">{t("weeklyReview.tabs.aggregators")}</TabsTrigger>
          <TabsTrigger value="corporate">{t("weeklyReview.tabs.corporate")}</TabsTrigger>
          <TabsTrigger value="reviews">{t("weeklyReview.tabs.reviews")}</TabsTrigger>
          <TabsTrigger value="loyalty">{t("weeklyReview.tabs.loyalty")}</TabsTrigger>
          <TabsTrigger value="actions">{t("weeklyReview.tabs.actions")}</TabsTrigger>
          <TabsTrigger value="incidents">{t("weeklyReview.tabs.incidents")}</TabsTrigger>
        </TabsList>

        <TabsContent value="decisions">
          <RowTable
            canEdit={canEdit}
            onAdd={() =>
              onChange({
                ...pack,
                decisions: [
                  ...pack.decisions,
                  {
                    id: newId(),
                    review_id: r.id,
                    location_id: null,
                    venue_text: "",
                    matter: "",
                    decision_required: "",
                    priority: "other",
                    outcome: "pending",
                    note: null,
                    sort_order: pack.decisions.length,
                  },
                ],
              })
            }
            headers={[
              t("weeklyReview.fields.venue"),
              t("weeklyReview.fields.matter"),
              t("weeklyReview.fields.decision"),
              t("weeklyReview.fields.priority"),
              t("weeklyReview.fields.outcome"),
              t("weeklyReview.fields.note"),
            ]}
          >
            {pack.decisions.map((row) => (
              <TableRow key={row.id}>
                <TableCell>
                  <CellSelect
                    aria-label={t("weeklyReview.fields.venue")}
                    value={row.location_id ?? "_none"}
                    disabled={!canEdit}
                    options={allVenue}
                    onValueChange={(v) => {
                      const location_id = v === "_none" ? null : v;
                      patch(pack, onChange, "decisions", row.id, {
                        location_id,
                        venue_text: location_id ? locName(location_id) : row.venue_text,
                      });
                    }}
                  />
                </TableCell>
                <TableCell>
                  <CellInput
                    aria-label={t("weeklyReview.fields.matter")}
                    value={row.matter}
                    disabled={!canEdit}
                    onChange={(e) => patch(pack, onChange, "decisions", row.id, { matter: e.target.value })}
                  />
                </TableCell>
                <TableCell>
                  <CellInput
                    aria-label={t("weeklyReview.fields.decision")}
                    value={row.decision_required}
                    disabled={!canEdit}
                    onChange={(e) =>
                      patch(pack, onChange, "decisions", row.id, { decision_required: e.target.value })
                    }
                  />
                </TableCell>
                <TableCell>
                  <CellSelect
                    aria-label={t("weeklyReview.fields.priority")}
                    value={row.priority}
                    disabled={!canEdit}
                    options={DECISION_PRIORITIES.map((p) => ({
                      value: p,
                      label: t(`weeklyReview.priority.${p}`),
                    }))}
                    onValueChange={(v) =>
                      patch(pack, onChange, "decisions", row.id, { priority: v as typeof row.priority })
                    }
                  />
                </TableCell>
                <TableCell>
                  <CellSelect
                    aria-label={t("weeklyReview.fields.outcome")}
                    value={row.outcome}
                    disabled={!canEdit}
                    options={DECISION_OUTCOMES.map((p) => ({
                      value: p,
                      label: t(`weeklyReview.outcome.${p}`),
                    }))}
                    onValueChange={(v) =>
                      patch(pack, onChange, "decisions", row.id, { outcome: v as typeof row.outcome })
                    }
                  />
                </TableCell>
                <TableCell>
                  <CellInput
                    aria-label={t("weeklyReview.fields.note")}
                    value={row.note ?? ""}
                    disabled={!canEdit}
                    onChange={(e) => patch(pack, onChange, "decisions", row.id, { note: e.target.value })}
                  />
                </TableCell>
                {canEdit ? (
                  <TableCell>
                    <RemoveBtn
                      label={t("weeklyReview.removeRow")}
                      onClick={() =>
                        onChange({ ...pack, decisions: pack.decisions.filter((d) => d.id !== row.id) })
                      }
                    />
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </RowTable>
        </TabsContent>

        <TabsContent value="aggregators">
          <RowTable
            canEdit={canEdit}
            onAdd={() =>
              onChange({
                ...pack,
                aggregators: [
                  ...pack.aggregators,
                  {
                    id: newId(),
                    review_id: r.id,
                    location_id: aggVenue[0]?.value ?? "",
                    platform: "Entertainer",
                    redemptions: 0,
                    saving_qar: 0,
                  },
                ],
              })
            }
            headers={[
              t("weeklyReview.fields.venue"),
              t("weeklyReview.fields.platform"),
              t("weeklyReview.fields.redemptions"),
              t("weeklyReview.fields.saving"),
            ]}
          >
            {pack.aggregators.map((row) => (
              <TableRow key={row.id}>
                <TableCell>
                  <CellSelect
                    aria-label={t("weeklyReview.fields.venue")}
                    value={row.location_id}
                    disabled={!canEdit}
                    options={aggVenue}
                    onValueChange={(v) => patch(pack, onChange, "aggregators", row.id, { location_id: v })}
                  />
                </TableCell>
                <TableCell>
                  <CellSelect
                    aria-label={t("weeklyReview.fields.platform")}
                    value={row.platform}
                    disabled={!canEdit}
                    options={AGGREGATOR_PLATFORMS.map((p) => ({ value: p, label: p }))}
                    onValueChange={(v) =>
                      patch(pack, onChange, "aggregators", row.id, { platform: v as typeof row.platform })
                    }
                  />
                </TableCell>
                <TableCell>
                  <CellInput
                    type="number"
                    min={0}
                    aria-label={t("weeklyReview.fields.redemptions")}
                    value={row.redemptions}
                    disabled={!canEdit}
                    onChange={(e) =>
                      patch(pack, onChange, "aggregators", row.id, { redemptions: Number(e.target.value) || 0 })
                    }
                  />
                </TableCell>
                <TableCell>
                  <CellInput
                    type="number"
                    min={0}
                    step="0.01"
                    aria-label={t("weeklyReview.fields.saving")}
                    value={row.saving_qar}
                    disabled={!canEdit}
                    onChange={(e) =>
                      patch(pack, onChange, "aggregators", row.id, { saving_qar: Number(e.target.value) || 0 })
                    }
                  />
                </TableCell>
                {canEdit ? (
                  <TableCell>
                    <RemoveBtn
                      label={t("weeklyReview.removeRow")}
                      onClick={() =>
                        onChange({ ...pack, aggregators: pack.aggregators.filter((d) => d.id !== row.id) })
                      }
                    />
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </RowTable>
        </TabsContent>

        <TabsContent value="corporate">
          <datalist id="weekly-review-companies">
            {CORPORATE_PARTNERS.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          <RowTable
            canEdit={canEdit}
            onAdd={() =>
              onChange({
                ...pack,
                corporate: [
                  ...pack.corporate,
                  {
                    id: newId(),
                    review_id: r.id,
                    location_id: null,
                    company: "",
                    deals: 0,
                    revenue_qar: 0,
                  },
                ],
              })
            }
            headers={[
              t("weeklyReview.fields.venue"),
              t("weeklyReview.fields.company"),
              t("weeklyReview.fields.deals"),
              t("weeklyReview.fields.revenue"),
            ]}
          >
            {pack.corporate.map((row) => (
              <TableRow key={row.id}>
                <TableCell>
                  <CellSelect
                    aria-label={t("weeklyReview.fields.venue")}
                    value={row.location_id ?? "_none"}
                    disabled={!canEdit}
                    options={allVenue}
                    onValueChange={(v) =>
                      patch(pack, onChange, "corporate", row.id, { location_id: v === "_none" ? null : v })
                    }
                  />
                </TableCell>
                <TableCell>
                  <CellInput
                    list="weekly-review-companies"
                    aria-label={t("weeklyReview.fields.company")}
                    value={row.company}
                    disabled={!canEdit}
                    onChange={(e) => patch(pack, onChange, "corporate", row.id, { company: e.target.value })}
                  />
                </TableCell>
                <TableCell>
                  <CellInput
                    type="number"
                    min={0}
                    aria-label={t("weeklyReview.fields.deals")}
                    value={row.deals}
                    disabled={!canEdit}
                    onChange={(e) =>
                      patch(pack, onChange, "corporate", row.id, { deals: Number(e.target.value) || 0 })
                    }
                  />
                </TableCell>
                <TableCell>
                  <CellInput
                    type="number"
                    min={0}
                    step="0.01"
                    aria-label={t("weeklyReview.fields.revenue")}
                    value={row.revenue_qar}
                    disabled={!canEdit}
                    onChange={(e) =>
                      patch(pack, onChange, "corporate", row.id, { revenue_qar: Number(e.target.value) || 0 })
                    }
                  />
                </TableCell>
                {canEdit ? (
                  <TableCell>
                    <RemoveBtn
                      label={t("weeklyReview.removeRow")}
                      onClick={() =>
                        onChange({ ...pack, corporate: pack.corporate.filter((d) => d.id !== row.id) })
                      }
                    />
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </RowTable>
        </TabsContent>

        <TabsContent value="reviews">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("weeklyReview.fields.venue")}</TableHead>
                <TableHead>{t("weeklyReview.fields.rating")}</TableHead>
                <TableHead>{t("weeklyReview.fields.totalReviews")}</TableHead>
                <TableHead>{t("weeklyReview.fields.campaign")}</TableHead>
                <TableHead>{t("weeklyReview.fields.organic")}</TableHead>
                <TableHead>{t("weeklyReview.fields.followers")}</TableHead>
                <TableHead>{t("weeklyReview.fields.rewards15")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {campaignSites.map((site) => {
                const row = pack.social.find((s) => s.location_id === site.id);
                if (!row) return null;
                return (
                  <TableRow key={row.id}>
                    <TableCell>{siteLabel(site)}</TableCell>
                    <TableCell>
                      <CellInput
                        type="number"
                        min={0}
                        max={5}
                        step="0.1"
                        aria-label={t("weeklyReview.fields.rating")}
                        value={row.google_rating ?? ""}
                        disabled={!canEdit}
                        onChange={(e) =>
                          patch(pack, onChange, "social", row.id, {
                            google_rating: e.target.value === "" ? null : Number(e.target.value),
                          })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <CellInput
                        type="number"
                        min={0}
                        value={row.total_reviews}
                        disabled={!canEdit}
                        onChange={(e) =>
                          patch(pack, onChange, "social", row.id, { total_reviews: Number(e.target.value) || 0 })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <CellInput
                        type="number"
                        min={0}
                        value={row.new_reviews_campaign}
                        disabled={!canEdit}
                        onChange={(e) =>
                          patch(pack, onChange, "social", row.id, {
                            new_reviews_campaign: Number(e.target.value) || 0,
                          })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <CellInput
                        type="number"
                        min={0}
                        value={row.new_reviews_organic}
                        disabled={!canEdit}
                        onChange={(e) =>
                          patch(pack, onChange, "social", row.id, {
                            new_reviews_organic: Number(e.target.value) || 0,
                          })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <CellInput
                        type="number"
                        min={0}
                        value={row.ig_followers}
                        disabled={!canEdit}
                        onChange={(e) =>
                          patch(pack, onChange, "social", row.id, { ig_followers: Number(e.target.value) || 0 })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <CellInput
                        type="number"
                        min={0}
                        value={row.rewards_15min}
                        disabled={!canEdit}
                        onChange={(e) =>
                          patch(pack, onChange, "social", row.id, { rewards_15min: Number(e.target.value) || 0 })
                        }
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TabsContent>

        <TabsContent value="loyalty">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("weeklyReview.fields.venue")}</TableHead>
                <TableHead>{t("weeklyReview.fields.newMembers")}</TableHead>
                <TableHead>{t("weeklyReview.fields.activeMembers")}</TableHead>
                <TableHead>{t("weeklyReview.fields.rewardsRedeemed")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {campaignSites.map((site) => {
                const row = pack.loyalty.find((s) => s.location_id === site.id);
                if (!row) return null;
                return (
                  <TableRow key={row.id}>
                    <TableCell>{siteLabel(site)}</TableCell>
                    <TableCell>
                      <CellInput
                        type="number"
                        min={0}
                        value={row.new_members}
                        disabled={!canEdit}
                        onChange={(e) =>
                          patch(pack, onChange, "loyalty", row.id, { new_members: Number(e.target.value) || 0 })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <CellInput
                        type="number"
                        min={0}
                        value={row.active_members}
                        disabled={!canEdit}
                        onChange={(e) =>
                          patch(pack, onChange, "loyalty", row.id, { active_members: Number(e.target.value) || 0 })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <CellInput
                        type="number"
                        min={0}
                        value={row.rewards_redeemed}
                        disabled={!canEdit}
                        onChange={(e) =>
                          patch(pack, onChange, "loyalty", row.id, {
                            rewards_redeemed: Number(e.target.value) || 0,
                          })
                        }
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TabsContent>

        <TabsContent value="actions">
          <RowTable
            canEdit={canEdit}
            onAdd={() =>
              onChange({
                ...pack,
                actions: [
                  ...pack.actions,
                  {
                    id: newId(),
                    review_id: r.id,
                    venue_text: "",
                    action: "",
                    owner: "",
                    due: "",
                    status: "open",
                    update_note: null,
                    carried_from: null,
                    sort_order: pack.actions.length,
                  },
                ],
              })
            }
            headers={[
              t("weeklyReview.fields.venue"),
              t("weeklyReview.fields.action"),
              t("weeklyReview.fields.owner"),
              t("weeklyReview.fields.due"),
              t("weeklyReview.fields.status"),
              t("weeklyReview.fields.update"),
            ]}
          >
            {pack.actions.map((row) => (
              <TableRow key={row.id}>
                <TableCell>
                  <CellInput
                    aria-label={t("weeklyReview.fields.venue")}
                    value={row.venue_text ?? ""}
                    disabled={!canEdit}
                    onChange={(e) => patch(pack, onChange, "actions", row.id, { venue_text: e.target.value })}
                  />
                </TableCell>
                <TableCell>
                  <CellInput
                    aria-label={t("weeklyReview.fields.action")}
                    value={row.action}
                    disabled={!canEdit}
                    onChange={(e) => patch(pack, onChange, "actions", row.id, { action: e.target.value })}
                  />
                </TableCell>
                <TableCell>
                  <CellInput
                    aria-label={t("weeklyReview.fields.owner")}
                    value={row.owner ?? ""}
                    disabled={!canEdit}
                    onChange={(e) => patch(pack, onChange, "actions", row.id, { owner: e.target.value })}
                  />
                </TableCell>
                <TableCell>
                  <CellInput
                    aria-label={t("weeklyReview.fields.due")}
                    value={row.due ?? ""}
                    disabled={!canEdit}
                    onChange={(e) => patch(pack, onChange, "actions", row.id, { due: e.target.value })}
                  />
                </TableCell>
                <TableCell>
                  <CellSelect
                    aria-label={t("weeklyReview.fields.status")}
                    value={row.status}
                    disabled={!canEdit}
                    options={ACTION_STATUSES.map((s) => ({
                      value: s,
                      label: t(`weeklyReview.actionStatus.${s}`),
                    }))}
                    onValueChange={(v) =>
                      patch(pack, onChange, "actions", row.id, { status: v as typeof row.status })
                    }
                  />
                </TableCell>
                <TableCell>
                  <CellInput
                    aria-label={t("weeklyReview.fields.update")}
                    value={row.update_note ?? ""}
                    disabled={!canEdit}
                    onChange={(e) => patch(pack, onChange, "actions", row.id, { update_note: e.target.value })}
                  />
                </TableCell>
                {canEdit ? (
                  <TableCell>
                    <RemoveBtn
                      label={t("weeklyReview.removeRow")}
                      onClick={() =>
                        onChange({ ...pack, actions: pack.actions.filter((d) => d.id !== row.id) })
                      }
                    />
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </RowTable>
        </TabsContent>

        <TabsContent value="incidents">
          <RowTable
            canEdit={canEdit}
            onAdd={() =>
              onChange({
                ...pack,
                incidents: [
                  ...pack.incidents,
                  {
                    id: newId(),
                    review_id: r.id,
                    location_id: allVenue.find((o) => o.value !== "_none")?.value ?? null,
                    description: "",
                    action_taken: "",
                    closed: false,
                  },
                ],
              })
            }
            headers={[
              t("weeklyReview.fields.venue"),
              t("weeklyReview.fields.description"),
              t("weeklyReview.fields.actionTaken"),
              t("weeklyReview.fields.closed"),
            ]}
          >
            {pack.incidents.map((row) => (
              <TableRow key={row.id}>
                <TableCell>
                  <CellSelect
                    aria-label={t("weeklyReview.fields.venue")}
                    value={row.location_id ?? "_none"}
                    disabled={!canEdit}
                    options={allVenue}
                    onValueChange={(v) =>
                      patch(pack, onChange, "incidents", row.id, { location_id: v === "_none" ? null : v })
                    }
                  />
                </TableCell>
                <TableCell>
                  <CellInput
                    aria-label={t("weeklyReview.fields.description")}
                    value={row.description}
                    disabled={!canEdit}
                    onChange={(e) => patch(pack, onChange, "incidents", row.id, { description: e.target.value })}
                  />
                </TableCell>
                <TableCell>
                  <CellInput
                    aria-label={t("weeklyReview.fields.actionTaken")}
                    value={row.action_taken ?? ""}
                    disabled={!canEdit}
                    onChange={(e) =>
                      patch(pack, onChange, "incidents", row.id, { action_taken: e.target.value })
                    }
                  />
                </TableCell>
                <TableCell>
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    aria-label={t("weeklyReview.fields.closed")}
                    checked={row.closed}
                    disabled={!canEdit}
                    onChange={(e) => patch(pack, onChange, "incidents", row.id, { closed: e.target.checked })}
                  />
                </TableCell>
                {canEdit ? (
                  <TableCell>
                    <RemoveBtn
                      label={t("weeklyReview.removeRow")}
                      onClick={() =>
                        onChange({ ...pack, incidents: pack.incidents.filter((d) => d.id !== row.id) })
                      }
                    />
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </RowTable>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function patch<K extends keyof ReviewPack>(
  pack: ReviewPack,
  onChange: (next: ReviewPack) => void,
  key: K,
  id: string,
  over: Partial<ReviewPack[K] extends Array<infer R> ? R : never>,
) {
  const list = pack[key];
  if (!Array.isArray(list)) return;
  onChange({
    ...pack,
    [key]: list.map((row) => (row.id === id ? { ...row, ...over } : row)),
  });
}

function RowTable({
  headers,
  children,
  canEdit,
  onAdd,
}: {
  headers: string[];
  children: ReactNode;
  canEdit: boolean;
  onAdd: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-2">
      {canEdit ? (
        <Button type="button" size="sm" variant="outline" onClick={onAdd}>
          <Plus className="h-4 w-4" />
          {t("weeklyReview.addRow")}
        </Button>
      ) : null}
      <Table>
        <TableHeader>
          <TableRow>
            {headers.map((h) => (
              <TableHead key={h}>{h}</TableHead>
            ))}
            {canEdit ? <TableHead className="w-12" /> : null}
          </TableRow>
        </TableHeader>
        <TableBody>{children}</TableBody>
      </Table>
    </div>
  );
}

function RemoveBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button type="button" size="icon" variant="ghost" aria-label={label} onClick={onClick}>
      <Trash2 className="h-4 w-4" />
    </Button>
  );
}
