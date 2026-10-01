/**
 * Security checklist evaluation. Pure: callers pass observations.
 * A check is "fixed" only when a remediation reports applied and the same check passes again.
 */

export type SecurityCheckStatus = "pass" | "failed" | "fixed" | "not_auto_fixable";

export type SecurityArea =
  | "input"
  | "auth"
  | "rbac"
  | "data"
  | "crypto"
  | "database"
  | "api"
  | "errors"
  | "logging"
  | "dependencies"
  | "code"
  | "operations";

export type EnvFlag = "set" | "missing";

export type SecuritySnapshot = {
  env: {
    cronSecret: EnvFlag;
    admsCommKey: EnvFlag;
    fileEncryptionKey: EnvFlag;
    serviceRoleKey: EnvFlag;
  };
  /** Null when the identity-provider minimum is not visible in this environment. */
  identityProviderMin: number | null;
  uiPasswordMin: number | null;
  staffPasswordMin: number | null;
  authPageReadable: boolean;
  sources: {
    auth: string | null;
    sessionCache: string | null;
    authPage: string | null;
    cronAuth: string | null;
    admsAuth: string | null;
    createAction: string | null;
    ingestLog: string | null;
    middleware: string | null;
    nextConfig: string | null;
    clientServer: string | null;
    rbac: string | null;
    diagnosticsFns: string | null;
    fileCrypto: string | null;
  };
  sinkFiles: { name: string; text: string | null }[];
  lockfileText: string | null;
  /** True only when Strict-Transport-Security was observed on a response. */
  hstsOnResponse: boolean;
};

export type SecurityCheckResult = {
  id: string;
  area: SecurityArea;
  i18nKey: string;
  status: SecurityCheckStatus;
  detailKey: string;
  params: Record<string, string | number>;
};

export type SecurityChecklistReport = {
  ranAt: string;
  checks: SecurityCheckResult[];
  counts: Record<SecurityCheckStatus, number>;
};

export type SecurityRemediation = (
  id: string,
  snapshot: SecuritySnapshot,
) => { applied: boolean; snapshot?: SecuritySnapshot };

type Draft = {
  id: string;
  area: SecurityArea;
  i18nKey: string;
  outcome: "pass" | "fail" | "process";
  autoFixable: boolean;
  detailKey: string;
  blockedDetailKey?: string;
  params: Record<string, string | number>;
};

const PREFIX = "diagnostics.security.checks";

export function applyDefaultSecurityRemediation(
  _id: string,
  _snapshot: SecuritySnapshot,
): { applied: false } {
  return { applied: false };
}

export function resolveSecurityChecklist(
  snapshot: SecuritySnapshot,
  remediate: SecurityRemediation = applyDefaultSecurityRemediation,
  ranAt = new Date().toISOString(),
): SecurityChecklistReport {
  const checks = evaluateSecurityChecklist(snapshot).map((draft) => settle(draft, snapshot, remediate));
  return { ranAt, checks, counts: countStatuses(checks) };
}

export function evaluateSecurityChecklist(snapshot: SecuritySnapshot): Draft[] {
  return [
    passwordPolicy(snapshot),
    zodActions(snapshot),
    sessionCacheKey(snapshot),
    cronSecret(snapshot),
    admsCommKey(snapshot),
    loginRateLimit(snapshot),
    cronLegacyFallback(snapshot),
    admsFailOpen(snapshot),
    rbacMatrix(snapshot),
    crashReportGate(snapshot),
    serviceRole(snapshot),
    fileEncryptionKey(snapshot),
    attendanceCipher(snapshot),
    rlsProcess(),
    actionAuth(snapshot),
    pageHeaders(snapshot),
    apiHeaders(snapshot),
    strictCsp(snapshot),
    hsts(snapshot),
    dbErrors(snapshot),
    ingestPayload(snapshot),
    dependencyAudit(snapshot),
    dangerousSinks(snapshot),
    processItem("threat_model", "threatModel", `${PREFIX}.threatModel.body`),
    processItem("pentest", "pentest", `${PREFIX}.pentest.body`),
    processItem("compliance", "compliance", `${PREFIX}.compliance.body`),
    processItem("firewall", "firewall", `${PREFIX}.firewall.body`),
    processItem("intrusion_detection", "intrusionDetection", `${PREFIX}.intrusionDetection.body`),
    processItem("encrypted_backups", "encryptedBackups", `${PREFIX}.encryptedBackups.body`),
    processItem("tls_host", "tlsHost", `${PREFIX}.tlsHost.body`),
  ];
}

