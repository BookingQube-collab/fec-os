"use server";

import { headers } from "next/headers";
import { z } from "zod";

import { createSafeAuthenticatedAction } from "@/lib/server/create-action";

import { renderCertificatePdf } from "./certificate-pdf";
import { certificateDisplayCode, toPublicCertificateVerification } from "./engine";

const uuid = z.string().uuid();

function throwIf(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

async function verifyOrigin() {
  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
  const proto = headerList.get("x-forwarded-proto") ?? "https";
  if (!host || host.includes(" ") || host.includes("/")) return "";
  return `${proto}://${host}`;
}

export const listTrainingCertificates = createSafeAuthenticatedAction(
  z.object({}).strict(),
  async (_data, context) => {
    const { data, error } = await context.supabase
      .from("training_certificates")
      .select("id, holder_name, course_title, course_code, status, issued_at, valid_until, score, signatory_name, public_token, enrollment_id, path_id")
      .order("issued_at", { ascending: false })
      .limit(100);
    throwIf(error);
    return (data ?? []).map((row) => {
      const pub = toPublicCertificateVerification(row);
      return {
        id: row.id,
        holderName: pub.holderName,
        courseTitle: pub.courseTitle,
        courseCode: row.course_code,
        status: pub.status,
        issuedAt: pub.issuedAt,
        validUntil: pub.validUntil,
        score: row.score,
        signatoryName: row.signatory_name,
        displayCode: certificateDisplayCode(row.public_token),
        enrollmentId: row.enrollment_id,
        pathId: row.path_id,
      };
    });
  },
  { defaultInput: {}, auth: { anyCapability: ["training.learn", "training.certificate.view"] } },
);

export const listCertificateQueue = createSafeAuthenticatedAction(
  z.object({ page: z.number().int().min(1).max(1000) }).strict(),
  async (data, context) => {
    const pageSize = 20;
    const { data: payload, error } = await context.supabase.rpc("training_certificate_queue", {
      _limit: pageSize,
      _offset: (data.page - 1) * pageSize,
    });
    throwIf(error);
    const record = asRecord(payload);
    const rows = Array.isArray(record.rows) ? record.rows : [];
    return {
      page: data.page,
      total: Number(record.total ?? 0),
      rows: rows.map((row) => {
        const item = asRecord(row);
        return {
          enrollmentId: String(item.enrollmentId ?? ""),
          holderName: String(item.holderName ?? ""),
          employeeCode: String(item.employeeCode ?? ""),
          courseTitle: String(item.courseTitle ?? ""),
          courseCode: String(item.courseCode ?? ""),
          completedAt: item.completedAt == null ? null : String(item.completedAt),
        };
      }),
    };
  },
  { auth: { capability: "training.certificate.issue" } },
);

export const issueTrainingCertificate = createSafeAuthenticatedAction(
  z.object({ enrollmentId: uuid }).strict(),
  async (data, context) => {
    const { data: id, error } = await context.supabase.rpc("training_issue_certificate", {
      _enrollment_id: data.enrollmentId,
    });
    throwIf(error);
    if (!id) throw new Error("certificate was not issued");
    return { id };
  },
  { auth: { capability: "training.certificate.issue" } },
);

export const revokeTrainingCertificate = createSafeAuthenticatedAction(
  z.object({ certificateId: uuid, reason: z.string().trim().min(1).max(500) }).strict(),
  async (data, context) => {
    const { error } = await context.supabase.rpc("training_revoke_certificate", {
      _certificate_id: data.certificateId,
      _reason: data.reason,
    });
    throwIf(error);
    return { id: data.certificateId };
  },
  { auth: { capability: "training.certificate.revoke" } },
);

export const downloadTrainingCertificate = createSafeAuthenticatedAction(
  z.object({ certificateId: uuid }).strict(),
  async (data, context) => {
    const { data: row, error } = await context.supabase
      .from("training_certificates")
      .select("id, holder_name, course_title, course_code, issued_at, valid_until, score, signatory_name, public_token, status")
      .eq("id", data.certificateId)
      .maybeSingle();
    throwIf(error);
    if (!row) throw new Error("Certificate not found");
    const displayCode = certificateDisplayCode(row.public_token);
    if (!displayCode) throw new Error("Certificate could not be prepared");
    const origin = await verifyOrigin();
    const pdf = await renderCertificatePdf({
      holderName: row.holder_name,
      courseTitle: row.course_title,
      courseCode: row.course_code,
      issuedAt: row.issued_at,
      validUntil: row.valid_until,
      score: row.score,
      signatoryName: row.signatory_name,
      displayCode,
      verifyUrl: `${origin}/verify/certificate/${row.public_token}`,
    });
    return {
      filename: `${displayCode}.pdf`,
      pdfBase64: Buffer.from(pdf).toString("base64"),
    };
  },
  { auth: { anyCapability: ["training.learn", "training.certificate.view"] } },
);

export const applyTrainingExpiry = createSafeAuthenticatedAction(
  z.object({}).strict(),
  async (_data, context) => {
    const { data, error } = await context.supabase.rpc("training_apply_expiry");
    throwIf(error);
    const record = asRecord(data);
    return {
      expired: Number(record.expired ?? 0),
      notices: Number(record.notices ?? 0),
      retraining: Number(record.retraining ?? 0),
    };
  },
  { defaultInput: {}, auth: { capability: "training.certificate.issue" } },
);
