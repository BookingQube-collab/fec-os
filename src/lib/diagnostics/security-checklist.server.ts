import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  applyDefaultSecurityRemediation,
  resolveSecurityChecklist,
  type EnvFlag,
  type SecurityChecklistReport,
  type SecuritySnapshot,
} from "@/lib/diagnostics/security-checklist";

const SOURCE_MAX_BYTES = 80_000;
const LOCKFILE_MAX_BYTES = 2_000;

const SOURCE_PATHS = {
  auth: "src/lib/server/auth.ts",
  sessionCache: "src/lib/server/session-cache.ts",
  authPage: "src/views/auth-page.tsx",
  cronAuth: "src/lib/server/cron-auth.ts",
  admsAuth: "src/lib/server/adms-auth.ts",
  createAction: "src/lib/server/create-action.ts",
  ingestLog: "src/lib/attendance-ingest-log.ts",
  middleware: "middleware.ts",
  nextConfig: "next.config.ts",
  clientServer: "src/integrations/supabase/client.server.ts",
  rbac: "src/lib/rbac.ts",
  diagnosticsFns: "src/lib/diagnostics.functions.ts",
  fileCrypto: "src/lib/attendance-hr/file-crypto.ts",
  staffLogin: "src/lib/staff-login.ts",
  sessionMiddleware: "src/integrations/supabase/middleware.ts",
} as const;

const SINK_PATHS = [
  SOURCE_PATHS.createAction,
  SOURCE_PATHS.auth,
  SOURCE_PATHS.authPage,
  SOURCE_PATHS.ingestLog,
  SOURCE_PATHS.clientServer,
  SOURCE_PATHS.sessionMiddleware,
  SOURCE_PATHS.middleware,
  SOURCE_PATHS.fileCrypto,
] as const;

function envFlag(names: string[]): EnvFlag {
  for (const name of names) {
    const value = process.env[name];
    if (typeof value === "string" && value.trim().length > 0) return "set";
  }
  return "missing";
}

function clip(buffer: Buffer, maxBytes: number) {
  return buffer.subarray(0, maxBytes).toString("utf8");
}

// A dynamic segment under src/views or src/lib makes the production build trace
// that whole directory. Client views such as arcade supply then land in the
// same graph as this module. Each readFile keeps a fully static path so only
// that file is traced, and the checklist still opens the same sources.
async function readBounded(relativePath: string, maxBytes: number): Promise<string | null> {
  try {
    let buffer: Buffer;
    switch (relativePath) {
      case "src/lib/server/auth.ts":
        buffer = await readFile(path.join(process.cwd(), "src/lib/server/auth.ts"));
        break;
      case "src/lib/server/session-cache.ts":
        buffer = await readFile(path.join(process.cwd(), "src/lib/server/session-cache.ts"));
        break;
      case "src/views/auth-page.tsx":
        buffer = await readFile(path.join(process.cwd(), "src/views/auth-page.tsx"));
        break;
      case "src/lib/server/cron-auth.ts":
        buffer = await readFile(path.join(process.cwd(), "src/lib/server/cron-auth.ts"));
        break;
      case "src/lib/server/adms-auth.ts":
        buffer = await readFile(path.join(process.cwd(), "src/lib/server/adms-auth.ts"));
        break;
      case "src/lib/server/create-action.ts":
        buffer = await readFile(path.join(process.cwd(), "src/lib/server/create-action.ts"));
        break;
      case "src/lib/attendance-ingest-log.ts":
        buffer = await readFile(path.join(process.cwd(), "src/lib/attendance-ingest-log.ts"));
        break;
      case "src/lib/rbac.ts":
        buffer = await readFile(path.join(process.cwd(), "src/lib/rbac.ts"));
        break;
      case "src/lib/diagnostics.functions.ts":
        buffer = await readFile(path.join(process.cwd(), "src/lib/diagnostics.functions.ts"));
        break;
      case "src/lib/attendance-hr/file-crypto.ts":
        buffer = await readFile(path.join(process.cwd(), "src/lib/attendance-hr/file-crypto.ts"));
        break;
      case "src/lib/staff-login.ts":
        buffer = await readFile(path.join(process.cwd(), "src/lib/staff-login.ts"));
        break;
      case "src/integrations/supabase/client.server.ts":
        buffer = await readFile(path.join(process.cwd(), "src/integrations/supabase/client.server.ts"));
        break;
      case "src/integrations/supabase/middleware.ts":
        buffer = await readFile(path.join(process.cwd(), "src/integrations/supabase/middleware.ts"));
        break;
      case "middleware.ts":
        buffer = await readFile(path.join(process.cwd(), "middleware.ts"));
        break;
      case "package-lock.json":
        buffer = await readFile(path.join(process.cwd(), "package-lock.json"));
        break;
      case "next.config.ts": {
        // Tracing a repo-root config pulls the whole project into the bundle.
        const filePath = path.join(/*turbopackIgnore: true*/ process.cwd(), "next.config.ts");
        buffer = await readFile(/*turbopackIgnore: true*/ filePath);
        break;
      }
      default:
        return null;
    }
    return clip(buffer, maxBytes);
  } catch {
    return null;
  }
}

