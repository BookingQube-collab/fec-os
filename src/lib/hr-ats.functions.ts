"use server";

import { z } from "zod";

import {
  assertStageChangeAllowed,
  findDuplicateCandidates,
  HR_APPLICATION_STAGES,
  HR_CANDIDATE_SOURCES,
  HR_OFFER_STATUSES,
  maskCandidateSalary,
  maskOfferSalary,
  mergeMatchWeights,
  parseCvText,
  redactCandidatePii,
  scoreCandidateMatch,
  type HrApplicationStage,
  type MatchWeights,
} from "@/lib/hr-ats";
import { canUserDo } from "@/lib/rbac";
import {
  createAuthenticatedAction,
  type AuthContext,
} from "@/lib/server/create-action";
import { ForbiddenError } from "@/lib/server/authorize";
import { validateBase64Size, validateUploadMimeList } from "@/lib/server/upload-validation";

const CV_BUCKET = "hr-candidate-cvs";
const CV_MIMES = [
  "application/pdf",
  "text/plain",
  "image/jpeg",
  "image/png",
  "image/webp",
];

function tableMissing(message: string | undefined): boolean {
  return Boolean(message && /does not exist|schema cache|relation/i.test(message));
}

const uuidOpt = z.string().uuid().nullable().optional();

function canManageAts(roles: AuthContext["roles"]): boolean {
  return canUserDo(roles ?? [], "recruitment.manage");
}

function canTrackAts(roles: AuthContext["roles"]): boolean {
  return (
    canManageAts(roles) ||
    canUserDo(roles ?? [], "recruitment.request")
  );
}

function canViewSalary(roles: AuthContext["roles"]): boolean {
  return canUserDo(roles ?? [], "recruitment.view_salary_budget");
}

function assertManage(context: AuthContext) {
  if (!canManageAts(context.roles)) {
    throw new ForbiddenError("ATS write requires recruitment.manage.");
  }
}

function assertTrack(context: AuthContext) {
  if (!canTrackAts(context.roles)) {
    throw new ForbiddenError("ATS requires recruitment.request or recruitment.manage.");
  }
}

