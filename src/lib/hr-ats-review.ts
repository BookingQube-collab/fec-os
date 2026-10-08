/**
 * ATS desk filters. Scores come from scoreCandidateMatch (stored match_score).
 * Role-gap notes come from buildRecruitmentMatch. Neither path rejects anyone.
 */

export const ATS_SCORE_BANDS = ["strong", "consider", "gap"] as const;
export type AtsScoreBand = (typeof ATS_SCORE_BANDS)[number];

export const ATS_POOLS = ["reviewed", "all"] as const;
export type AtsPool = (typeof ATS_POOLS)[number];

/** Interview stages already stored on hr_applications. No separate interview table. */
export const ATS_INTERVIEW_STAGES = [
  "hr_interview",
  "technical_interview",
  "final_interview",
] as const;

export const ATS_OFFER_STAGES = [
  "selected",
  "offer_pending",
  "offer_issued",
  "offer_accepted",
  "offer_declined",
  "documentation_pending",
  "ready_to_join",
] as const;

const NEXT_STAGE: Record<string, string> = {
  new: "cv_screened",
  cv_screened: "shortlisted",
  shortlisted: "hr_interview",
  hr_interview: "technical_interview",
  technical_interview: "final_interview",
  final_interview: "selected",
  selected: "offer_pending",
  offer_pending: "offer_issued",
  offer_accepted: "documentation_pending",
  documentation_pending: "ready_to_join",
  ready_to_join: "joined",
};

export type RecruitmentFilterRow = {
  matchScore: number | null;
  vacancyId: string;
  stage: string;
  departmentId: string | null;
  vacancyStatus: string | null;
  jobTitle: string | null;
  candidateName: string;
  skills: string | null;
  offerStatus: string | null;
};

export type RecruitmentFilterInput = {
  pool: AtsPool;
  vacancyId: string;
  stage: string;
  departmentId: string;
  vacancyStatus: string;
  band: string;
  query: string;
};

export function isAtsReviewed(matchScore: number | null | undefined): matchScore is number {
  return typeof matchScore === "number" && Number.isFinite(matchScore);
}

/** Bands on the stored 0–100 match score. Unscored rows have no band. */
export function atsScoreBand(matchScore: number | null | undefined): AtsScoreBand | null {
  if (!isAtsReviewed(matchScore)) return null;
  if (matchScore >= 70) return "strong";
  if (matchScore >= 40) return "consider";
  return "gap";
}

export function matchSummary(explanation: unknown): string {
  if (!explanation || typeof explanation !== "object") return "";
  const summary = (explanation as { summary?: unknown }).summary;
  return typeof summary === "string" ? summary.trim() : "";
}

export function nextApplicationStage(stage: string): string | null {
  return NEXT_STAGE[stage] ?? null;
}

export function isInterviewStage(stage: string): boolean {
  return (ATS_INTERVIEW_STAGES as readonly string[]).includes(stage);
}

export function isOfferStage(stage: string, offerStatus: string | null | undefined): boolean {
  if ((ATS_OFFER_STAGES as readonly string[]).includes(stage)) return true;
  return Boolean(offerStatus);
}

export function filterRecruitmentRows<T extends RecruitmentFilterRow>(
  rows: T[],
  filters: RecruitmentFilterInput,
): T[] {
  const query = filters.query.trim().toLowerCase();
  const filtered = rows.filter((row) => {
    if (filters.pool === "reviewed" && !isAtsReviewed(row.matchScore)) return false;
    if (filters.vacancyId && row.vacancyId !== filters.vacancyId) return false;
    if (filters.stage && row.stage !== filters.stage) return false;
    if (filters.departmentId && row.departmentId !== filters.departmentId) return false;
    if (filters.vacancyStatus && row.vacancyStatus !== filters.vacancyStatus) return false;
    if (filters.band && atsScoreBand(row.matchScore) !== filters.band) return false;
    if (query) {
      const hay = `${row.candidateName} ${row.skills ?? ""} ${row.jobTitle ?? ""}`.toLowerCase();
      if (!hay.includes(query)) return false;
    }
    return true;
  });
  if (filters.pool !== "reviewed") return filtered;
  return [...filtered].sort((a, b) => (b.matchScore ?? -1) - (a.matchScore ?? -1));
}

/** Group role-gap notes from buildRecruitmentMatch item ids (`role:<kind>:<candidateId>`). */
export function recruitmentNoteKeysByCandidate(
  items: Array<{ id: string; titleKey: string }>,
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const item of items) {
    const parts = item.id.split(":");
    const candidateId = parts.length >= 3 ? parts.slice(2).join(":") : "";
    if (!candidateId) continue;
    const list = map.get(candidateId) ?? [];
    list.push(item.titleKey);
    map.set(candidateId, list);
  }
  return map;
}