function firstNumber(source: string | null, pattern: RegExp): number | null {
  if (!source) return null;
  const match = source.match(pattern);
  if (!match?.[1]) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

export async function collectSecuritySnapshot(): Promise<SecuritySnapshot> {
  const entries = await Promise.all(
    Object.entries(SOURCE_PATHS).map(async ([key, relativePath]) => {
      const text = await readBounded(relativePath, SOURCE_MAX_BYTES);
      return [key, text] as const;
    }),
  );
  const fileByKey = Object.fromEntries(entries) as Record<keyof typeof SOURCE_PATHS, string | null>;
  const fileByPath = new Map<string, string | null>();
  for (const [key, relativePath] of Object.entries(SOURCE_PATHS) as [keyof typeof SOURCE_PATHS, string][]) {
    fileByPath.set(relativePath, fileByKey[key]);
  }

  const authPage = fileByKey.authPage;
  return {
    env: {
      cronSecret: envFlag(["CRON_SECRET"]),
      admsCommKey: envFlag(["ADMS_COMM_KEY"]),
      fileEncryptionKey: envFlag(["ATTENDANCE_FILE_ENCRYPTION_KEY", "AI_CREDENTIALS_ENCRYPTION_KEY"]),
      serviceRoleKey: envFlag(["SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY"]),
    },
    identityProviderMin: null,
    uiPasswordMin: firstNumber(authPage, /minLength=\{(\d+)\}/),
    staffPasswordMin: firstNumber(fileByKey.staffLogin, /STAFF_LOGIN_PASSWORD_MIN\s*=\s*(\d+)/),
    authPageReadable: authPage != null,
    sources: {
      auth: fileByKey.auth,
      sessionCache: fileByKey.sessionCache,
      authPage,
      cronAuth: fileByKey.cronAuth,
      admsAuth: fileByKey.admsAuth,
      createAction: fileByKey.createAction,
      ingestLog: fileByKey.ingestLog,
      middleware: fileByKey.middleware,
      nextConfig: fileByKey.nextConfig,
      clientServer: fileByKey.clientServer,
      rbac: fileByKey.rbac,
      diagnosticsFns: fileByKey.diagnosticsFns,
      fileCrypto: fileByKey.fileCrypto,
    },
    sinkFiles: SINK_PATHS.map((relativePath) => ({
      name: relativePath,
      text: fileByPath.get(relativePath) ?? null,
    })),
    lockfileText: await readBounded("package-lock.json", LOCKFILE_MAX_BYTES),
    hstsOnResponse: false,
  };
}

export async function runSecurityChecklistReport(ranAt = new Date().toISOString()): Promise<SecurityChecklistReport> {
  const snapshot = await collectSecuritySnapshot();
  return resolveSecurityChecklist(snapshot, applyDefaultSecurityRemediation, ranAt);
}