async function uploadCvBytes(
  context: AuthContext,
  candidateKey: string,
  filename: string,
  dataBase64: string,
  contentType: string,
) {
  validateUploadMimeList(contentType, CV_MIMES);
  validateBase64Size(dataBase64, 10 * 1024 * 1024);
  const path = `${candidateKey}/${Date.now()}-${filename.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const bytes = Uint8Array.from(atob(dataBase64), (c) => c.charCodeAt(0));
  const { error } = await context.supabase.storage
    .from(CV_BUCKET)
    .upload(path, bytes, { contentType, upsert: false });
  if (error) throw error;
  return path;
}

function decodeTextBase64(dataBase64: string, contentType: string): string | null {
  if (!/^text\//i.test(contentType) && contentType !== "application/pdf") return null;
  if (!/^text\//i.test(contentType)) return null;
  try {
    return atob(dataBase64);
  } catch {
    return null;
  }
}

type VacancyMatchRow = {
  id: string;
  job_title: string;
  match_weights: Record<string, number> | null;
  required_location: string | null;
  requires_qid: boolean | null;
  requires_visa: boolean | null;
  job_request_id: string | null;
  location_id: string | null;
  department_id: string | null;
};

async function loadVacancyMatchContext(context: AuthContext, vacancyId: string) {
  // Flat select — nested locations() blows TS ("instantiation excessively deep") on this schema.
  const { data: vac, error } = await context.supabase
    .from("hr_vacancies")
    .select(
      "id, job_title, match_weights, required_location, requires_qid, requires_visa, job_request_id, location_id, department_id",
    )
    .eq("id", vacancyId)
    .maybeSingle();
  if (error) throw error;
  if (!vac) throw new Error("Vacancy not found.");

  let skills: string | null = null;
  let experienceYears: number | null = null;
  let education: string | null = null;
  let jobDescription: string | null = null;
  if (vac.job_request_id) {
    const { data: jr } = await context.supabase
      .from("hr_job_requests")
      .select("skills, experience_years, education, job_description")
      .eq("id", vac.job_request_id)
      .maybeSingle();
    skills = (jr?.skills as string | null) ?? null;
    experienceYears = jr?.experience_years != null ? Number(jr.experience_years) : null;
    education = (jr?.education as string | null) ?? null;
    jobDescription = (jr?.job_description as string | null) ?? null;
  }

  let locName: string | null = null;
  if (!vac.required_location && vac.location_id) {
    const { data: loc } = await context.supabase
      .from("locations")
      .select("name")
      .eq("id", vac.location_id)
      .maybeSingle();
    locName = (loc?.name as string | null) ?? null;
  }
  const requiredLocation = (vac.required_location as string | null) ?? locName;

  return {
    vacancy: vac as VacancyMatchRow,
    skills,
    experienceYears,
    education,
    jobDescription,
    requiredLocation,
    weights: mergeMatchWeights(
      (vac.match_weights as Partial<MatchWeights> | null) ?? null,
    ),
  };
}

function mapCandidate(
  row: Record<string, unknown>,
  opts: { manage: boolean; viewSalary: boolean },
) {
  let mapped = {
    id: String(row.id),
    fullName: String(row.full_name),
    email: (row.email as string | null) ?? null,
    phone: (row.phone as string | null) ?? null,
    nationality: (row.nationality as string | null) ?? null,
    location: (row.location as string | null) ?? null,
    cvPath: (row.cv_path as string | null) ?? null,
    cvFileName: (row.cv_file_name as string | null) ?? null,
    cvText: opts.manage ? ((row.cv_text as string | null) ?? null) : null,
    qid: (row.qid as string | null) ?? null,
    visaStatus: (row.visa_status as string | null) ?? null,
    noticePeriodDays: row.notice_period_days != null ? Number(row.notice_period_days) : null,
    expectedSalaryQar: row.expected_salary_qar != null ? Number(row.expected_salary_qar) : null,
    experienceYears: row.experience_years != null ? Number(row.experience_years) : null,
    education: (row.education as string | null) ?? null,
    skills: (row.skills as string | null) ?? null,
    consentAt: (row.consent_at as string | null) ?? null,
    duplicateOf: (row.duplicate_of as string | null) ?? null,
    source: String(row.source ?? "manual"),
    notes: (row.notes as string | null) ?? null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
  mapped = maskCandidateSalary(mapped, opts.viewSalary);
  if (!opts.manage) mapped = redactCandidatePii(mapped);
  return mapped;
}

export const searchCandidates = createAuthenticatedAction(
  z.object({
    q: z.string().max(200).optional().nullable(),
    location: z.string().max(120).optional().nullable(),
    nationality: z.string().max(120).optional().nullable(),
    hasQid: z.boolean().optional().nullable(),
    limit: z.number().int().min(1).max(200).default(50),
  }),
  async (data, context) => {
    assertTrack(context);
    const manage = canManageAts(context.roles);
    const viewSalary = canViewSalary(context.roles);

    let q = context.supabase
      .from("hr_candidates")
      .select(
        "id, full_name, email, phone, nationality, location, cv_path, cv_file_name, cv_text, qid, visa_status, notice_period_days, expected_salary_qar, experience_years, education, skills, consent_at, duplicate_of, source, notes, created_at, updated_at",
      )
      .order("created_at", { ascending: false })
      .limit(data.limit);

    if (data.q?.trim()) {
      const term = `%${data.q.trim()}%`;
      q = q.or(
        `full_name.ilike.${term},email.ilike.${term},phone.ilike.${term},qid.ilike.${term},skills.ilike.${term}`,
      );
    }
    if (data.location?.trim()) q = q.ilike("location", `%${data.location.trim()}%`);
    if (data.nationality?.trim()) q = q.ilike("nationality", `%${data.nationality.trim()}%`);
    if (data.hasQid === true) q = q.not("qid", "is", null);
    if (data.hasQid === false) q = q.is("qid", null);

    const { data: rows, error } = await q;
    if (error) {
      if (tableMissing(error.message)) return [];
      throw error;
    }
    return (rows ?? []).map((r) => mapCandidate(r as Record<string, unknown>, { manage, viewSalary }));
  },
  { auth: { anyCapability: ["recruitment.manage", "recruitment.request"] } },
);

export const getCandidateDetail = createAuthenticatedAction(
  z.object({ candidateId: z.string().uuid() }),
  async (data, context) => {
    assertTrack(context);
    const manage = canManageAts(context.roles);
    const viewSalary = canViewSalary(context.roles);

    const { data: row, error } = await context.supabase
      .from("hr_candidates")
      .select("*")
      .eq("id", data.candidateId)
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new Error("Candidate not found.");

    const { data: apps, error: appErr } = await context.supabase
      .from("hr_applications")
      .select(
        "id, vacancy_id, stage, match_score, match_explanation, ai_score, rejection_reason, hold_reason, applied_at, stage_changed_at, hr_vacancies(job_title, status)",
      )
      .eq("candidate_id", data.candidateId)
      .order("applied_at", { ascending: false });
    if (appErr && !tableMissing(appErr.message)) throw appErr;

    const applicationIds = (apps ?? []).map((a) => String(a.id));
    let history: Array<Record<string, unknown>> = [];
    let offers: Array<{
      id: string;
      applicationId: string;
      salaryQar: number | null;
      currency: string;
      joiningDate: string | null;
      status: string;
      issuedAt: string | null;
      respondedAt: string | null;
      declineReason: string | null;
      notes: string | null;
      createdAt: string;
    }> = [];
    if (applicationIds.length) {
      const { data: hist } = await context.supabase
        .from("hr_application_stage_history")
        .select("id, application_id, from_stage, to_stage, note, communication_channel, acted_by, acted_at")
        .in("application_id", applicationIds)
        .order("acted_at", { ascending: false })
        .limit(200);
      history = (hist ?? []) as Array<Record<string, unknown>>;

      if (manage) {
        const { data: offerRows } = await context.supabase
          .from("hr_offers")
          .select("id, application_id, salary_qar, currency, joining_date, status, issued_at, responded_at, decline_reason, notes, created_at")
          .in("application_id", applicationIds)
          .order("created_at", { ascending: false });
        offers = (offerRows ?? []).map((o) =>
          maskOfferSalary(
            {
              id: String(o.id),
              applicationId: String(o.application_id),
              salaryQar: o.salary_qar != null ? Number(o.salary_qar) : null,
              currency: String(o.currency ?? "QAR"),
              joiningDate: o.joining_date ? String(o.joining_date).slice(0, 10) : null,
              status: String(o.status),
              issuedAt: (o.issued_at as string | null) ?? null,
              respondedAt: (o.responded_at as string | null) ?? null,
              declineReason: (o.decline_reason as string | null) ?? null,
              notes: (o.notes as string | null) ?? null,
              createdAt: String(o.created_at),
            },
            viewSalary,
          ),
        );
      }
    }

    return {
      candidate: mapCandidate(row as Record<string, unknown>, { manage, viewSalary }),
      applications: (apps ?? []).map((a) => {
        const vac = a.hr_vacancies as { job_title?: string; status?: string } | null;
        return {
          id: String(a.id),
          vacancyId: String(a.vacancy_id),
          jobTitle: vac?.job_title ?? null,
          vacancyStatus: vac?.status ?? null,
          stage: String(a.stage),
          matchScore: a.match_score != null ? Number(a.match_score) : null,
          matchExplanation: (a.match_explanation as Record<string, unknown>) ?? {},
          aiScore: manage && a.ai_score != null ? Number(a.ai_score) : null,
          rejectionReason: (a.rejection_reason as string | null) ?? null,
          holdReason: (a.hold_reason as string | null) ?? null,
          appliedAt: String(a.applied_at),
          stageChangedAt: String(a.stage_changed_at),
        };
      }),
      history: history.map((h) => ({
        id: String(h.id),
        applicationId: String(h.application_id),
        fromStage: (h.from_stage as string | null) ?? null,
        toStage: String(h.to_stage),
        note: (h.note as string | null) ?? null,
        channel: (h.communication_channel as string | null) ?? null,
        actedBy: (h.acted_by as string | null) ?? null,
        actedAt: String(h.acted_at),
      })),
      offers,
    };
  },
  { auth: { anyCapability: ["recruitment.manage", "recruitment.request"] } },
);

const candidateFields = {
  fullName: z.string().min(2).max(200),
  email: z.string().email().max(200).nullable().optional(),
  phone: z.string().max(40).nullable().optional(),
  nationality: z.string().max(120).nullable().optional(),
  location: z.string().max(120).nullable().optional(),
  qid: z.string().max(40).nullable().optional(),
  visaStatus: z.string().max(80).nullable().optional(),
  noticePeriodDays: z.number().int().min(0).max(365).nullable().optional(),
  expectedSalaryQar: z.number().min(0).max(1_000_000).nullable().optional(),
  experienceYears: z.number().min(0).max(60).nullable().optional(),
  education: z.string().max(200).nullable().optional(),
  skills: z.string().max(4000).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  source: z.enum(HR_CANDIDATE_SOURCES).optional(),
};

export const createCandidate = createAuthenticatedAction(
  z.object({
    ...candidateFields,
    consent: z.literal(true),
    consentNote: z.string().max(500).nullable().optional(),
    vacancyId: z.string().uuid().nullable().optional(),
    cvFilename: z.string().min(1).max(200).nullable().optional(),
    cvDataBase64: z.string().min(10).max(14_000_000).nullable().optional(),
    cvContentType: z.string().max(100).optional(),
    cvText: z.string().max(100_000).nullable().optional(),
  }),
  async (data, context) => {
    assertManage(context);
    if (!data.consent) {
      throw new Error("Consent for storing personal information is required.");
    }

    let cvText = data.cvText ?? null;
    if (data.cvDataBase64 && data.cvContentType) {
      const decoded = decodeTextBase64(data.cvDataBase64, data.cvContentType);
      if (decoded) cvText = decoded.slice(0, 100_000);
    }
    const parsed = parseCvText(cvText);

    const fullName = data.fullName.trim() || parsed.fullName || "Unknown";
    const email = data.email ?? parsed.email;
    const phone = data.phone ?? parsed.phone;
    const skills = data.skills ?? parsed.skillsHint;

    const { data: existing } = await context.supabase
      .from("hr_candidates")
      .select("id, full_name, email, phone, qid, cv_text")
      .order("created_at", { ascending: false })
      .limit(500);
    const duplicates = findDuplicateCandidates({
      email,
      phone,
      qid: data.qid,
      cvText,
      existing: (existing ?? []).map((r) => ({
        id: String(r.id),
        fullName: String(r.full_name),
        email: (r.email as string | null) ?? null,
        phone: (r.phone as string | null) ?? null,
        qid: (r.qid as string | null) ?? null,
        cvText: (r.cv_text as string | null) ?? null,
      })),
    });

    const now = new Date().toISOString();
    const { data: row, error } = await context.supabase
      .from("hr_candidates")
      .insert({
        full_name: fullName,
        email: email ?? null,
        phone: phone ?? null,
        nationality: data.nationality ?? null,
        location: data.location ?? null,
        qid: data.qid ?? null,
        visa_status: data.visaStatus ?? null,
        notice_period_days: data.noticePeriodDays ?? null,
        expected_salary_qar: data.expectedSalaryQar ?? null,
        experience_years: data.experienceYears ?? null,
        education: data.education ?? null,
        skills: skills ?? null,
        notes: data.notes ?? null,
        source: data.source ?? (data.cvDataBase64 ? "cv_upload" : "manual"),
        consent_at: now,
        consent_note: data.consentNote ?? "Consent recorded at candidate create.",
        cv_text: cvText,
        duplicate_of: duplicates[0]?.id ?? null,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw error;

    let cvPath: string | null = null;
    if (data.cvDataBase64 && data.cvFilename) {
      cvPath = await uploadCvBytes(
        context,
        String(row.id),
        data.cvFilename,
        data.cvDataBase64,
        data.cvContentType ?? "application/pdf",
      );
      await context.supabase
        .from("hr_candidates")
        .update({
          cv_path: cvPath,
          cv_file_name: data.cvFilename,
        })
        .eq("id", row.id);
    }

    let applicationId: string | null = null;
    if (data.vacancyId) {
      const applied = await applyCandidateToVacancyInternal(context, {
        candidateId: String(row.id),
        vacancyId: data.vacancyId,
      });
      applicationId = applied.applicationId;
    }

    return {
      id: String(row.id),
      applicationId,
      duplicates,
      parsedFromCv: parsed,
    };
  },
  { auth: { capability: "recruitment.manage" } },
);

export const bulkUploadCandidates = createAuthenticatedAction(
  z.object({
    vacancyId: z.string().uuid().nullable().optional(),
    consent: z.literal(true),
    files: z
      .array(
        z.object({
          filename: z.string().min(1).max(200),
          dataBase64: z.string().min(10).max(14_000_000),
          contentType: z.string().max(100).default("application/pdf"),
          fullName: z.string().min(2).max(200).optional(),
        }),
      )
      .min(1)
      .max(25),
  }),
  async (data, context) => {
    assertManage(context);
    if (!data.consent) throw new Error("Consent for storing personal information is required.");

    const results: Array<{
      filename: string;
      candidateId?: string;
      applicationId?: string | null;
      error?: string;
      duplicates?: ReturnType<typeof findDuplicateCandidates>;
    }> = [];

    for (const file of data.files) {
      try {
        const cvText = decodeTextBase64(file.dataBase64, file.contentType);
        const parsed = parseCvText(cvText);
        const created = await createCandidate({
          fullName: file.fullName ?? parsed.fullName ?? file.filename.replace(/\.[^.]+$/, ""),
          email: parsed.email,
          phone: parsed.phone,
          skills: parsed.skillsHint,
          consent: true,
          consentNote: "Bulk CV upload consent",
          source: "bulk_upload",
          vacancyId: data.vacancyId,
          cvFilename: file.filename,
          cvDataBase64: file.dataBase64,
          cvContentType: file.contentType,
          cvText,
        });
        results.push({
          filename: file.filename,
          candidateId: created.id,
          applicationId: created.applicationId,
          duplicates: created.duplicates,
        });
      } catch (e) {
        results.push({
          filename: file.filename,
          error: e instanceof Error ? e.message : "Upload failed",
        });
      }
    }
    return { results };
  },
  { auth: { capability: "recruitment.manage" } },
);

async function applyCandidateToVacancyInternal(
  context: AuthContext,
  input: { candidateId: string; vacancyId: string },
) {
  const { data: cand, error: cErr } = await context.supabase
    .from("hr_candidates")
    .select("*")
    .eq("id", input.candidateId)
    .maybeSingle();
  if (cErr) throw cErr;
  if (!cand) throw new Error("Candidate not found.");
  if (!cand.consent_at) {
    throw new Error("Candidate consent is required before creating an application.");
  }

  const ctx = await loadVacancyMatchContext(context, input.vacancyId);
  const explanation = scoreCandidateMatch(
    {
      skills: ctx.skills,
      experienceYears: ctx.experienceYears,
      education: ctx.education,
      requiredLocation: ctx.requiredLocation,
      requiresQid: Boolean(ctx.vacancy.requires_qid),
      requiresVisa: Boolean(ctx.vacancy.requires_visa),
      jobDescription: ctx.jobDescription,
    },
    {
      skills: (cand.skills as string | null) ?? null,
      experienceYears: cand.experience_years != null ? Number(cand.experience_years) : null,
      education: (cand.education as string | null) ?? null,
      location: (cand.location as string | null) ?? null,
      qid: (cand.qid as string | null) ?? null,
      visaStatus: (cand.visa_status as string | null) ?? null,
      cvText: (cand.cv_text as string | null) ?? null,
    },
    ctx.weights,
  );

  const now = new Date().toISOString();
  const { data: app, error } = await context.supabase
    .from("hr_applications")
    .insert({
      candidate_id: input.candidateId,
      vacancy_id: input.vacancyId,
      stage: "new",
      match_score: explanation.score,
      match_explanation: explanation as never,
      created_by: context.userId,
      applied_at: now,
      stage_changed_at: now,
    })
    .select("id")
    .single();
  if (error) {
    if (/duplicate|unique/i.test(error.message)) {
      throw new Error("Candidate already applied to this vacancy.");
    }
    throw error;
  }

  await context.supabase.from("hr_application_stage_history").insert({
    application_id: app.id,
    from_stage: null,
    to_stage: "new",
    note: `Application created. Match ${explanation.score}: ${explanation.summary}`,
    communication_channel: "note",
    acted_by: context.userId,
    metadata: { match_score: explanation.score } as never,
  });

  return { applicationId: String(app.id), matchScore: explanation.score, matchExplanation: explanation };
}

export const applyCandidateToVacancy = createAuthenticatedAction(
  z.object({
    candidateId: z.string().uuid(),
    vacancyId: z.string().uuid(),
  }),
  async (data, context) => {
    assertManage(context);
    return applyCandidateToVacancyInternal(context, data);
  },
  { auth: { capability: "recruitment.manage" } },
);

export const recalculateApplicationMatch = createAuthenticatedAction(
  z.object({ applicationId: z.string().uuid() }),
  async (data, context) => {
    assertManage(context);
    const { data: app, error } = await context.supabase
      .from("hr_applications")
      .select("id, candidate_id, vacancy_id")
      .eq("id", data.applicationId)
      .maybeSingle();
    if (error) throw error;
    if (!app) throw new Error("Application not found.");

    const { data: cand } = await context.supabase
      .from("hr_candidates")
      .select("*")
      .eq("id", app.candidate_id)
      .maybeSingle();
    if (!cand) throw new Error("Candidate not found.");

    const ctx = await loadVacancyMatchContext(context, String(app.vacancy_id));
    const explanation = scoreCandidateMatch(
      {
        skills: ctx.skills,
        experienceYears: ctx.experienceYears,
        education: ctx.education,
        requiredLocation: ctx.requiredLocation,
        requiresQid: Boolean(ctx.vacancy.requires_qid),
        requiresVisa: Boolean(ctx.vacancy.requires_visa),
        jobDescription: ctx.jobDescription,
      },
      {
        skills: (cand.skills as string | null) ?? null,
        experienceYears: cand.experience_years != null ? Number(cand.experience_years) : null,
        education: (cand.education as string | null) ?? null,
        location: (cand.location as string | null) ?? null,
        qid: (cand.qid as string | null) ?? null,
        visaStatus: (cand.visa_status as string | null) ?? null,
        cvText: (cand.cv_text as string | null) ?? null,
      },
      ctx.weights,
    );

    const { error: updErr } = await context.supabase
      .from("hr_applications")
      .update({
        match_score: explanation.score,
        match_explanation: explanation as never,
      })
      .eq("id", data.applicationId);
    if (updErr) throw updErr;

    return { matchScore: explanation.score, matchExplanation: explanation };
  },
  { auth: { capability: "recruitment.manage" } },
);

export const changeApplicationStage = createAuthenticatedAction(
  z.object({
    applicationId: z.string().uuid(),
    toStage: z.enum(HR_APPLICATION_STAGES),
    reason: z.string().max(2000).nullable().optional(),
    note: z.string().max(2000).nullable().optional(),
    channel: z.enum(["note", "email", "phone", "in_person", "other"]).optional(),
    /** Must never be used to auto-reject — API refuses (AT#14). */
    basedOnScoreAlone: z.boolean().optional(),
    autoReject: z.boolean().optional(),
  }),
  async (data, context) => {
    assertManage(context);

    const { data: app, error } = await context.supabase
      .from("hr_applications")
      .select("id, stage, match_score, ai_score")
      .eq("id", data.applicationId)
      .maybeSingle();
    if (error) throw error;
    if (!app) throw new Error("Application not found.");

    assertStageChangeAllowed({
      toStage: data.toStage,
      reason: data.reason ?? data.note,
      basedOnScoreAlone: data.basedOnScoreAlone,
      autoReject: data.autoReject,
      matchScore: app.match_score != null ? Number(app.match_score) : null,
      aiScore: app.ai_score != null ? Number(app.ai_score) : null,
    });

    const now = new Date().toISOString();
    const patch: Record<string, unknown> = {
      stage: data.toStage,
      stage_changed_at: now,
      updated_at: now,
    };
    if (data.toStage === "rejected") patch.rejection_reason = data.reason ?? data.note ?? null;
    if (data.toStage === "on_hold") patch.hold_reason = data.reason ?? data.note ?? null;

    const { error: updErr } = await context.supabase
      .from("hr_applications")
      .update(patch)
      .eq("id", data.applicationId);
    if (updErr) throw updErr;

    await context.supabase.from("hr_application_stage_history").insert({
      application_id: data.applicationId,
      from_stage: String(app.stage),
      to_stage: data.toStage,
      note: data.note ?? data.reason ?? null,
      communication_channel: data.channel ?? "note",
      acted_by: context.userId,
      metadata: {
        match_score: app.match_score,
        ai_score: app.ai_score,
      } as never,
    });

    return { ok: true as const, stage: data.toStage };
  },
  { auth: { capability: "recruitment.manage" } },
);

export const addApplicationNote = createAuthenticatedAction(
  z.object({
    applicationId: z.string().uuid(),
    note: z.string().min(1).max(2000),
    channel: z.enum(["note", "email", "phone", "in_person", "other"]).default("note"),
  }),
  async (data, context) => {
    assertManage(context);
    const { data: app, error } = await context.supabase
      .from("hr_applications")
      .select("id, stage")
      .eq("id", data.applicationId)
      .maybeSingle();
    if (error) throw error;
    if (!app) throw new Error("Application not found.");

    const { error: insErr } = await context.supabase.from("hr_application_stage_history").insert({
      application_id: data.applicationId,
      from_stage: String(app.stage),
      to_stage: String(app.stage),
      note: data.note,
      communication_channel: data.channel,
      acted_by: context.userId,
    });
    if (insErr) throw insErr;
    return { ok: true as const };
  },
  { auth: { capability: "recruitment.manage" } },
);

export const listAtsPipeline = createAuthenticatedAction(
  z.object({
    vacancyId: uuidOpt,
    stage: z.enum(HR_APPLICATION_STAGES).nullable().optional(),
    q: z.string().max(200).nullable().optional(),
  }),
  async (data, context) => {
    assertTrack(context);
    const manage = canManageAts(context.roles);
    const viewSalary = canViewSalary(context.roles);

    let q = context.supabase
      .from("hr_applications")
      .select(
        "id, candidate_id, vacancy_id, stage, match_score, match_explanation, ai_score, rejection_reason, hold_reason, applied_at, stage_changed_at, hr_candidates(id, full_name, email, phone, location, nationality, qid, expected_salary_qar, experience_years, skills, consent_at, duplicate_of), hr_vacancies(id, job_title, status, location_id, department_id)",
      )
      .order("stage_changed_at", { ascending: false })
      .limit(300);

    if (data.vacancyId) q = q.eq("vacancy_id", data.vacancyId);
    if (data.stage) q = q.eq("stage", data.stage);

    const { data: rows, error } = await q;
    if (error) {
      if (tableMissing(error.message)) return { stages: HR_APPLICATION_STAGES, applications: [] };
      throw error;
    }

    let applications = (rows ?? []).map((r) => {
      const cand = r.hr_candidates as Record<string, unknown> | null;
      const vac = r.hr_vacancies as {
        id?: string;
        job_title?: string;
        status?: string;
      } | null;
      let candidate = cand
        ? {
            id: String(cand.id),
            fullName: String(cand.full_name),
            email: (cand.email as string | null) ?? null,
            phone: (cand.phone as string | null) ?? null,
            location: (cand.location as string | null) ?? null,
            nationality: (cand.nationality as string | null) ?? null,
            qid: (cand.qid as string | null) ?? null,
            expectedSalaryQar:
              cand.expected_salary_qar != null ? Number(cand.expected_salary_qar) : null,
            experienceYears:
              cand.experience_years != null ? Number(cand.experience_years) : null,
            skills: (cand.skills as string | null) ?? null,
            consentAt: (cand.consent_at as string | null) ?? null,
            duplicateOf: (cand.duplicate_of as string | null) ?? null,
          }
        : null;
      if (candidate) {
        candidate = maskCandidateSalary(candidate, viewSalary);
        if (!manage) candidate = redactCandidatePii(candidate);
      }
      return {
        id: String(r.id),
        candidateId: String(r.candidate_id),
        vacancyId: String(r.vacancy_id),
        stage: String(r.stage) as HrApplicationStage,
        matchScore: r.match_score != null ? Number(r.match_score) : null,
        matchExplanation: (r.match_explanation as Record<string, unknown>) ?? {},
        aiScore: manage && r.ai_score != null ? Number(r.ai_score) : null,
        rejectionReason: (r.rejection_reason as string | null) ?? null,
        holdReason: (r.hold_reason as string | null) ?? null,
        appliedAt: String(r.applied_at),
        stageChangedAt: String(r.stage_changed_at),
        jobTitle: vac?.job_title ?? null,
        vacancyStatus: vac?.status ?? null,
        candidate,
      };
    });

    if (data.q?.trim()) {
      const term = data.q.trim().toLowerCase();
      applications = applications.filter((a) => {
        const name = a.candidate?.fullName?.toLowerCase() ?? "";
        const skills = a.candidate?.skills?.toLowerCase() ?? "";
        const title = a.jobTitle?.toLowerCase() ?? "";
        return name.includes(term) || skills.includes(term) || title.includes(term);
      });
    }

    const byStage = Object.fromEntries(
      HR_APPLICATION_STAGES.map((s) => [s, applications.filter((a) => a.stage === s)]),
    ) as Record<HrApplicationStage, typeof applications>;

    return {
      stages: HR_APPLICATION_STAGES,
      applications,
      byStage,
      canManage: manage,
      canViewSalary: viewSalary,
    };
  },
  { auth: { anyCapability: ["recruitment.manage", "recruitment.request"] } },
);

export const updateVacancyMatchConfig = createAuthenticatedAction(
  z.object({
    vacancyId: z.string().uuid(),
    matchWeights: z
      .object({
        skills: z.number().min(0).max(100).optional(),
        experience: z.number().min(0).max(100).optional(),
        education: z.number().min(0).max(100).optional(),
        location: z.number().min(0).max(100).optional(),
        visa_qid: z.number().min(0).max(100).optional(),
      })
      .optional(),
    requiredLocation: z.string().max(120).nullable().optional(),
    requiresQid: z.boolean().optional(),
    requiresVisa: z.boolean().optional(),
  }),
  async (data, context) => {
    assertManage(context);
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (data.matchWeights) patch.match_weights = mergeMatchWeights(data.matchWeights);
    if (data.requiredLocation !== undefined) patch.required_location = data.requiredLocation;
    if (data.requiresQid !== undefined) patch.requires_qid = data.requiresQid;
    if (data.requiresVisa !== undefined) patch.requires_visa = data.requiresVisa;

    const { error } = await context.supabase
      .from("hr_vacancies")
      .update(patch)
      .eq("id", data.vacancyId);
    if (error) throw error;
    return { ok: true as const };
  },
  { auth: { capability: "recruitment.manage" } },
);

export const createOffer = createAuthenticatedAction(
  z.object({
    applicationId: z.string().uuid(),
    salaryQar: z.number().min(0).max(1_000_000).nullable().optional(),
    joiningDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    notes: z.string().max(2000).nullable().optional(),
    issue: z.boolean().optional(),
  }),
  async (data, context) => {
    assertManage(context);
    if (data.salaryQar != null && !canViewSalary(context.roles)) {
      throw new ForbiddenError("Offer salary requires recruitment.view_salary_budget.");
    }

    const { data: app, error } = await context.supabase
      .from("hr_applications")
      .select("id, stage")
      .eq("id", data.applicationId)
      .maybeSingle();
    if (error) throw error;
    if (!app) throw new Error("Application not found.");

    const now = new Date().toISOString();
    const status = data.issue ? "issued" : "draft";
    const { data: offer, error: insErr } = await context.supabase
      .from("hr_offers")
      .insert({
        application_id: data.applicationId,
        salary_qar: data.salaryQar ?? null,
        joining_date: data.joiningDate ?? null,
        notes: data.notes ?? null,
        status,
        issued_at: data.issue ? now : null,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (insErr) throw insErr;

    const nextStage: HrApplicationStage = data.issue ? "offer_issued" : "offer_pending";
    assertStageChangeAllowed({ toStage: nextStage });
    await context.supabase
      .from("hr_applications")
      .update({ stage: nextStage, stage_changed_at: now })
      .eq("id", data.applicationId);
    await context.supabase.from("hr_application_stage_history").insert({
      application_id: data.applicationId,
      from_stage: String(app.stage),
      to_stage: nextStage,
      note: data.issue ? "Offer issued" : "Offer draft created",
      communication_channel: "note",
      acted_by: context.userId,
    });

    return { id: String(offer.id), status };
  },
  { auth: { capability: "recruitment.manage" } },
);

export const respondToOffer = createAuthenticatedAction(
  z.object({
    offerId: z.string().uuid(),
    action: z.enum(["accepted", "declined", "withdrawn"]),
    declineReason: z.string().max(1000).nullable().optional(),
  }),
  async (data, context) => {
    assertManage(context);
    const { data: offer, error } = await context.supabase
      .from("hr_offers")
      .select("id, application_id, status")
      .eq("id", data.offerId)
      .maybeSingle();
    if (error) throw error;
    if (!offer) throw new Error("Offer not found.");

    const now = new Date().toISOString();
    const { error: updErr } = await context.supabase
      .from("hr_offers")
      .update({
        status: data.action,
        responded_at: now,
        decline_reason: data.action === "declined" ? data.declineReason ?? null : null,
      })
      .eq("id", data.offerId);
    if (updErr) throw updErr;

    const stageMap = {
      accepted: "offer_accepted",
      declined: "offer_declined",
      withdrawn: "on_hold",
    } as const;
    const toStage = stageMap[data.action];
    const { data: app } = await context.supabase
      .from("hr_applications")
      .select("stage")
      .eq("id", offer.application_id)
      .maybeSingle();

    await context.supabase
      .from("hr_applications")
      .update({ stage: toStage, stage_changed_at: now })
      .eq("id", offer.application_id);
    await context.supabase.from("hr_application_stage_history").insert({
      application_id: offer.application_id,
      from_stage: app?.stage ?? null,
      to_stage: toStage,
      note: data.declineReason ?? `Offer ${data.action}`,
      communication_channel: "note",
      acted_by: context.userId,
    });

    return { ok: true as const, stage: toStage };
  },
  { auth: { capability: "recruitment.manage" } },
);

export const parseCvPreview = createAuthenticatedAction(
  z.object({
    text: z.string().max(100_000).optional(),
    dataBase64: z.string().min(10).max(14_000_000).optional(),
    contentType: z.string().max(100).optional(),
  }),
  async (data, context) => {
    assertManage(context);
    let text = data.text ?? null;
    if (!text && data.dataBase64 && data.contentType) {
      text = decodeTextBase64(data.dataBase64, data.contentType);
    }
    return parseCvText(text);
  },
  { auth: { capability: "recruitment.manage" } },
);

void HR_OFFER_STATUSES;