function settle(draft: Draft, snapshot: SecuritySnapshot, remediate: SecurityRemediation): SecurityCheckResult {
  if (draft.outcome === "pass") return toResult(draft, "pass");
  if (draft.outcome === "process" || !draft.autoFixable) return toResult(draft, "not_auto_fixable");

  const fix = remediate(draft.id, snapshot);
  if (!fix.applied) {
    return toResult(
      { ...draft, detailKey: draft.blockedDetailKey ?? draft.detailKey },
      "not_auto_fixable",
    );
  }

  const again = evaluateSecurityChecklist(fix.snapshot ?? snapshot).find((row) => row.id === draft.id);
  if (again?.outcome === "pass") return toResult(again, "fixed");
  return toResult(again ?? draft, "failed");
}

function toResult(draft: Draft, status: SecurityCheckStatus): SecurityCheckResult {
  return {
    id: draft.id,
    area: draft.area,
    i18nKey: draft.i18nKey,
    status,
    detailKey: draft.detailKey,
    params: draft.params,
  };
}

function countStatuses(checks: SecurityCheckResult[]): Record<SecurityCheckStatus, number> {
  return {
    pass: checks.filter((c) => c.status === "pass").length,
    failed: checks.filter((c) => c.status === "failed").length,
    fixed: checks.filter((c) => c.status === "fixed").length,
    not_auto_fixable: checks.filter((c) => c.status === "not_auto_fixable").length,
  };
}

function row(
  id: string,
  area: SecurityArea,
  i18nKey: string,
  outcome: Draft["outcome"],
  detailKey: string,
  params: Record<string, string | number> = {},
  autoFixable = false,
  blockedDetailKey?: string,
): Draft {
  return { id, area, i18nKey, outcome, autoFixable, detailKey, blockedDetailKey, params };
}

function processItem(id: string, i18nKey: string, detailKey: string): Draft {
  return row(id, "operations", i18nKey, "process", detailKey);
}

function fnBody(source: string, signature: string, span = 900): string | null {
  const start = source.indexOf(signature);
  if (start < 0) return null;
  const next = source.indexOf("\nfunction ", start + signature.length);
  const nextExport = source.indexOf("\nexport function ", start + signature.length);
  const cuts = [next, nextExport].filter((n) => n > start);
  const end = cuts.length ? Math.min(...cuts) : start + span;
  return source.slice(start, end);
}

function passwordPolicy(snapshot: SecuritySnapshot): Draft {
  const params = {
    uiMin: snapshot.uiPasswordMin == null ? "unknown" : String(snapshot.uiPasswordMin),
    staffMin: snapshot.staffPasswordMin == null ? "unknown" : String(snapshot.staffPasswordMin),
    idpMin: snapshot.identityProviderMin == null ? "unknown" : String(snapshot.identityProviderMin),
  };
  const key = (name: string) => `${PREFIX}.passwordPolicy.${name}`;
  if (!snapshot.authPageReadable) {
    return row("password_policy", "input", "passwordPolicy", "fail", key("unreadable"), params);
  }
  const ui = snapshot.uiPasswordMin ?? 0;
  const staff = snapshot.staffPasswordMin ?? 0;
  const idp = snapshot.identityProviderMin;
  if (idp != null && idp >= 12 && ui >= 12 && staff >= 12) {
    return row("password_policy", "input", "passwordPolicy", "pass", key("pass"), params);
  }
  if (idp != null && idp < 12) {
    return row("password_policy", "input", "passwordPolicy", "fail", key("serverBelow"), params);
  }
  if (idp != null && idp >= 12 && staff < 12) {
    return row("password_policy", "input", "passwordPolicy", "fail", key("staffBelow"), params);
  }
  if (idp != null && idp >= 12 && ui < 12 && staff >= 12) {
    return row(
      "password_policy",
      "input",
      "passwordPolicy",
      "fail",
      key("canRaise"),
      params,
      true,
      key("notWritten"),
    );
  }
  return row("password_policy", "input", "passwordPolicy", "fail", key("idpOutside"), params);
}

function zodActions(snapshot: SecuritySnapshot): Draft {
  const source = snapshot.sources.createAction;
  const key = (name: string) => `${PREFIX}.zodActions.${name}`;
  if (!source) return row("zod_actions", "input", "zodActions", "fail", key("unreadable"));
  const ok = source.includes("schema.parse") && /from\s+["']zod["']/.test(source);
  return row("zod_actions", "input", "zodActions", ok ? "pass" : "fail", ok ? key("pass") : key("missing"));
}

function tokenPrefix(source: string | null): RegExpMatchArray | null {
  if (!source) return null;
  return source.match(/\.value\.slice\s*\(\s*0\s*,\s*(\d+)\s*\)/);
}

function hashesFullValue(source: string | null): boolean {
  if (!source) return false;
  return /createHash\s*\(|subtle\.digest/.test(source) && /\.update\(/.test(source);
}

function sessionCacheKey(snapshot: SecuritySnapshot): Draft {
  const source = snapshot.sources.auth;
  const cache = snapshot.sources.sessionCache;
  const key = (name: string) => `${PREFIX}.sessionCacheKey.${name}`;
  if (!source && !cache) return row("session_cache_key", "auth", "sessionCacheKey", "fail", key("unreadable"));
  const fingerprint = source ? fnBody(source, "function authTokenFingerprint") : null;
  const prefix = tokenPrefix(fingerprint) ?? tokenPrefix(cache);
  if (prefix) {
    return row("session_cache_key", "auth", "sessionCacheKey", "fail", key("prefix"), {
      length: prefix[1] ?? "unknown",
    });
  }
  if (hashesFullValue(fingerprint)) {
    return row("session_cache_key", "auth", "sessionCacheKey", "pass", key("pass"));
  }
  const delegates = Boolean(fingerprint && /authCookiesCacheKey|sessionCacheKey/.test(fingerprint));
  if (delegates && hashesFullValue(cache)) {
    return row("session_cache_key", "auth", "sessionCacheKey", "pass", key("pass"));
  }
  if (!source) return row("session_cache_key", "auth", "sessionCacheKey", "fail", key("unreadable"));
  if (!fingerprint) return row("session_cache_key", "auth", "sessionCacheKey", "fail", key("unrecognized"));
  return row("session_cache_key", "auth", "sessionCacheKey", "fail", key("unrecognized"));
}

function cronSecret(snapshot: SecuritySnapshot): Draft {
  const key = (name: string) => `${PREFIX}.cronSecret.${name}`;
  const set = snapshot.env.cronSecret === "set";
  return row("cron_secret", "auth", "cronSecret", set ? "pass" : "fail", set ? key("set") : key("missing"));
}

function admsCommKey(snapshot: SecuritySnapshot): Draft {
  const key = (name: string) => `${PREFIX}.admsCommKey.${name}`;
  const set = snapshot.env.admsCommKey === "set";
  return row("adms_comm_key", "auth", "admsCommKey", set ? "pass" : "fail", set ? key("set") : key("missing"));
}

function loginRateLimit(snapshot: SecuritySnapshot): Draft {
  const source = snapshot.sources.authPage;
  const key = (name: string) => `${PREFIX}.loginRateLimit.${name}`;
  if (!snapshot.authPageReadable || !source) {
    return row("login_rate_limit", "auth", "loginRateLimit", "fail", key("unreadable"));
  }
  if (!source.includes("signInWithPassword")) {
    return row("login_rate_limit", "auth", "loginRateLimit", "fail", key("unreadable"));
  }
  const present = /rateLimit|rate-limit|checkRateLimit/.test(source);
  return row("login_rate_limit", "auth", "loginRateLimit", present ? "pass" : "fail", present ? key("present") : key("missing"));
}

function cronLegacyFallback(snapshot: SecuritySnapshot): Draft {
  const source = snapshot.sources.cronAuth;
  const key = (name: string) => `${PREFIX}.cronLegacyFallback.${name}`;
  if (!source) return row("cron_legacy_fallback", "auth", "cronLegacyFallback", "fail", key("unreadable"));
  const present = source.includes("CRON_SECRET") && /get\(\s*["']apikey["']\s*\)/.test(source);
  if (!source.includes("CRON_SECRET")) {
    return row("cron_legacy_fallback", "auth", "cronLegacyFallback", "fail", key("unreadable"));
  }
  return row(
    "cron_legacy_fallback",
    "auth",
    "cronLegacyFallback",
    present ? "fail" : "pass",
    present ? key("present") : key("absent"),
  );
}

function admsFailOpen(snapshot: SecuritySnapshot): Draft {
  const source = snapshot.sources.admsAuth;
  const key = (name: string) => `${PREFIX}.admsFailOpen.${name}`;
  if (!source) return row("adms_fail_open", "auth", "admsFailOpen", "fail", key("unreadable"));
  const body = fnBody(source, "function validateAdmsCommKey", 500);
  if (!body) return row("adms_fail_open", "auth", "admsFailOpen", "fail", key("unreadable"));
  const open = /if\s*\(\s*!expected\s*\)\s*return null/.test(body);
  return row("adms_fail_open", "auth", "admsFailOpen", open ? "fail" : "pass", open ? key("open") : key("closed"));
}

function rbacMatrix(snapshot: SecuritySnapshot): Draft {
  const source = snapshot.sources.rbac;
  const key = (name: string) => `${PREFIX}.rbacMatrix.${name}`;
  if (!source) return row("rbac_matrix", "rbac", "rbacMatrix", "fail", key("unreadable"));
  const ok = source.includes('"admin.diagnostics"') || source.includes("'admin.diagnostics'");
  return row("rbac_matrix", "rbac", "rbacMatrix", ok ? "pass" : "fail", ok ? key("pass") : key("missing"));
}

function crashReportGate(snapshot: SecuritySnapshot): Draft {
  const source = snapshot.sources.diagnosticsFns;
  const key = (name: string) => `${PREFIX}.crashReportGate.${name}`;
  if (!source) return row("crash_report_gate", "rbac", "crashReportGate", "fail", key("unreadable"));
  const start = source.indexOf("export const reportClientCrash");
  if (start < 0) return row("crash_report_gate", "rbac", "crashReportGate", "fail", key("unreadable"));
  const next = source.indexOf("\nexport const ", start + 24);
  const body = source.slice(start, next === -1 ? undefined : next);
  if (/requireRole:\s*false/.test(body)) {
    return row("crash_report_gate", "rbac", "crashReportGate", "fail", key("open"));
  }
  return row("crash_report_gate", "rbac", "crashReportGate", "pass", key("gated"));
}

function serviceRole(snapshot: SecuritySnapshot): Draft {
  const source = snapshot.sources.clientServer;
  const key = (name: string) => `${PREFIX}.serviceRole.${name}`;
  if (!source) return row("service_role", "data", "serviceRole", "fail", key("unreadable"));
  if (/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/.test(source)) {
    return row("service_role", "data", "serviceRole", "fail", key("hardcoded"));
  }
  if (snapshot.env.serviceRoleKey !== "set") {
    return row("service_role", "data", "serviceRole", "fail", key("missing"));
  }
  const fromEnv = /process\.env\.SUPABASE_SERVICE_ROLE_KEY|process\.env\.SUPABASE_SECRET_KEY/.test(source);
  return row("service_role", "data", "serviceRole", fromEnv ? "pass" : "fail", fromEnv ? key("ok") : key("unreadable"));
}

function fileEncryptionKey(snapshot: SecuritySnapshot): Draft {
  const key = (name: string) => `${PREFIX}.fileEncryptionKey.${name}`;
  const set = snapshot.env.fileEncryptionKey === "set";
  return row("file_encryption_key", "crypto", "fileEncryptionKey", set ? "pass" : "fail", set ? key("set") : key("missing"));
}

function attendanceCipher(snapshot: SecuritySnapshot): Draft {
  const source = snapshot.sources.fileCrypto;
  const key = (name: string) => `${PREFIX}.attendanceCipher.${name}`;
  if (!source) return row("attendance_cipher", "crypto", "attendanceCipher", "fail", key("unreadable"));
  if (source.includes("aes-256-gcm")) {
    return row("attendance_cipher", "crypto", "attendanceCipher", "pass", key("pass"));
  }
  if (source.includes("createCipheriv")) {
    return row("attendance_cipher", "crypto", "attendanceCipher", "fail", key("other"));
  }
  return row("attendance_cipher", "crypto", "attendanceCipher", "fail", key("unreadable"));
}

function rlsProcess(): Draft {
  return row("rls", "database", "rls", "process", `${PREFIX}.rls.body`);
}

function actionAuth(snapshot: SecuritySnapshot): Draft {
  const source = snapshot.sources.createAction;
  const key = (name: string) => `${PREFIX}.actionAuth.${name}`;
  if (!source) return row("action_auth", "api", "actionAuth", "fail", key("unreadable"));
  const ok = source.includes("getAuthenticatedContext") && source.includes("enforceActionAuth");
  return row("action_auth", "api", "actionAuth", ok ? "pass" : "fail", ok ? key("pass") : key("missing"));
}

function headerText(snapshot: SecuritySnapshot): string | null {
  if (snapshot.sources.middleware == null && snapshot.sources.nextConfig == null) return null;
  return `${snapshot.sources.middleware ?? ""}\n${snapshot.sources.nextConfig ?? ""}`;
}

function pageHeaders(snapshot: SecuritySnapshot): Draft {
  const key = (name: string) => `${PREFIX}.pageHeaders.${name}`;
  const text = headerText(snapshot);
  if (text == null) return row("page_headers", "api", "pageHeaders", "fail", key("unreadable"));
  const missing: string[] = [];
  if (!text.includes("X-Content-Type-Options")) missing.push("X-Content-Type-Options");
  if (!text.includes("X-Frame-Options") && !text.includes("frame-ancestors")) {
    missing.push("X-Frame-Options or frame-ancestors");
  }
  if (!text.includes("Referrer-Policy")) missing.push("Referrer-Policy");
  if (!text.includes("Content-Security-Policy")) missing.push("Content-Security-Policy");
  if (missing.length === 0) return row("page_headers", "api", "pageHeaders", "pass", key("pass"));
  return row("page_headers", "api", "pageHeaders", "fail", key("gap"), { missing: missing.join(", ") });
}

function apiHeaders(snapshot: SecuritySnapshot): Draft {
  const key = (name: string) => `${PREFIX}.apiHeaders.${name}`;
  const source = snapshot.sources.middleware;
  if (!source) return row("api_headers", "api", "apiHeaders", "fail", key("unreadable"));
  const matcherAt = source.indexOf("matcher:");
  if (matcherAt < 0) return row("api_headers", "api", "apiHeaders", "fail", key("unreadable"));
  const matcher = source.slice(matcherAt, matcherAt + 700);
  const skipped = matcher.includes("api/");
  return row("api_headers", "api", "apiHeaders", skipped ? "fail" : "pass", skipped ? key("skipped") : key("pass"));
}

function strictCsp(snapshot: SecuritySnapshot): Draft {
  const key = (name: string) => `${PREFIX}.strictCsp.${name}`;
  const text = headerText(snapshot);
  if (text == null) return row("strict_csp", "api", "strictCsp", "fail", key("missing"));
  const present = text.includes("script-src");
  return row("strict_csp", "api", "strictCsp", present ? "pass" : "fail", present ? key("pass") : key("missing"));
}

function hsts(snapshot: SecuritySnapshot): Draft {
  const key = (name: string) => `${PREFIX}.hsts.${name}`;
  const text = headerText(snapshot) ?? "";
  if (snapshot.hstsOnResponse || text.includes("Strict-Transport-Security")) {
    return row("hsts", "api", "hsts", "pass", key("pass"));
  }
  return row("hsts", "api", "hsts", "fail", key("host"));
}

function dbErrors(snapshot: SecuritySnapshot): Draft {
  const source = snapshot.sources.createAction;
  const key = (name: string) => `${PREFIX}.dbErrors.${name}`;
  if (!source) return row("db_errors", "errors", "dbErrors", "fail", key("unreadable"));
  const body = fnBody(source, "function errorMessage", 1200);
  if (!body) return row("db_errors", "errors", "dbErrors", "fail", key("unreadable"));
  const leaks = /details/.test(body) && /return/.test(body);
  return row("db_errors", "errors", "dbErrors", leaks ? "fail" : "pass", leaks ? key("leak") : key("pass"));
}

function ingestPayload(snapshot: SecuritySnapshot): Draft {
  const source = snapshot.sources.ingestLog;
  const key = (name: string) => `${PREFIX}.ingestPayload.${name}`;
  if (!source) return row("ingest_payload", "logging", "ingestPayload", "fail", key("unreadable"));
  if (/payload:\s*input\.payload\b/.test(source)) {
    return row("ingest_payload", "logging", "ingestPayload", "fail", key("raw"));
  }
  if (source.includes("logAttendanceIngestHit")) {
    return row("ingest_payload", "logging", "ingestPayload", "pass", key("pass"));
  }
  return row("ingest_payload", "logging", "ingestPayload", "fail", key("unreadable"));
}

function dependencyAudit(snapshot: SecuritySnapshot): Draft {
  const key = (name: string) => `${PREFIX}.dependencyAudit.${name}`;
  if (!snapshot.lockfileText) {
    return row("dependency_audit", "dependencies", "dependencyAudit", "fail", key("unreadable"));
  }
  const version = snapshot.lockfileText.match(/"lockfileVersion"\s*:\s*(\d+)/);
  return row("dependency_audit", "dependencies", "dependencyAudit", "fail", key("lockfile"), {
    version: version?.[1] ?? "unknown",
  });
}

function dangerousSinks(snapshot: SecuritySnapshot): Draft {
  const key = (name: string) => `${PREFIX}.dangerousSinks.${name}`;
  if (snapshot.sinkFiles.length === 0 || snapshot.sinkFiles.every((file) => file.text == null)) {
    return row("dangerous_sinks", "code", "dangerousSinks", "fail", key("unreadable"));
  }
  const found = snapshot.sinkFiles.filter((file) => file.text && /\beval\s*\(|new\s+Function\s*\(/.test(file.text));
  if (found.length) {
    return row("dangerous_sinks", "code", "dangerousSinks", "fail", key("found"), {
      files: found.map((file) => file.name).join(", "),
    });
  }
  const unread = snapshot.sinkFiles.filter((file) => file.text == null).length;
  if (unread > 0) return row("dangerous_sinks", "code", "dangerousSinks", "fail", key("unreadable"));
  return row("dangerous_sinks", "code", "dangerousSinks", "pass", key("pass"), {
    count: snapshot.sinkFiles.length,
  });
}

export function blankSecuritySnapshot(overrides: Partial<SecuritySnapshot> = {}): SecuritySnapshot {
  return {
    identityProviderMin: null,
    uiPasswordMin: null,
    staffPasswordMin: null,
    authPageReadable: false,
    sinkFiles: [],
    lockfileText: null,
    hstsOnResponse: false,
    ...overrides,
    env: { ...blankEnv(), ...overrides.env },
    sources: { ...blankSources(), ...overrides.sources },
  };
}

function blankEnv(): SecuritySnapshot["env"] {
  return {
    cronSecret: "missing",
    admsCommKey: "missing",
    fileEncryptionKey: "missing",
    serviceRoleKey: "missing",
  };
}

function blankSources(): SecuritySnapshot["sources"] {
  return {
    auth: null,
    sessionCache: null,
    authPage: null,
    cronAuth: null,
    admsAuth: null,
    createAction: null,
    ingestLog: null,
    middleware: null,
    nextConfig: null,
    clientServer: null,
    rbac: null,
    diagnosticsFns: null,
    fileCrypto: null,
  };
}
